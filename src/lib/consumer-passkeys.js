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
  normalizeEmail,
  secureCompare,
} from "./core.js";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  opaqueWebauthnUserId,
  safeJson,
  webauthnRpContext,
} from "./webauthn.js";

const TRANSACTION_TTL_MS = 5 * 60 * 1000;
const MAX_TRANSACTION_ATTEMPTS = 10;

function nowIso() {
  return new Date().toISOString();
}

function requireStorage(env) {
  if (!d1(env)) throw new Error("Passkey storage is unavailable.");
}

function publicCredential(row) {
  return {
    id: row.credential_id,
    label: row.label || "Passkey",
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at || "",
    backedUp: Boolean(row.backed_up),
    deviceType: row.device_type || "",
  };
}

export async function findConsumerPasskeyAccount(env, email) {
  const normalized = normalizeEmail(email);
  if (!d1(env) || !normalized) return null;
  return d1First(env, "SELECT * FROM consumer_passkey_accounts WHERE donor_email = ?1", normalized);
}

export async function ensureConsumerPasskeyAccount(env, email) {
  requireStorage(env);
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("A verified My AGAPAY email is required.");
  const current = await findConsumerPasskeyAccount(env, normalized);
  if (current) return current;
  const id = generateSecret("consumer");
  const timestamp = nowIso();
  await d1Run(
    env,
    `INSERT INTO consumer_passkey_accounts (id, donor_email, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?3)
     ON CONFLICT(donor_email) DO UPDATE SET updated_at = excluded.updated_at`,
    id,
    normalized,
    timestamp,
  );
  return findConsumerPasskeyAccount(env, normalized);
}

async function accountCredentials(env, accountId) {
  if (!d1(env) || !accountId) return [];
  return d1All(
    env,
    `SELECT * FROM consumer_webauthn_credentials
     WHERE account_id = ?1 ORDER BY created_at ASC`,
    accountId,
  );
}

export async function listConsumerPasskeys(env, email) {
  const account = await findConsumerPasskeyAccount(env, email);
  if (!account) return [];
  return (await accountCredentials(env, account.id)).map(publicCredential);
}

async function saveTransaction(env, { purpose, accountId = null, challenge }) {
  requireStorage(env);
  const id = generateSecret("consumerpk");
  const secret = generateSecret("consumerpkpending");
  const salt = generateSecret("consumerpksalt");
  const expiresAt = new Date(Date.now() + TRANSACTION_TTL_MS).toISOString();
  await d1Run(
    env,
    `INSERT INTO consumer_passkey_transactions
       (id, purpose, account_id, token_hash, token_salt, webauthn_challenge,
        attempts, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8)`,
    id,
    purpose,
    accountId,
    await hashSessionToken(secret, salt),
    salt,
    challenge,
    expiresAt,
    nowIso(),
  );
  return { pendingToken: `${id}.${secret}`, expiresAt };
}

async function loadTransaction(env, pendingToken, purpose, { countAttempt = false } = {}) {
  if (!d1(env)) return null;
  const [id, secret] = String(pendingToken || "").split(".", 2);
  if (!id || !secret) return null;
  const row = await d1First(env, "SELECT * FROM consumer_passkey_transactions WHERE id = ?1", id);
  if (
    !row
    || row.purpose !== purpose
    || row.consumed_at
    || Date.parse(row.expires_at || "") <= Date.now()
    || Number(row.attempts || 0) >= MAX_TRANSACTION_ATTEMPTS
  ) return null;
  const submitted = await hashSessionToken(secret, row.token_salt || "");
  if (!secureCompare(submitted, row.token_hash || "")) return null;
  if (countAttempt) {
    await d1Run(
      env,
      `UPDATE consumer_passkey_transactions SET attempts = attempts + 1
       WHERE id = ?1 AND consumed_at IS NULL`,
      id,
    );
  }
  return row;
}

