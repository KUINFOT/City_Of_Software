/**
 * Polite HTTP client shared by every adapter.
 *
 * Four behaviours here are non-negotiable and come straight from the
 * extraction playbook:
 *
 *  1. **Honest User-Agent.** Every request identifies the project and gives
 *     a contact route. No pretending to be a browser.
 *  2. **Per-host rate limiting.** Requests to one host are serialised with a
 *     delay between them (default 1s, raised if robots.txt asks for more).
 *     Different hosts run independently.
 *  3. **robots.txt is checked on downloads too, not just page fetches.**
 *     BMA's old CMS allows crawling its listing pages but disallows the
 *     `/upload/` path its PDFs live under. Checking only page fetches
 *     downloads files the site asked you not to.
 *  4. **Broken TLS chains get a retry, not a crash.** Several `.go.th` hosts
 *     (confirmed: dft.go.th) serve incomplete certificate chains. Since this
 *     is public data behind no login, the fallback re-requests with
 *     verification off rather than dropping the record — and flags that it
 *     did so, so it lands in the job log instead of passing silently.
 */

import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import { RobotsCache } from './robots';
import type { Logger } from './logger';

export const DEFAULT_USER_AGENT =
  'city-of-software-procurement-bot/1.0 (+https://github.com/KUINFOT/City_Of_Software; contact via repository owner)';

/** Node surfaces TLS chain problems under these codes. */
const TLS_ERROR_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_UNTRUSTED',
]);

const TRANSIENT_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export class RobotsDisallowedError extends Error {
  constructor(public readonly url: string) {
    super(`robots.txt disallows fetching: ${url}`);
    this.name = 'RobotsDisallowedError';
  }
}

export class HttpStatusError extends Error {
  constructor(public readonly url: string, public readonly status: number) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpStatusError';
  }
}

export interface HttpResponse<T> {
  /** URL after redirects. MOC needs this to resolve links on the page it landed on. */
  finalUrl: string;
  status: number;
  body: T;
  /** True when the request only succeeded with TLS verification disabled. */
  insecure: boolean;
}

export interface HttpClientOptions {
  userAgent?: string;
  /** Minimum gap between requests to the same host. */
  delayMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  logger?: Logger;
  /** Only ever set false for a host cleared by other means; see registry.ts. */
  respectRobots?: boolean;
}

export class HttpClient {
  readonly userAgent: string;
  private readonly baseDelayMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly respectRobots: boolean;
  private readonly logger?: Logger;
  private readonly robots: RobotsCache;
  /** host -> tail of that host's request chain, keeping requests serialised. */
  private readonly hostQueues = new Map<string, Promise<unknown>>();

  constructor(options: HttpClientOptions = {}) {
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.baseDelayMs = options.delayMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.respectRobots = options.respectRobots ?? true;
    this.logger = options.logger;
    this.robots = new RobotsCache(this.userAgent);
  }

  async getText(url: string, init: RequestInit = {}): Promise<HttpResponse<string>> {
    return this.request(url, init, decodeBody);
  }

  async getJson<T = unknown>(url: string, init: RequestInit = {}): Promise<HttpResponse<T>> {
    const res = await this.request(url, init, decodeBody);
    return { ...res, body: JSON.parse(res.body) as T };
  }

