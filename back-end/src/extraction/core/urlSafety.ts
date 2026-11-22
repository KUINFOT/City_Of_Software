/**
 * Outbound URL guard for the extraction pipeline.
 *
 * The pipeline follows links discovered in public pages, so a malformed or
 * hostile link must never be able to make the server request its own network.
 * Every hop is restricted to public HTTP(S) hosts before a connection starts.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const ALLOWED_PORTS = new Set(['', '80', '443']);

export class UnsafeExternalUrlError extends Error {
  constructor(public readonly url: string, reason: string) {
    super(`Unsafe external URL (${reason}): ${url}`);
    this.name = 'UnsafeExternalUrlError';
  }
}

export type AddressResolver = (hostname: string) => Promise<string[]>;

/** DNS resolver kept injectable so the safety policy has deterministic tests. */
export const resolveAddresses: AddressResolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
};

/**
 * Accept only public HTTP(S) URLs. DNS is deliberately resolved before every
 * request, and *all* answers must be public to prevent a mixed DNS response
 * from smuggling a request onto a private address.
 */
export async function assertSafeExternalUrl(
  input: string | URL,
  resolver: AddressResolver = resolveAddresses
): Promise<URL> {
  const text = input.toString();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UnsafeExternalUrlError(text, 'invalid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeExternalUrlError(text, 'only HTTP(S) is allowed');
  }
  if (url.username || url.password) {
    throw new UnsafeExternalUrlError(text, 'embedded credentials are not allowed');
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new UnsafeExternalUrlError(text, 'only ports 80 and 443 are allowed');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new UnsafeExternalUrlError(text, 'localhost is not a public host');
  }

  const literalVersion = isIP(hostname);
  const addresses = literalVersion ? [hostname] : await resolver(hostname);
  if (addresses.length === 0) {
    throw new UnsafeExternalUrlError(text, 'hostname did not resolve');
  }
  const privateAddress = addresses.find((address) => !isPublicAddress(address));
  if (privateAddress) {
    throw new UnsafeExternalUrlError(text, `resolved to non-public address ${privateAddress}`);
  }

  return url;
}

/** Exposed for regression tests and for review of the boundary rules. */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const [first, second] = address.split('.').map(Number);

  // RFC 1918, loopback, link-local, CGNAT, benchmarking, documentation,
  // multicast and reserved ranges are never valid destinations for a crawler.
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && (second === 0 || second === 168)) return false;
  if (first === 198 && (second === 18 || second === 19 || second === 51)) return false;
  if (first === 203 && second === 0) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const bytes = ipv6Bytes(address);
  if (!bytes) return false;

  const allZero = bytes.every((byte) => byte === 0);
  const loopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  if (allZero || loopback) return false;
  if ((bytes[0] & 0xfe) === 0xfc) return false; // fc00::/7 unique local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false; // fe80::/10 link local
  if (bytes[0] === 0xff) return false; // multicast
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
    return false; // 2001:db8::/32 documentation
  }

  // IPv4-compatible / IPv4-mapped forms can otherwise bypass the IPv4 list.
  const isV4Compatible = bytes.slice(0, 12).every((byte) => byte === 0);
  const isV4Mapped = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (isV4Compatible || isV4Mapped) {
    return isPublicIpv4(bytes.slice(12).join('.'));
  }

  // 6to4 embeds an IPv4 destination in bytes 2–5.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return isPublicIpv4(bytes.slice(2, 6).join('.'));
  return true;
}

function ipv6Bytes(input: string): number[] | null {
  const address = input.toLowerCase();
  const [left, right] = address.split('::');
  if (address.split('::').length > 2) return null;

  const parsePart = (part: string): string[] => (part ? part.split(':') : []);
  const leftParts = parsePart(left);
  const rightParts = parsePart(right ?? '');
  const tail = rightParts[rightParts.length - 1] ?? leftParts[leftParts.length - 1];
  const hasV4Tail = tail?.includes('.') ?? false;

  const groups = [...leftParts, ...rightParts];
  if (hasV4Tail) {
    const dotted = groups.pop();
    if (!dotted || isIP(dotted) !== 4) return null;
    const values = dotted.split('.').map(Number);
    groups.push(((values[0] << 8) | values[1]).toString(16));
    groups.push(((values[2] << 8) | values[3]).toString(16));
  }
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;

  const zeroGroups = 8 - groups.length;
  if ((address.includes('::') && zeroGroups < 1) || (!address.includes('::') && zeroGroups !== 0)) return null;
  const expanded = address.includes('::')
    ? [...leftParts, ...Array(zeroGroups).fill('0'), ...rightParts]
    : groups;

  // Replace an embedded IPv4 tail in the expanded list with its two groups.
  const normalized: string[] = [];
  for (const group of expanded) {
    if (!group.includes('.')) {
      normalized.push(group);
      continue;
    }
    const values = group.split('.').map(Number);
    if (values.length !== 4 || values.some((value: number) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
    normalized.push(((values[0] << 8) | values[1]).toString(16), ((values[2] << 8) | values[3]).toString(16));
  }
  if (normalized.length !== 8) return null;
  return normalized.flatMap((group) => {
    const value = Number.parseInt(group, 16);
    return [value >> 8, value & 0xff];
  });
}