async function consumeTransaction(env, id) {
  const result = await d1(env).prepare(
    `UPDATE consumer_passkey_transactions SET consumed_at = ?2
     WHERE id = ?1 AND consumed_at IS NULL`,
  ).bind(id, nowIso()).run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function beginConsumerPasskeyRegistration(env, request, donor) {
  if (!donor?.emailVerifiedAt) throw new Error("Verify your email before adding a passkey.");
  const account = await ensureConsumerPasskeyAccount(env, donor.email);
  const credentials = await accountCredentials(env, account.id);
  const { rpID } = webauthnRpContext(request, env);
  const options = await generateRegistrationOptions({
    rpName: "AGAPAY",
    rpID,
    userID: await opaqueWebauthnUserId("consumer-passkey", account.id),
    userName: account.donor_email,
    userDisplayName: donor.donorName || donor.householdName || account.donor_email,
    attestationType: "none",
    excludeCredentials: credentials.map((row) => ({
      id: row.credential_id,
      transports: safeJson(row.transports_json, []),
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    supportedAlgorithmIDs: [-7, -257],
    timeout: TRANSACTION_TTL_MS,
  });
  return {
    options,
    ...(await saveTransaction(env, {
      purpose: "registration",
      accountId: account.id,
      challenge: options.challenge,
    })),
  };
}

export async function verifyConsumerPasskeyRegistration(env, request, donor, {
  pendingToken,
  credential,
  label = "Passkey",
} = {}) {
  if (!donor?.emailVerifiedAt || !credential) throw new Error("Passkey registration was incomplete.");
  const transaction = await loadTransaction(env, pendingToken, "registration", { countAttempt: true });
  if (!transaction) throw new Error("Passkey setup expired. Please try again.");
  const account = await findConsumerPasskeyAccount(env, donor.email);
  if (!account || account.id !== transaction.account_id) throw new Error("This passkey setup does not belong to this account.");
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
  if (!(await consumeTransaction(env, transaction.id))) throw new Error("This passkey setup has already been used.");

  const info = verification.registrationInfo;
  const saved = info.credential;
  try {
    await d1Run(
      env,
      `INSERT INTO consumer_webauthn_credentials
         (credential_id, account_id, credential_public_key, counter, transports_json,
          device_type, backed_up, label, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      saved.id,
      account.id,
      bytesToBase64Url(saved.publicKey),
      Number(saved.counter || 0),
      JSON.stringify(saved.transports || credential.response?.transports || []),
      info.credentialDeviceType || "",
      info.credentialBackedUp ? 1 : 0,
      String(label || "Passkey").trim().slice(0, 80) || "Passkey",
      nowIso(),
    );
  } catch (error) {
    if (String(error?.message || error).includes("UNIQUE constraint failed")) {
      throw new Error("That passkey is already registered.");
    }
    throw error;
  }
  return { account, passkeys: await listConsumerPasskeys(env, donor.email) };
}

export async function beginConsumerPasskeyAuthentication(env, request) {
  requireStorage(env);
  const { rpID } = webauthnRpContext(request, env);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    timeout: TRANSACTION_TTL_MS,
  });
  return {
    options,
    ...(await saveTransaction(env, {
      purpose: "authentication",
      challenge: options.challenge,
    })),
  };
}

export async function verifyConsumerPasskeyAuthentication(env, request, { pendingToken, credential } = {}) {
  if (!credential?.id) throw new Error("Passkey sign-in was incomplete.");
  const transaction = await loadTransaction(env, pendingToken, "authentication", { countAttempt: true });
  if (!transaction) throw new Error("Passkey sign-in expired. Please try again.");
  const saved = await d1First(
    env,
    `SELECT credential.*, account.donor_email
     FROM consumer_webauthn_credentials credential
     JOIN consumer_passkey_accounts account ON account.id = credential.account_id
     WHERE credential.credential_id = ?1`,
    credential.id,
  );
  if (!saved) throw new Error("That passkey is not registered with My AGAPAY.");

  const expectedUserHandle = bytesToBase64Url(await opaqueWebauthnUserId("consumer-passkey", saved.account_id));
  const submittedUserHandle = String(credential.response?.userHandle || "");
  if (submittedUserHandle && !secureCompare(submittedUserHandle, expectedUserHandle)) {
    throw new Error("That passkey does not belong to this account.");
  }

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
  if (!(await consumeTransaction(env, transaction.id))) throw new Error("This passkey sign-in has already been used.");
  await d1Run(
    env,
    `UPDATE consumer_webauthn_credentials
     SET counter = ?2, backed_up = ?3, last_used_at = ?4 WHERE credential_id = ?1`,
    saved.credential_id,
    Number(verification.authenticationInfo.newCounter || 0),
    verification.authenticationInfo.credentialBackedUp ? 1 : 0,
    nowIso(),
  );
  return { account: { id: saved.account_id, donor_email: saved.donor_email }, credential: publicCredential(saved) };
}

export async function renameConsumerPasskey(env, email, credentialId, label) {
  const account = await findConsumerPasskeyAccount(env, email);
  if (!account) return false;
  const normalizedLabel = String(label || "").trim().slice(0, 80);
  if (!normalizedLabel) throw new Error("Enter a name for this passkey.");
  const result = await d1(env).prepare(
    `UPDATE consumer_webauthn_credentials SET label = ?3
     WHERE credential_id = ?1 AND account_id = ?2`,
  ).bind(credentialId, account.id, normalizedLabel).run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function deleteConsumerPasskey(env, email, credentialId) {
  const account = await findConsumerPasskeyAccount(env, email);
  if (!account) return false;
  const result = await d1(env).prepare(
    `DELETE FROM consumer_webauthn_credentials WHERE credential_id = ?1 AND account_id = ?2`,
  ).bind(credentialId, account.id).run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function migrateConsumerPasskeyEmail(env, oldEmail, newEmail) {
  if (!d1(env)) return { changed: false };
  const oldNormalized = normalizeEmail(oldEmail);
  const newNormalized = normalizeEmail(newEmail);
  if (!oldNormalized || !newNormalized || oldNormalized === newNormalized) return { changed: false };
  const account = await findConsumerPasskeyAccount(env, oldNormalized);
  if (!account) return { changed: false };
  const conflict = await findConsumerPasskeyAccount(env, newNormalized);
  if (conflict && conflict.id !== account.id) return { changed: false, conflict: true };
  await d1Run(
    env,
    "UPDATE consumer_passkey_accounts SET donor_email = ?2, updated_at = ?3 WHERE id = ?1",
    account.id,
    newNormalized,
    nowIso(),
  );
  return { changed: true };
}
