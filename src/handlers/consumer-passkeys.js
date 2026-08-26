import {
  json,
  loadDonor,
  publicDonor,
  rateLimit,
  rateLimitByKey,
  unauthorized,
} from "../lib/core.js";
import {
  beginConsumerPasskeyAuthentication,
  beginConsumerPasskeyRegistration,
  deleteConsumerPasskey,
  findConsumerPasskeyAccount,
  listConsumerPasskeys,
  renameConsumerPasskey,
  verifyConsumerPasskeyAuthentication,
  verifyConsumerPasskeyRegistration,
} from "../lib/consumer-passkeys.js";
import { recordAuditEvent } from "../lib/audit-log.js";
import { issueDonorSession } from "./donor.js";
import { requireDonor } from "./parish.js";

function passkeyError(error, status = 400) {
  return json({
    error: String(error?.message || error || "Passkey request failed."),
    code: "consumer_passkey_error",
  }, { status });
}

async function requestBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function handleConsumerPasskeyAuthenticationOptions(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "consumer-passkey-auth-options", { limit: 30, windowSeconds: 300 });
  if (limited) return limited;
  try {
    return json({ ok: true, ...(await beginConsumerPasskeyAuthentication(env, request)) });
  } catch (error) {
    return passkeyError(error, 503);
  }
}

export async function handleConsumerPasskeyAuthenticationVerify(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "consumer-passkey-auth-verify", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const body = await requestBody(request);
  if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });
  try {
    const verified = await verifyConsumerPasskeyAuthentication(env, request, body);
    const accountLimited = await rateLimitByKey(
      request,
      env,
      "consumer-passkey-auth-account",
      verified.account.id,
      { limit: 20, windowSeconds: 300 },
    );
    if (accountLimited) return accountLimited;
    const donor = await loadDonor(env, verified.account.donor_email);
    if (!donor?.emailVerifiedAt || donor.accountDeletionRequestedAt) return unauthorized();
    const session = await issueDonorSession(env, donor);
    await recordAuditEvent(env, request, {
      action: "consumer_passkey.authentication_succeeded",
      actorUserId: verified.account.id,
      actorType: "donor",
      targetType: "consumer_passkey",
      targetId: verified.credential.id,
    });
    return json({ ok: true, token: session.token, donor: publicDonor(session.donor), authMethod: "passkey" });
  } catch (error) {
    return passkeyError(error, 401);
  }
}

export async function handleConsumerPasskeyRegistrationOptions(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const limited = await rateLimitByKey(request, env, "consumer-passkey-registration-options", donor.email, { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  try {
    return json({ ok: true, ...(await beginConsumerPasskeyRegistration(env, request, donor)) });
  } catch (error) {
    return passkeyError(error);
  }
}

export async function handleConsumerPasskeyRegistrationVerify(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const limited = await rateLimitByKey(request, env, "consumer-passkey-registration-verify", donor.email, { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  const body = await requestBody(request);
  if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });
  try {
    const result = await verifyConsumerPasskeyRegistration(env, request, donor, body);
    await recordAuditEvent(env, request, {
      action: "consumer_passkey.created",
      actorUserId: result.account.id,
      actorType: "donor",
      targetType: "consumer_passkey",
      targetId: result.passkeys.at(-1)?.id || "",
      metadata: { passkeyCount: result.passkeys.length },
    });
    return json({ ok: true, passkeys: result.passkeys });
  } catch (error) {
    return passkeyError(error);
  }
}

export async function handleConsumerPasskeys(request, env, credentialId = "") {
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const account = await findConsumerPasskeyAccount(env, donor.email);

  if (!credentialId && request.method === "GET") {
    return json({
      ok: true,
      supported: true,
      passkeys: await listConsumerPasskeys(env, donor.email),
      recoveryMethod: "verified_email",
    });
  }
  if (!credentialId) return json({ error: "Method not allowed" }, { status: 405 });

  const limited = await rateLimitByKey(request, env, "consumer-passkey-manage", donor.email, { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (request.method === "PATCH") {
    const body = await requestBody(request);
    if (!body) return json({ error: "Invalid JSON body" }, { status: 400 });
    try {
      if (!(await renameConsumerPasskey(env, donor.email, credentialId, body.label))) {
        return json({ error: "Passkey not found" }, { status: 404 });
      }
      await recordAuditEvent(env, request, {
        action: "consumer_passkey.renamed",
        actorUserId: account?.id || "",
        actorType: "donor",
        targetType: "consumer_passkey",
        targetId: credentialId,
      });
      return json({ ok: true, passkeys: await listConsumerPasskeys(env, donor.email) });
    } catch (error) {
      return passkeyError(error);
    }
  }
  if (request.method === "DELETE") {
    if (!(await deleteConsumerPasskey(env, donor.email, credentialId))) {
      return json({ error: "Passkey not found" }, { status: 404 });
    }
    const passkeys = await listConsumerPasskeys(env, donor.email);
    await recordAuditEvent(env, request, {
      action: "consumer_passkey.deleted",
      actorUserId: account?.id || "",
      actorType: "donor",
      targetType: "consumer_passkey",
      targetId: credentialId,
      metadata: { passkeyCount: passkeys.length },
    });
    return json({ ok: true, passkeys });
  }
  return json({ error: "Method not allowed" }, { status: 405 });
}
