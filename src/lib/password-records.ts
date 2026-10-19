import { randomHex, toHex, secureCompare } from './session-crypto.js';
import { storedField } from './stored-values.js';
export const PASSWORD_HASH_VERSION = 'pbkdf2-sha256';
export const PASSWORD_HASH_ITERATIONS = 100000;
export async function pbkdf2Hex(password: unknown, salt: unknown, iterations = PASSWORD_HASH_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password || '')),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(String(salt || '')),
      iterations,
    },
    keyMaterial,
    256
  );
  return toHex(derived);
}

export interface PasswordRecord {
  version: typeof PASSWORD_HASH_VERSION;
  iterations: number;
  salt: string;
  hash: string;
}
export async function createPasswordRecord(password: unknown): Promise<PasswordRecord> {
  const salt = randomHex(16);
  return {
    version: PASSWORD_HASH_VERSION,
    iterations: PASSWORD_HASH_ITERATIONS,
    salt,
    hash: await pbkdf2Hex(password, salt, PASSWORD_HASH_ITERATIONS),
  };
}

export function parsePasswordRecord(value: unknown): object | null {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function verifyPasswordRecord(password: unknown, record: unknown) {
  const parsed = parsePasswordRecord(record);
  if (
    !parsed ||
    storedField(parsed, 'version') !== PASSWORD_HASH_VERSION ||
    !storedField(parsed, 'salt') ||
    !storedField(parsed, 'hash')
  )
    return false;
  const submitted = await pbkdf2Hex(
    password,
    storedField(parsed, 'salt'),
    Number(storedField(parsed, 'iterations') || PASSWORD_HASH_ITERATIONS)
  );
  return secureCompare(submitted, storedField(parsed, 'hash'));
}
