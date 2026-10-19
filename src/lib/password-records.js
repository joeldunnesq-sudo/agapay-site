// Generated from src/lib/password-records.ts by npm run build:server. Do not edit.
import { randomHex, toHex, secureCompare } from './session-crypto.js';
import { storedField } from './stored-values.js';
const PASSWORD_HASH_VERSION = 'pbkdf2-sha256';
const PASSWORD_HASH_ITERATIONS = 1e5;
async function pbkdf2Hex(password, salt, iterations = PASSWORD_HASH_ITERATIONS) {
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
async function createPasswordRecord(password) {
  const salt = randomHex(16);
  return {
    version: PASSWORD_HASH_VERSION,
    iterations: PASSWORD_HASH_ITERATIONS,
    salt,
    hash: await pbkdf2Hex(password, salt, PASSWORD_HASH_ITERATIONS),
  };
}
function parsePasswordRecord(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
async function verifyPasswordRecord(password, record) {
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
export {
  PASSWORD_HASH_ITERATIONS,
  PASSWORD_HASH_VERSION,
  createPasswordRecord,
  parsePasswordRecord,
  pbkdf2Hex,
  verifyPasswordRecord,
};
