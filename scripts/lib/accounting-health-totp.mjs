import { createHmac } from 'node:crypto';

// The same six-digit, SHA-1, 30-second authenticator format used by AGAPAY.
// The caller must never log the setup key or generated code.
export function accountingHealthTotp(secret, atMs = Date.now()) {
  const normalized = String(secret || '')
    .replace(/\s/g, '')
    .toUpperCase()
    .replace(/=+$/, '');
  if (!/^[A-Z2-7]{16,128}$/.test(normalized)) throw new Error('Invalid authenticator setup key.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = [];
  let bits = 0;
  let buffer = 0;
  for (const letter of normalized) {
    buffer = (buffer << 5) | alphabet.indexOf(letter);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
