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
 *  4. **Safe public destinations only.** Every URL and every redirect target
 *     is checked before connecting. Private networks, unsupported schemes,
 *     credential-bearing URLs, and non-standard ports are rejected.
 */

import { URL } from 'node:url';
import { RobotsCache } from './robots';
import { assertSafeExternalUrl } from './urlSafety';

export const DEFAULT_USER_AGENT =
  'city-of-software-procurement-bot/1.0 (+https://github.com/KUINFOT/City_Of_Software; contact via repository owner)';

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
  /** Retained for historical extraction records. New requests always verify TLS. */
  insecure: boolean;
}

export interface HttpClientOptions {
  userAgent?: string;
  /** Minimum gap between requests to the same host. */
  delayMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** Only ever set false for a host cleared by other means; see registry.ts. */
  respectRobots?: boolean;
}

export class HttpClient {
  readonly userAgent: string;
  private readonly baseDelayMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly respectRobots: boolean;
  private readonly robots: RobotsCache;
  /** host -> tail of that host's request chain, keeping requests serialised. */
  private readonly hostQueues = new Map<string, Promise<unknown>>();

  constructor(options: HttpClientOptions = {}) {
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.baseDelayMs = options.delayMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.respectRobots = options.respectRobots ?? true;
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

  private async request<T>(
    url: string,
    init: RequestInit,
    decode: (res: Response) => Promise<T>
  ): Promise<HttpResponse<T>> {
    const host = new URL(url).host;
    const run = async (): Promise<HttpResponse<T>> => {
      await assertSafeExternalUrl(url);
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
      const res = await fetchWithSafeRedirects(url, {
        ...init,
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

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

/** Follow redirects ourselves so every destination is validated before fetch. */
async function fetchWithSafeRedirects(url: string, init: RequestInit): Promise<Response> {
  let target = url;
  let method = init.method ?? 'GET';
  let body = init.body;
  let headers = new Headers(init.headers);

  for (let redirects = 0; ; redirects += 1) {
    const safeTarget = await assertSafeExternalUrl(target);
    const response = await fetch(safeTarget, {
      ...init,
      method,
      body,
      headers,
      redirect: 'manual',
    });
    if (!REDIRECT_STATUS.has(response.status)) return response;

    const location = response.headers.get('location');
    if (!location) return response;
    if (redirects >= MAX_REDIRECTS) throw new Error(`Too many redirects following ${url}`);

    target = new URL(location, safeTarget).toString();
    // Match browser semantics for redirects that do not preserve a request body.
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
      method = 'GET';
      body = undefined;
      headers = new Headers(headers);
      headers.delete('content-type');
      headers.delete('content-length');
    }
  }
}
