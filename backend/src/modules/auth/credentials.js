import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const options = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const dummyHash = randomBytes(48).toString('hex');

export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[!-~]+@[!-~]+\.[!-~]+$/.test(email)
    && email.split('@').length === 2 ? email : null;
}

export function passwordLength(value) {
  return typeof value === 'string' ? Array.from(value).length : 0;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 32, options);
  return Buffer.concat([salt, hash]).toString('hex');
}

export async function verifyPassword(password, storedHash) {
  const bytes = Buffer.from(storedHash ?? dummyHash, 'hex');
  const actual = await derive(password, bytes.subarray(0, 16), 32, options);
  return timingSafeEqual(bytes.subarray(16), actual) && Boolean(storedHash);
}

export const newToken = () => randomBytes(32).toString('base64url');
export const validToken = token => typeof token === 'string' && /^[\w-]{43}$/.test(token);
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
