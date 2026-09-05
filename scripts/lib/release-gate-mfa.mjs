import { createCipheriv, createHmac, publicEncrypt, randomBytes } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';

export function gateMfaSecretName(kind, identity, env = process.env) {
  const field = kind === 'USER' ? 'EMAIL' : 'ID';
  const side = ['A', 'B'].find((value) =>
    String(env[`ACCOUNTING_GATE_${kind}_${value}_${field}`] || '').toLowerCase() === String(identity).toLowerCase());
  if (!side) throw new Error('MFA principal is outside the configured release-gate identities.');
  return `ACCOUNTING_GATE_${kind}_${side}_TOTP_SECRET`;
}

export function gateTotp(secret, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = String(secret).replace(/\s|=+$/g, '').toUpperCase();
  if (!/^[A-Z2-7]{16,}$/.test(normalized)) throw new Error('Invalid release-gate TOTP configuration.');
  let bits = '';
  for (const char of normalized) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) || []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

export function encryptGateCredential(publicKey, value) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    version: 1,
    key: publicEncrypt({ key: publicKey, oaepHash: 'sha256' }, key).toString('base64'),
    iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export async function completeGateMfa({ baseUrl, payload, secretName, env = process.env, fetchImpl = fetch }) {
  if (!payload?.mfaRequired) return payload;
  const target = new URL(baseUrl);
  if (target.protocol !== 'https:' || target.hostname !== 'agapay-site-staging.joeldunnesq.workers.dev') {
    throw new Error('Automated release-gate MFA is restricted to the dedicated staging origin.');
  }
  if (!/^ACCOUNTING_GATE_(USER|PARISH)_[AB]_TOTP_SECRET$/.test(secretName)) {
    throw new Error('Unknown release-gate MFA credential slot.');
  }
  async function post(path, body) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Release-gate MFA ${path} returned HTTP ${response.status}.`);
    return response.json();
  }
  let secret = env[secretName];
  let publicKey;
  async function retain(recoveryCodes = []) {
    const directory = 'artifacts/release-gate-mfa-encrypted';
    await mkdir(directory, { recursive: true });
    const encrypted = encryptGateCredential(publicKey, { secretName, secret, recoveryCodes });
    await writeFile(`${directory}/${secretName}.json`, JSON.stringify(encrypted), { mode: 0o600 });
  }
  if (payload.enrollmentRequired) {
    if (secret) throw new Error(`${secretName} is configured but the staging account is not enrolled; reconcile the test identity before proceeding.`);
    if (!env.ACCOUNTING_GATE_MFA_ENROLLMENT_PUBLIC_KEY || !env.GITHUB_ENV) {
      throw new Error(`Staging MFA enrollment required for ${secretName}; configure the encrypted enrollment public key first.`);
    }
    publicKey = Buffer.from(env.ACCOUNTING_GATE_MFA_ENROLLMENT_PUBLIC_KEY, 'base64').toString('utf8');
    // Validate the recovery destination before changing an MFA profile.
    encryptGateCredential(publicKey, { validation: true });
    const enrolled = await post('/api/mfa/enrollment/options', {
      pendingToken: payload.pendingToken, method: 'totp', displayName: secretName,
    });
    secret = enrolled.secret;
    if (!secret) throw new Error('Staging MFA enrollment did not return an authenticator secret.');
    // Never write plaintext credentials to evidence artifacts or console output.
    await retain();
    if (env.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${secret}`);
  }
  if (!secret) throw new Error(`Staging MFA requires protected secret ${secretName}.`);
  const completed = await post(payload.enrollmentRequired ? '/api/mfa/enrollment/verify' : '/api/mfa/verify', {
    pendingToken: payload.pendingToken, method: 'totp', code: gateTotp(secret),
  });
  if (!completed.token) throw new Error('Staging MFA verification returned no session token.');
  if (payload.enrollmentRequired) {
    await retain(completed.recoveryCodes || []);
    env[secretName] = secret;
    await appendFile(env.GITHUB_ENV, `${secretName}=${secret}\n`, { mode: 0o600 });
    console.log(`PASS - staging MFA enrolled; ${secretName} retained only in encrypted evidence and runner environment`);
  }
  return { ...completed, recoveryCodes: undefined };
}
