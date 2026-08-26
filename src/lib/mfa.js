import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

import {
  d1,
  d1All,
  d1First,
  d1Run,
  generateSecret,
  hashSessionToken,
  privilegedMfaRequired,
  secureCompare,
  sha256Hex,
} from "./core.js";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  opaqueWebauthnUserId,
  safeJson,
  webauthnRpContext,
} from "./webauthn.js";

const MFA_TRANSACTION_TTL_MS = 5 * 60 * 1000;
const MFA_STEP_UP_TTL_MS = 15 * 60 * 1000;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const RECOVERY_CODE_COUNT = 10;

export const MFA_PRINCIPAL_TYPES = new Set(["platform_admin", "parish_admin", "platform_user"]);

export { privilegedMfaRequired };

export function freshMfaAt(value, nowMs = Date.now()) {
  const verifiedMs = Date.parse(String(value || ""));
  return Number.isFinite(verifiedMs) && nowMs - verifiedMs <= MFA_STEP_UP_TTL_MS;
}

function nowIso() {
  return new Date().toISOString();
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let buffer = 0;
  const output = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}

async function encryptionKey(env) {
  const material = String(env?.AGAPAY_MFA_ENCRYPTION_KEY || "").trim();
  if (!material) throw new Error("AGAPAY_MFA_ENCRYPTION_KEY is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`agapay-mfa:v1:${material}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptTotpSecret(env, secret) {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    new TextEncoder().encode(secret),
  );
  return { ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)), iv: bytesToBase64Url(iv) };
}