  /** POST an `application/x-www-form-urlencoded` body — MOC's AJAX endpoint. */
  async postForm<T = unknown>(
    url: string,
    fields: Record<string, string | number>
  ): Promise<HttpResponse<T>> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) params.set(key, String(value));
    const res = await this.request(
      url,
      {
        method: 'POST',
        body: params.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
      },
      decodeBody
    );
    return { ...res, body: JSON.parse(res.body) as T };
  }

  /** Binary fetch for attachments. Same robots gate as page fetches. */
  async getBuffer(url: string): Promise<HttpResponse<Buffer>> {
    return this.request(url, {}, async (res) => Buffer.from(await res.arrayBuffer()));
  }

  /** Exposed so the runner can pre-flight a source before opening a job. */
  async isAllowed(url: string): Promise<boolean> {
    if (!this.respectRobots) return true;
    return this.robots.isAllowed(url);
  }

  private request<T>(
    url: string,
    init: RequestInit,
    decode: (res: Response) => Promise<T>
  ): Promise<HttpResponse<T>> {
    const host = new URL(url).host;
    const run = async (): Promise<HttpResponse<T>> => {
      await this.gate(url);
      return this.attempt(url, init, decode);
    };
    // Chain onto this host's queue so concurrent adapters can't burst it.
    const previous = this.hostQueues.get(host) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(run);
    this.hostQueues.set(
      host,
      next.catch(() => undefined)
    );
    return next;
  }

  /** robots.txt check plus the polite delay, before any request goes out. */
  private async gate(url: string): Promise<void> {
    let delay = this.baseDelayMs;
    if (this.respectRobots) {
      const policy = await this.robots.policyFor(url);
      if (!policy.isAllowed(new URL(url).pathname)) throw new RobotsDisallowedError(url);
      // A site asking for a longer crawl-delay gets it; a shorter one does
      // not let us speed past our own floor.
      const requested = policy.crawlDelayMs();
      if (requested != null) delay = Math.max(delay, requested);
    }
    await sleep(delay);
  }

  private async attempt<T>(
    url: string,
    init: RequestInit,
    decode: (res: Response) => Promise<T>,
    attemptNo = 1
  ): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': this.userAgent,
          'Accept-Language': 'th,en;q=0.8',
          ...(init.headers as Record<string, string> | undefined),
        },
      });

      if (res.status >= 500 && attemptNo <= this.maxRetries) {
        await sleep(backoffMs(attemptNo));
        return this.attempt(url, init, decode, attemptNo + 1);
      }
      if (!res.ok) throw new HttpStatusError(url, res.status);

      return {
        finalUrl: res.url || url,
        status: res.status,
        body: await decode(res),
        insecure: false,
      };
    } catch (err) {
      if (err instanceof HttpStatusError || err instanceof RobotsDisallowedError) throw err;

      if (isTlsChainError(err)) {
        this.logger?.warn(
          `TLS chain could not be verified for ${url} — retrying without verification ` +
            '(public data, no login involved)'
        );
        const raw = await insecureGet(url, this.userAgent, this.timeoutMs);
        return {
          finalUrl: raw.finalUrl,
          status: raw.status,
          body: await decode(toResponseLike(raw)),
          insecure: true,
        };
      }
      if (isTransient(err) && attemptNo <= this.maxRetries) {
        await sleep(backoffMs(attemptNo));
        return this.attempt(url, init, decode, attemptNo + 1);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

function backoffMs(attemptNo: number): number {
  return Math.min(8000, 500 * 2 ** (attemptNo - 1));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code ?? e?.cause?.code;
}

function isTlsChainError(err: unknown): boolean {
  const code = errorCode(err);
  return code != null && TLS_ERROR_CODES.has(code);
}

function isTransient(err: unknown): boolean {
  const code = errorCode(err);
  if (code != null && TRANSIENT_ERROR_CODES.has(code)) return true;
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Decode a response body using the charset the server declares. Several Thai
 * government CMSes still serve windows-874/TIS-620 rather than UTF-8; reading
 * those as UTF-8 turns every Thai keyword into replacement characters, which
 * breaks classification silently instead of throwing.
 */
async function decodeBody(res: Response): Promise<string> {
  const contentType = res.headers.get('content-type') ?? '';
  const declared = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase();
  const buffer = Buffer.from(await res.arrayBuffer());

  const charset = normalizeCharset(declared);
  if (charset && charset !== 'utf-8') {
    try {
      return new TextDecoder(charset).decode(buffer);
    } catch {
      // Unknown label — fall through to UTF-8 rather than failing the row.
    }
  }
  return buffer.toString('utf8');
}

function normalizeCharset(label: string | undefined): string | undefined {
  if (!label) return undefined;
  // TIS-620 and ISO-8859-11 cover the same repertoire as windows-874 for our
  // purposes, and only the last label is registered with TextDecoder.
  if (['tis-620', 'iso-8859-11', 'windows-874', 'cp874'].includes(label)) return 'windows-874';
  return label;
}

interface RawResponse {
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

/**
 * GET with certificate verification disabled, following redirects by hand.
 *
 * Only reachable from the TLS-chain fallback above. Built on `node:https` so
 * verification is switched off for exactly one request rather than process
 * wide — never set NODE_TLS_REJECT_UNAUTHORIZED to achieve this.
 */
function insecureGet(
  url: string,
  userAgent: string,
  timeoutMs: number,
  redirectsLeft = 5
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === 'http:' ? http : https;
    const req = transport.request(
      target,
      {
        method: 'GET',
        headers: { 'User-Agent': userAgent, 'Accept-Language': 'th,en;q=0.8' },
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects following ${url}`));
            return;
          }
          resolve(
            insecureGet(
              new URL(location, target).toString(),
              userAgent,
              timeoutMs,
              redirectsLeft - 1
            )
          );
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          if (status >= 400) {
            reject(new HttpStatusError(url, status));
            return;
          }
          resolve({
            finalUrl: url,
            status,
            headers: Object.fromEntries(
              Object.entries(res.headers).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(', ') : String(v ?? ''),
              ])
            ),
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error(`Timed out after ${timeoutMs}ms: ${url}`)));
    req.on('error', reject);
    req.end();
  });
}

/** Wrap a raw node:https result so one set of decoders serves both paths. */
function toResponseLike(raw: RawResponse): Response {
  return new Response(new Uint8Array(raw.body), { status: raw.status, headers: raw.headers });
}
