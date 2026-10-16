// Generated from src/handlers/parish-authentication.ts by npm run build:server. Do not edit.
import '../portability/closure.js';
import { saveCommemorationEntry } from './parish-commemorations.js';
import {
  COMMEMORATION_KEY_PREFIX,
  applyParishDashboardPassword,
  donorCheckoutIndexKey,
  donorOfferingKey,
  generateSecret,
  getAdminToken,
  getBearerToken,
  hasProductionStore,
  hashSessionToken,
  issueParishDashboardSession,
  json,
  listKvKeys,
  loadDonor,
  missingProductionStoreResponse,
  normalizeEmail,
  privilegedMfaRequired,
  rateLimit,
  rateLimitByKey,
  resolveAdminSession,
  secureCompare,
  sha256Hex,
  unauthorized,
  verifyParishDashboardPassword,
} from '../lib/core.js';
import { beginMfaAuthentication } from '../lib/mfa.js';
import '../lib/stewardship-funds.js';
import { loadDonorCommemorations, loadDonorOfferings, storeDonorOffering } from './parish-donor-offerings.js';
import './parish-giving-read-models.js';
import './parish-checkout.js';
import './parish-dashboard-handler.js';
import '../lib/entitlements.js';
import '../lib/subscriptions.js';
import '../lib/format.js';
import '../lib/audit-log.js';
import '../lib/registration-intake.js';
import '../lib/payment-fees.js';
import '../lib/parish-pricing-usage.js';
import '../lib/stripe-fees.js';
import '../lib/stripe-connect.js';
import { sendParishPasswordResetEmail } from '../lib/parish-notifications.js';
import './parish-shared.js';
import { d1, parishDashboardPayloadWithPricingUsage } from './parish-shared.js';
import './parish.js';
import { saveRegistrationRecord, findRegistrationByParishId } from './parish-registration-storage.js';
async function migrateDonorEmailReferences(env, oldEmail, newEmail) {
  const oldNormalized = normalizeEmail(oldEmail);
  const newNormalized = normalizeEmail(newEmail);
  if (!oldNormalized || !newNormalized || oldNormalized === newNormalized) return;
  if (d1(env)) {
    const offerings = await loadDonorOfferings(env, oldNormalized, 1e3);
    for (const offering of offerings) {
      await storeDonorOffering(env, {
        ...offering,
        donorEmail: newNormalized,
        updatedAt: /* @__PURE__ */ new Date().toISOString(),
      });
    }
    const commemorations = await loadDonorCommemorations(env, oldNormalized, 1e3);
    for (const entry of commemorations) {
      await saveCommemorationEntry(env, {
        ...entry,
        donorEmail: newNormalized,
        updatedAt: /* @__PURE__ */ new Date().toISOString(),
      });
    }
    return;
  }
  if (!env.AGAPAY_REGISTRATIONS) return;
  const offeringKeys = await listKvKeys(env, { prefix: donorOfferingKey(oldNormalized, ''), limit: 1e3 });
  for (const key of offeringKeys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = {
        ...JSON.parse(raw),
        donorEmail: newNormalized,
        updatedAt: /* @__PURE__ */ new Date().toISOString(),
      };
      const newKey = donorOfferingKey(newNormalized, offering.id || key.name.split(':').pop());
      await env.AGAPAY_REGISTRATIONS.put(newKey, JSON.stringify(offering));
      if (offering.checkoutSessionId)
        await env.AGAPAY_REGISTRATIONS.put(donorCheckoutIndexKey(offering.checkoutSessionId), newKey);
      await env.AGAPAY_REGISTRATIONS.delete(key.name);
    } catch {}
  }
  const commemorationKeys = await listKvKeys(env, { prefix: COMMEMORATION_KEY_PREFIX, limit: 1e3 });
  for (const key of commemorationKeys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      if (normalizeEmail(entry.donorEmail) !== oldNormalized) continue;
      await env.AGAPAY_REGISTRATIONS.put(
        key.name,
        JSON.stringify({
          ...entry,
          donorEmail: newNormalized,
          updatedAt: /* @__PURE__ */ new Date().toISOString(),
        })
      );
    } catch {}
  }
}
async function requireDonor(request, env) {
  if (!hasProductionStore(env)) return null;
  const email = normalizeEmail(request.headers.get('X-AGAPAY-Donor-Email'));
  const token = getBearerToken(request);
  if (!email || !token) return null;
  const donor = await loadDonor(env, email);
  if (!donor?.emailVerifiedAt) return null;
  if (!donor || !donor.sessionTokenHash || !donor.sessionSalt) return null;
  if (donor.sessionExpiresAt && new Date(donor.sessionExpiresAt).getTime() < Date.now()) return null;
  const submittedHash = await hashSessionToken(token, donor.sessionSalt);
  if (!secureCompare(submittedHash, donor.sessionTokenHash)) return null;
  return donor;
}
async function requireAdminContext(request, env) {
  const submitted = getAdminToken(request);
  if (!submitted) return null;
  const session = await resolveAdminSession(env, submitted);
  if (!session) return null;
  if (privilegedMfaRequired(env) && !session.mfaVerifiedAt) return null;
  return {
    actor: session.actor || 'Admin',
    authType: 'session',
    expiresAt: session.expiresAt || '',
    sessionId: session.id || '',
    mfaVerifiedAt: session.mfaVerifiedAt || '',
  };
}
async function requireAdmin(request, env) {
  return Boolean(await requireAdminContext(request, env));
}
async function handleParishSession(request, env, parishId) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-auth', { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const accountLimited = await rateLimitByKey(request, env, 'parish-auth-account', parishId, {
    limit: 20,
    windowSeconds: 300,
  });
  if (accountLimited) return accountLimited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish dashboard record not found' }, { status: 404 });
  const password = String(body.password || '').trim();
  if (!(await verifyParishDashboardPassword(found.registration, password))) return unauthorized();
  if (privilegedMfaRequired(env))
    return json({
      ok: true,
      ...(await beginMfaAuthentication(env, request, {
        principalType: 'parish_admin',
        principalId: parishId,
        purpose: 'login',
        metadata: {},
      })),
    });
  const session = await issueParishDashboardSession(found.registration);
  await saveRegistrationRecord(env, found.key, session.registration, found.registration);
  return json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    parish: await parishDashboardPayloadWithPricingUsage(env, parishId, session.registration),
  });
}
async function handleParishPasswordResetRequest(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-password-reset-request', { limit: 6, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parishId = String(body.parishId || '').trim();
  const email = normalizeEmail(body.email);
  if (!parishId || !email) return json({ error: 'Parish ID and email are required' }, { status: 422 });
  const generic = {
    ok: true,
    message: 'If that parish and contact email match our records, a reset link has been sent.',
  };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json(generic);
  const registration = found.registration;
  const contactEmails = Array.from(
    new Set([normalizeEmail(registration.priestEmail), normalizeEmail(registration.treasurerEmail)].filter(Boolean))
  );
  if (!contactEmails.includes(email)) return json(generic);
  const resetToken = generateSecret('parish_reset');
  const resetSalt = generateSecret('parish_reset_salt');
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const resetUrl = `${String(appUrl).replace(/\/+$/, '')}/give/login?reset=1&parish=${encodeURIComponent(registration.parishId || parishId)}&token=${encodeURIComponent(resetToken)}`;
  const updated = {
    ...registration,
    parishPasswordResetSalt: resetSalt,
    parishPasswordResetTokenHash: await sha256Hex(`${resetSalt}:${resetToken}`),
    parishPasswordResetSentAt: /* @__PURE__ */ new Date().toISOString(),
    parishPasswordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1e3).toISOString(),
    parishUpdatedAt: /* @__PURE__ */ new Date().toISOString(),
  };
  const emailResult = await sendParishPasswordResetEmail(env, appUrl, updated, resetUrl, contactEmails);
  updated.parishPasswordResetEmailStatus = emailResult.status || '';
  updated.parishPasswordResetEmailDetail = emailResult.detail || '';
  await saveRegistrationRecord(env, found.key, updated, registration);
  return json({
    ...generic,
    email: { status: emailResult.status || 'unknown', detail: emailResult.detail || '' },
    resetUrl: emailResult.status === 'not_configured' ? resetUrl : void 0,
  });
}
async function handleParishPasswordResetConfirm(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-password-reset-confirm', { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parishId = String(body.parishId || '').trim();
  const token = String(body.token || '');
  const newPassword = String(body.newPassword || body.password || '').trim();
  const confirmPassword = String(body.confirmPassword || body.newPassword || body.password || '').trim();
  if (!parishId || !token) return json({ error: 'Parish ID and reset token are required' }, { status: 422 });
  if (newPassword.length < 8)
    return json({ error: 'Dashboard password must be at least 8 characters.' }, { status: 422 });
  if (newPassword !== confirmPassword) return json({ error: 'Dashboard passwords do not match.' }, { status: 422 });
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return unauthorized();
  const current = found.registration;
  if (!current.parishPasswordResetSalt || !current.parishPasswordResetTokenHash) {
    return json({ error: 'Reset link is missing or expired. Please request a new link.' }, { status: 410 });
  }
  if (current.parishPasswordResetExpiresAt && new Date(current.parishPasswordResetExpiresAt).getTime() < Date.now()) {
    return json({ error: 'Reset link expired. Please request a new link.' }, { status: 410 });
  }
  const submittedHash = await sha256Hex(`${current.parishPasswordResetSalt}:${token}`);
  if (!secureCompare(submittedHash, current.parishPasswordResetTokenHash)) return unauthorized();
  let updated = await applyParishDashboardPassword(
    {
      ...current,
      parishPasswordResetSalt: '',
      parishPasswordResetTokenHash: '',
      parishPasswordResetSentAt: '',
      parishPasswordResetExpiresAt: '',
      parishPasswordResetEmailStatus: '',
      parishPasswordResetEmailDetail: '',
      parishDashboardSessions: [],
      parishUpdatedAt: /* @__PURE__ */ new Date().toISOString(),
    },
    newPassword,
    { temporary: false }
  );
  updated = {
    ...updated,
    parishDashboardSessions: [],
  };
  await saveRegistrationRecord(env, found.key, updated, current);
  return json({
    ok: true,
    updatedAt: updated.parishDashboardTokenUpdatedAt || /* @__PURE__ */ new Date().toISOString(),
  });
}
export {
  handleParishPasswordResetConfirm,
  handleParishPasswordResetRequest,
  handleParishSession,
  migrateDonorEmailReferences,
  requireAdmin,
  requireAdminContext,
  requireDonor,
};