async function decryptTotpSecret(env, profile) {
  if (!profile?.totp_secret_ciphertext || !profile?.totp_secret_iv) return "";
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(profile.totp_secret_iv) },
    await encryptionKey(env),
    base64UrlToBytes(profile.totp_secret_ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

function normalizePrincipal(principalType, principalId) {
  const type = String(principalType || "").trim();
  const id = String(principalId || "").trim();
  if (!MFA_PRINCIPAL_TYPES.has(type) || !id || id.length > 240) return null;
  return { principalType: type, principalId: id };
}

export async function loadMfaProfile(env, principalType, principalId) {
  const principal = normalizePrincipal(principalType, principalId);
  if (!principal || !d1(env)) return null;
  return d1First(
    env,
    "SELECT * FROM privileged_mfa_profiles WHERE principal_type = ?1 AND principal_id = ?2",
    principal.principalType,
    principal.principalId,
  );
}

export async function listPasskeys(env, principalType, principalId) {
  const principal = normalizePrincipal(principalType, principalId);
  if (!principal || !d1(env)) return [];
  return d1All(
    env,
    `SELECT * FROM privileged_webauthn_credentials
     WHERE principal_type = ?1 AND principal_id = ?2 ORDER BY created_at ASC`,
    principal.principalType,
    principal.principalId,
  );
}

export async function mfaStatus(env, principalType, principalId) {
  const [profile, passkeys] = await Promise.all([
    loadMfaProfile(env, principalType, principalId),
    listPasskeys(env, principalType, principalId),
  ]);
  const recoveryHashes = safeJson(profile?.recovery_code_hashes_json, []);
  const methods = [];
  if (passkeys.length) methods.push("passkey");
  if (profile?.totp_confirmed_at) methods.push("totp");
  if (Array.isArray(recoveryHashes) && recoveryHashes.length) methods.push("recovery");
  return {
    enrolled: methods.includes("passkey") || methods.includes("totp"),
    methods,
    passkeys: passkeys.map((row) => ({
      id: row.credential_id,
      label: row.label || "Passkey",
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at || "",
      backedUp: Boolean(row.backed_up),
    })),
    totpEnabled: Boolean(profile?.totp_confirmed_at),
    recoveryCodesRemaining: Array.isArray(recoveryHashes) ? recoveryHashes.length : 0,
  };
}

async function saveTransaction(env, {
  principalType,
  principalId,
  purpose,
  challenge = "",
  method = "",
  metadata = {},
}) {
  const principal = normalizePrincipal(principalType, principalId);
  if (!principal || !d1(env)) throw new Error("MFA storage is unavailable.");
  const id = generateSecret("mfatx");
  const secret = generateSecret("mfapending");
  const salt = generateSecret("mfasalt");
  const tokenHash = await hashSessionToken(secret, salt);
  const expiresAt = new Date(Date.now() + MFA_TRANSACTION_TTL_MS).toISOString();
  await d1Run(
    env,
    `INSERT INTO privileged_mfa_transactions
       (id, principal_type, principal_id, purpose, token_hash, token_salt,
        webauthn_challenge, selected_method, metadata_json, attempts, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11)`,
    id,
    principal.principalType,
    principal.principalId,
    purpose,
    tokenHash,
    salt,
    challenge,
    method,
    JSON.stringify(metadata || {}),
    expiresAt,
    nowIso(),
  );
  return { pendingToken: `${id}.${secret}`, expiresAt };
}

export async function loadMfaTransaction(env, pendingToken, { consumeAttempt = false } = {}) {
  if (!d1(env)) return null;
  const [id, secret] = String(pendingToken || "").split(".", 2);
  if (!id || !secret) return null;
  const row = await d1First(env, "SELECT * FROM privileged_mfa_transactions WHERE id = ?1", id);
  if (!row || row.consumed_at || Date.parse(row.expires_at || "") <= Date.now() || Number(row.attempts || 0) >= 10) return null;
  const submitted = await hashSessionToken(secret, row.token_salt || "");
  if (!secureCompare(submitted, row.token_hash || "")) return null;
  if (consumeAttempt) {
    await d1Run(env, "UPDATE privileged_mfa_transactions SET attempts = attempts + 1 WHERE id = ?1", id);
  }
  return { ...row, metadata: safeJson(row.metadata_json, {}) };
}

async function updateTransactionChallenge(env, transactionId, challenge, method) {
  await d1Run(
    env,
    `UPDATE privileged_mfa_transactions
     SET webauthn_challenge = ?2, selected_method = ?3 WHERE id = ?1 AND consumed_at IS NULL`,
    transactionId,
    challenge,
    method,
  );
}

export async function consumeMfaTransaction(env, transactionId) {
  await d1Run(
    env,
    "UPDATE privileged_mfa_transactions SET consumed_at = ?2 WHERE id = ?1 AND consumed_at IS NULL",
    transactionId,
    nowIso(),
  );
}

export async function beginMfaAuthentication(env, request, {
  principalType,
  principalId,
  purpose = "login",
  metadata = {},
}) {
  const status = await mfaStatus(env, principalType, principalId);
  const transaction = await saveTransaction(env, { principalType, principalId, purpose, metadata });
  let passkeyOptions = null;
  if (status.methods.includes("passkey")) {
    const passkeys = await listPasskeys(env, principalType, principalId);
    const { rpID } = webauthnRpContext(request, env);
    passkeyOptions = await generateAuthenticationOptions({
      rpID,
      allowCredentials: passkeys.map((row) => ({
        id: row.credential_id,
        transports: safeJson(row.transports_json, []),
      })),
      userVerification: "required",
      timeout: MFA_TRANSACTION_TTL_MS,
    });
    await updateTransactionChallenge(env, transaction.pendingToken.split(".")[0], passkeyOptions.challenge, "passkey");
  }
  return {
    mfaRequired: true,
    enrollmentRequired: !status.enrolled,
    pendingToken: transaction.pendingToken,
    expiresAt: transaction.expiresAt,
    methods: status.methods,
    passkeyOptions,
  };
}

async function upsertProfile(env, principalType, principalId, fields = {}) {
  const current = await loadMfaProfile(env, principalType, principalId);
  const timestamp = nowIso();
  const pick = (key, column, fallback = null) => Object.prototype.hasOwnProperty.call(fields, key)
    ? fields[key]
    : current?.[column] ?? fallback;
  await d1Run(
    env,
    `INSERT INTO privileged_mfa_profiles
       (principal_type, principal_id, totp_secret_ciphertext, totp_secret_iv,
        totp_confirmed_at, recovery_code_hashes_json, recovery_codes_generated_at,
        required_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
     ON CONFLICT(principal_type, principal_id) DO UPDATE SET
       totp_secret_ciphertext = excluded.totp_secret_ciphertext,
       totp_secret_iv = excluded.totp_secret_iv,
       totp_confirmed_at = excluded.totp_confirmed_at,
       recovery_code_hashes_json = excluded.recovery_code_hashes_json,
       recovery_codes_generated_at = excluded.recovery_codes_generated_at,
       required_at = excluded.required_at,
       updated_at = excluded.updated_at`,
    principalType,
    principalId,
    pick("totpSecretCiphertext", "totp_secret_ciphertext"),
    pick("totpSecretIv", "totp_secret_iv"),
    pick("totpConfirmedAt", "totp_confirmed_at"),
    pick("recoveryCodeHashesJson", "recovery_code_hashes_json", "[]"),
    pick("recoveryCodesGeneratedAt", "recovery_codes_generated_at"),
    pick("requiredAt", "required_at", timestamp),
    current?.created_at || timestamp,
  );
}

export async function beginMfaEnrollment(env, request, pendingToken, {
  method,
  displayName = "AGAPAY administrator",
  credentialLabel = "Passkey",
}) {
  const transaction = await loadMfaTransaction(env, pendingToken);
  if (!transaction) throw new Error("MFA setup expired. Please sign in again.");
  if (!['login', 'invitation', 'manage'].includes(transaction.purpose)) throw new Error("This MFA transaction cannot enroll a new method.");
  const currentStatus = await mfaStatus(env, transaction.principal_type, transaction.principal_id);
  if (currentStatus.enrolled && transaction.purpose !== "manage") {
    throw new Error("Verify an existing MFA method before adding another one.");
  }
  if (method === "totp") {
    const secret = base32Encode(randomBytes(20));
    const encrypted = await encryptTotpSecret(env, secret);
    await upsertProfile(env, transaction.principal_type, transaction.principal_id, {
      totpSecretCiphertext: encrypted.ciphertext,
      totpSecretIv: encrypted.iv,
      totpConfirmedAt: null,
    });
    await updateTransactionChallenge(env, transaction.id, "", "totp");
    const issuer = "AGAPAY";
    const label = `${issuer}:${displayName}`;
    return {
      method: "totp",
      secret,
      otpauthUri: `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`,
    };
  }
  if (method !== "passkey") throw new Error("Unsupported MFA method.");
  const passkeys = await listPasskeys(env, transaction.principal_type, transaction.principal_id);
  const { rpID } = webauthnRpContext(request, env);
  const options = await generateRegistrationOptions({
    rpName: "AGAPAY",
    rpID,
    userID: await opaqueWebauthnUserId(transaction.principal_type, transaction.principal_id),
    userName: transaction.principal_id,
    userDisplayName: displayName,
    attestationType: "none",
    excludeCredentials: passkeys.map((row) => ({ id: row.credential_id, transports: safeJson(row.transports_json, []) })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    supportedAlgorithmIDs: [-7, -257],
    timeout: MFA_TRANSACTION_TTL_MS,
  });
  await updateTransactionChallenge(env, transaction.id, options.challenge, `passkey:${String(credentialLabel || "Passkey").slice(0, 80)}`);
  return { method: "passkey", options };
}

async function hotp(secret, counter) {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const counterBytes = new Uint8Array(8);
  let value = BigInt(counter);
  for (let index = 7; index >= 0; index -= 1) {
    counterBytes[index] = Number(value & 255n);
    value >>= 8n;
  }
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24)
    | ((digest[offset + 1] & 255) << 16)
    | ((digest[offset + 2] & 255) << 8)
    | (digest[offset + 3] & 255);
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, "0");
}

