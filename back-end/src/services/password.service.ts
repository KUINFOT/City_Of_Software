import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(nodeScrypt);
const KEY_LENGTH = 64;

/** Store password hashes as `scrypt$<salt>$<derived-key>`; never persist plaintext passwords. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString('base64url')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, encodedKey, ...extra] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !encodedKey || extra.length > 0) return false;

  try {
    const storedKey = Buffer.from(encodedKey, 'base64url');
    const derivedKey = (await scrypt(password, salt, storedKey.length)) as Buffer;
    return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
  } catch {
    return false;
  }
}
