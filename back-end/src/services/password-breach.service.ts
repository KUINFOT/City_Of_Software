import { createHash } from 'node:crypto';

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const REQUEST_TIMEOUT_MS = 5_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type PasswordScreeningResult = 'accepted' | 'rejected' | 'unavailable';

function sha1(password: string): string {
  return createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
}

/**
 * Uses HIBP's range API: only five characters of a SHA-1 digest leave this
 * process, never the password or its complete digest. A non-200 response is
 * intentionally an error rather than evidence that a password is safe.
 */
export async function isPasswordBreached(password: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  const digest = sha1(password);
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  const response = await fetchImpl(`${RANGE_URL}${prefix}`, {
    headers: {
      Accept: 'text/plain',
      'Add-Padding': 'true',
      'User-Agent': 'CityOfSoftware/1.0 password-security-check',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Password screening returned HTTP ${response.status}.`);

  const matches = await response.text();
  return matches.split(/\r?\n/).some((line) => {
    const [candidate] = line.split(':', 1);
    return candidate?.trim().toUpperCase() === suffix;
  });
}

/** Fail closed if the breach-password service cannot be reached. */
export async function screenPassword(password: string, fetchImpl: FetchLike = fetch): Promise<PasswordScreeningResult> {
  try {
    return await isPasswordBreached(password, fetchImpl) ? 'rejected' : 'accepted';
  } catch {
    return 'unavailable';
  }
}