export async function verifyTotpCode(secret, code, nowMs = Date.now()) {
  const submitted = String(code || "").replace(/\D/g, "");
  if (submitted.length !== TOTP_DIGITS) return false;
  const currentCounter = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    if (secureCompare(await hotp(secret, currentCounter + offset), submitted)) return true;
  }
  return false;
}

async function recoveryHash(principalType, principalId, code) {
  const normalized = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return sha256Hex(`mfa-recovery:v1:${principalType}:${principalId}:${normalized}`);
}

async function createRecoveryCodes(env, principalType, principalId) {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = base32Encode(randomBytes(8)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  const hashes = await Promise.all(codes.map((code) => recoveryHash(principalType, principalId, code)));
  const generatedAt = nowIso();
  await upsertProfile(env, principalType, principalId, {
    recoveryCodeHashesJson: JSON.stringify(hashes),
    recoveryCodesGeneratedAt: generatedAt,
    requiredAt: generatedAt,
  });
  return codes;
}

async function ensureRecoveryCodes(env, principalType, principalId) {
  const profile = await loadMfaProfile(env, principalType, principalId);
  const hashes = safeJson(profile?.recovery_code_hashes_json, []);
  return Array.isArray(hashes) && hashes.length ? [] : createRecoveryCodes(env, principalType, principalId);
}

export async function verifyMfaEnrollment(env, request, pendingToken, { method, code, credential } = {}) {
  const transaction = await loadMfaTransaction(env, pendingToken, { consumeAttempt: true });
  if (!transaction) throw new Error("MFA setup expired. Please sign in again.");
  const currentStatus = await mfaStatus(env, transaction.principal_type, transaction.principal_id);
  if (currentStatus.enrolled && transaction.purpose !== "manage") {
    throw new Error("Verify an existing MFA method before adding another one.");
  }
  if (method === "totp") {
    const profile = await loadMfaProfile(env, transaction.principal_type, transaction.principal_id);
    const secret = await decryptTotpSecret(env, profile);
    if (!secret || !(await verifyTotpCode(secret, code))) throw new Error("That authenticator code is not valid.");
    await upsertProfile(env, transaction.principal_type, transaction.principal_id, {
      totpConfirmedAt: nowIso(),
      requiredAt: nowIso(),
    });
  } else if (method === "passkey") {
    if (!transaction.webauthn_challenge || !credential) throw new Error("Passkey setup was not started.");
    const { origin, rpID } = webauthnRpContext(request, env);
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: transaction.webauthn_challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257],
    });
    if (!verification.verified || !verification.registrationInfo) throw new Error("The passkey could not be verified.");
    const info = verification.registrationInfo;
    const saved = info.credential;
    const label = String(transaction.selected_method || "").replace(/^passkey:/, "") || "Passkey";
    await d1Run(
      env,
      `INSERT INTO privileged_webauthn_credentials
         (credential_id, principal_type, principal_id, credential_public_key, counter,
          transports_json, device_type, backed_up, label, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      saved.id,
      transaction.principal_type,
      transaction.principal_id,
      bytesToBase64Url(saved.publicKey),
      Number(saved.counter || 0),
      JSON.stringify(saved.transports || credential.response?.transports || []),
      info.credentialDeviceType || "",
      info.credentialBackedUp ? 1 : 0,
      label.slice(0, 80),
      nowIso(),
    );
    await upsertProfile(env, transaction.principal_type, transaction.principal_id, { requiredAt: nowIso() });
  } else {
    throw new Error("Unsupported MFA method.");
  }
  const recoveryCodes = await ensureRecoveryCodes(env, transaction.principal_type, transaction.principal_id);
  await consumeMfaTransaction(env, transaction.id);
  return { transaction, recoveryCodes, verifiedAt: nowIso() };
}

async function consumeRecoveryCode(env, transaction, code) {
  const profile = await loadMfaProfile(env, transaction.principal_type, transaction.principal_id);
  const hashes = safeJson(profile?.recovery_code_hashes_json, []);
  if (!Array.isArray(hashes) || !hashes.length) return false;
  const submitted = await recoveryHash(transaction.principal_type, transaction.principal_id, code);
  const index = hashes.findIndex((hash) => secureCompare(hash, submitted));
  if (index < 0) return false;
  const next = hashes.filter((_, candidateIndex) => candidateIndex !== index);
  const result = await d1(env).prepare(
    `UPDATE privileged_mfa_profiles SET recovery_code_hashes_json = ?3, updated_at = ?4
     WHERE principal_type = ?1 AND principal_id = ?2 AND recovery_code_hashes_json = ?5`,
  ).bind(
    transaction.principal_type,
    transaction.principal_id,
    JSON.stringify(next),
    nowIso(),
    JSON.stringify(hashes),
  ).run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function verifyMfaAuthentication(env, request, pendingToken, { method, code, credential } = {}) {
  const transaction = await loadMfaTransaction(env, pendingToken, { consumeAttempt: true });
  if (!transaction) throw new Error("MFA verification expired. Please sign in again.");
  if (method === "totp") {
    const profile = await loadMfaProfile(env, transaction.principal_type, transaction.principal_id);
    if (!profile?.totp_confirmed_at || !(await verifyTotpCode(await decryptTotpSecret(env, profile), code))) {
      throw new Error("That authenticator code is not valid.");
    }
  } else if (method === "recovery") {
    if (!(await consumeRecoveryCode(env, transaction, code))) throw new Error("That recovery code is invalid or has already been used.");
  } else if (method === "passkey") {
    if (!transaction.webauthn_challenge || !credential?.id) throw new Error("Passkey verification was not started.");
    const saved = await d1First(
      env,
      `SELECT * FROM privileged_webauthn_credentials
       WHERE credential_id = ?1 AND principal_type = ?2 AND principal_id = ?3`,
      credential.id,
      transaction.principal_type,
      transaction.principal_id,
    );
    if (!saved) throw new Error("That passkey is not registered for this account.");
    const { origin, rpID } = webauthnRpContext(request, env);
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: transaction.webauthn_challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: saved.credential_id,
        publicKey: base64UrlToBytes(saved.credential_public_key),
        counter: Number(saved.counter || 0),
        transports: safeJson(saved.transports_json, []),
      },
      requireUserVerification: true,
    });
    if (!verification.verified) throw new Error("The passkey could not be verified.");
    await d1Run(
      env,
      `UPDATE privileged_webauthn_credentials
       SET counter = ?2, backed_up = ?3, last_used_at = ?4 WHERE credential_id = ?1`,
      saved.credential_id,
      Number(verification.authenticationInfo.newCounter || 0),
      verification.authenticationInfo.credentialBackedUp ? 1 : 0,
      nowIso(),
    );
  } else {
    throw new Error("Choose a passkey, authenticator code, or recovery code.");
  }
  await consumeMfaTransaction(env, transaction.id);
  return { transaction, recoveryCodes: [], verifiedAt: nowIso() };
}
