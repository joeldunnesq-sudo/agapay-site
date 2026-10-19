// Generated from src/handlers/donor-authentication.ts by npm run build:server. Do not edit.
import { issueDonorSession } from '../lib/donor-sessions.js';
import { issueDonorSession as issueDonorSession2 } from '../lib/donor-sessions.js';
import './donor-parish-context.js';
import '../payments/donation-receipts.js';
import { subscriptionSetupUpdates } from '../payments/donation-events.js';
import '../lib/outside-pledges.js';
import { logEvent } from '../lib/logging.js';
import { directoryInvitationNext } from '../lib/directory-invitation-next.js';
import {
  ACCOUNT_ACCEPTANCE_DISCLOSURE,
  CURRENT_TERMS_VERSION,
  recordLegalAcceptance,
} from '../lib/legal-acceptance.js';
import {
  applyDonorPassword,
  generateSecret,
  hasProductionStore,
  json,
  loadDonor,
  missingProductionStoreResponse,
  normalizeEmail,
  publicDonor,
  rateLimit,
  rateLimitByKey,
  saveDonor,
  sha256Hex,
  unauthorized,
  verifyDonorPassword,
  verifyTurnstileIfConfigured,
} from '../lib/core.js';
import '../lib/subscriptions.js';
import '../lib/entitlements.js';
import '../lib/parish-feature-requests.js';
import '../lib/parish-support-tickets.js';
import '../lib/safe-external-url.js';
import '../directory/self-service.js';
import '../lib/consumer-passkeys.js';
import '../lib/email.js';
import '../lib/format.js';
import {
  checkoutPaymentIntentId,
  normalizedCheckoutPaymentStatus,
  stripeGetConnectedRequest,
} from '../lib/stripe-connect.js';
import '../lib/stripe-fees.js';
import {
  findCheckoutParish,
  loadDonorOfferingByCheckout,
  paidOfferingStatus,
  stripePaymentIntentFinancialUpdates,
  updateDonorOfferingByCheckout,
} from './parish.js';
import './parish-commemorations.js';
import './parish-giving-catalog.js';
import { sendDonorVerificationEmail } from './donor-password-recovery.js';
import './donor.js';
import './donor-profile.js';
import './donor-giving.js';
async function handleDonorClaimCheckout(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, 'donor-claim-checkout', { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const sessionId = String(body.sessionId || body.session_id || '').trim();
  const password = String(body.password || '');
  if (!sessionId.startsWith('cs_')) return json({ error: 'A valid checkout session is required' }, { status: 422 });
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, { status: 422 });
  const offering = await loadDonorOfferingByCheckout(env, sessionId);
  if (!offering) return json({ error: 'Checkout session is not tracked by AGAPAY' }, { status: 404 });
  const parish = await findCheckoutParish(env, offering.parishId);
  if (!parish?.stripeAccountId) {
    return json({ error: 'Parish Stripe account is not connected yet' }, { status: 422 });
  }
  let verifiedSession = null;
  const stripe = await stripeGetConnectedRequest(
    env,
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    parish.stripeAccountId
  );
  if (stripe.ok) {
    verifiedSession = stripe.body || {};
    const paymentIntentId = checkoutPaymentIntentId(verifiedSession);
    const paymentStatus = normalizedCheckoutPaymentStatus(verifiedSession, offering.paymentStatus);
    let status = offering.status || 'checkout_created';
    if (paymentStatus === 'paid') status = 'completed';
    if (verifiedSession.status === 'expired') status = 'expired';
    const feeUpdates =
      status === 'completed' || paymentStatus === 'paid'
        ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, offering.parishId, offering)
        : {};
    await updateDonorOfferingByCheckout(env, sessionId, {
      status,
      paymentStatus,
      stripeCustomerId: verifiedSession.customer || offering.stripeCustomerId || '',
      stripePaymentIntentId: paymentIntentId || offering.stripePaymentIntentId || '',
      stripeSubscriptionId: verifiedSession.subscription || offering.stripeSubscriptionId || '',
      completedAt:
        status === 'completed'
          ? offering.completedAt || /* @__PURE__ */ new Date().toISOString()
          : offering.completedAt || '',
      ...feeUpdates,
      ...subscriptionSetupUpdates(verifiedSession, offering),
    });
  }
  const refreshed = (await loadDonorOfferingByCheckout(env, sessionId)) || offering;
  const isPaid = verifiedSession?.payment_status === 'paid' || paidOfferingStatus(refreshed);
  if (!isPaid) {
    return json({ error: 'Payment is still processing. Please wait and try again in a moment.' }, { status: 409 });
  }
  const donorEmail = normalizeEmail(
    refreshed.donorEmail || verifiedSession?.customer_details?.email || verifiedSession?.customer_email || ''
  );
  if (!donorEmail) return json({ error: 'A donor email is required before creating an account.' }, { status: 422 });
  const existing = await loadDonor(env, donorEmail);
  if (existing?.emailVerifiedAt) {
    return json(
      {
        error: 'A donor account already exists for this email. Please log in from the donor sign-in page.',
        code: 'account_exists',
      },
      { status: 409 }
    );
  }
  const now = /* @__PURE__ */ new Date().toISOString();
  const donorNameValue = String(
    body.donorName || body.householdName || refreshed.donorName || existing?.donorName || donorEmail.split('@')[0]
  ).trim();
  const donorBase = {
    ...(existing || {}),
    email: donorEmail,
    donorName: donorNameValue,
    householdName: donorNameValue,
    defaultParishId: refreshed.parishId || existing?.defaultParishId || '',
    emailVerifiedAt: now,
    emailVerificationSalt: '',
    emailVerificationTokenHash: '',
    emailVerificationSentAt: '',
    emailVerificationExpiresAt: '',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const donor = await applyDonorPassword(donorBase, password);
  const session = await issueDonorSession(env, donor);
  return json({
    ok: true,
    token: session.token,
    donor: publicDonor(session.donor),
    checkoutSessionId: sessionId,
    status: refreshed.status || 'completed',
    paymentStatus: refreshed.paymentStatus || 'paid',
  });
}
async function handleDonorSession(request, env) {
  return handleDonorLogin(request, env);
}
async function handleDonorSignup(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, 'donor-signup', { limit: 8, windowSeconds: 300 });
  if (limited) return limited;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const turnstile = await verifyTurnstileIfConfigured(request, env, body.turnstileToken || body.cfTurnstileToken);
  if (turnstile) return turnstile;
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const donorNameValue = String(
    body.donorName || [body.firstName, body.lastName].filter(Boolean).join(' ') || ''
  ).trim();
  if (!email || !email.includes('@') || !password || !donorNameValue) {
    return json({ error: 'Name, email, and password are required' }, { status: 422 });
  }
  if (body.termsAccepted !== true) {
    return json({ error: 'Agreement to the current Terms of Service is required.' }, { status: 422 });
  }
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, { status: 422 });
  const now = /* @__PURE__ */ new Date().toISOString();
  const existing = await loadDonor(env, email);
  if (existing?.emailVerifiedAt) {
    return json({ error: 'A donor account already exists for this email. Please log in.' }, { status: 409 });
  }
  if (existing?.passwordRecord || existing?.passwordHash) {
    if (!(await verifyDonorPassword(existing, password))) {
      return json(
        {
          error:
            'A donor account already exists for this email. Please log in or use the original password to resend verification.',
        },
        { status: 409 }
      );
    }
  }
  const verificationToken = generateSecret('verify');
  const verificationSalt = generateSecret('verify_salt');
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const invitationNext = directoryInvitationNext(body.next);
  const verificationUrl = `${String(appUrl).replace(/\/+$/, '')}/myagapay/verify?email=${encodeURIComponent(email)}&token=${encodeURIComponent(verificationToken)}${invitationNext ? `&next=${encodeURIComponent(invitationNext)}` : ''}`;
  const donor = await applyDonorPassword(
    {
      ...(existing || {}),
      email,
      donorName: donorNameValue,
      householdName: body.householdName || donorNameValue,
      defaultParishId: body.parishId || body.defaultParishId || existing?.defaultParishId || '',
      emailVerifiedAt: '',
      emailVerificationSalt: verificationSalt,
      emailVerificationTokenHash: await sha256Hex(`${verificationSalt}:${verificationToken}`),
      emailVerificationSentAt: now,
      emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    },
    password
  );
  await recordLegalAcceptance(env, request, {
    actorType: 'adult_account_holder',
    subjectUserId: email,
    actorName: donorNameValue,
    actorEmail: email,
    actorRole: 'adult account holder',
    disclosureText: ACCOUNT_ACCEPTANCE_DISCLOSURE,
    acceptanceSource: 'myagapay_account_creation',
    transactionReference: `donor-signup:${email}:${CURRENT_TERMS_VERSION}`,
  });
  const emailResult = await sendDonorVerificationEmail(env, donor, verificationUrl);
  donor.emailVerificationStatus = emailResult.status || '';
  donor.emailVerificationDetail = emailResult.detail || '';
  await saveDonor(env, donor);
  return json(
    {
      ok: true,
      donor: publicDonor(donor),
      email: { status: emailResult.status || 'unknown', detail: emailResult.detail || '' },
      verificationUrl: emailResult.status === 'not_configured' ? verificationUrl : void 0,
    },
    { status: 201 }
  );
}
async function handleDonorLogin(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, 'donor-login', { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (!email || !password) return json({ error: 'Email and password are required' }, { status: 422 });
  const accountLimited = await rateLimitByKey(request, env, 'donor-login-account', email, {
    limit: 10,
    windowSeconds: 300,
  });
  if (accountLimited) return accountLimited;
  const donor = await loadDonor(env, email);
  if (!donor || !(await verifyDonorPassword(donor, password))) {
    await logEvent(env, {
      eventType: 'donor.login.failed',
      severity: 'warn',
      route: '/api/donor/login',
      method: 'POST',
      retryable: false,
      metadata: { emailHash: await sha256Hex(email) },
    });
    return unauthorized();
  }
  if (donor.accountDeletionRequestedAt) {
    return json(
      {
        error: 'This account is scheduled for deletion. Contact support@agapay.app if you need help.',
        code: 'account_deletion_pending',
      },
      { status: 423 }
    );
  }
  if (!donor.emailVerifiedAt) {
    return json({ error: 'Please verify your email before logging in.', code: 'email_unverified' }, { status: 403 });
  }
  const migrated = donor.passwordRecord ? donor : await applyDonorPassword(donor, password);
  const session = await issueDonorSession(env, migrated);
  return json({ ok: true, token: session.token, donor: publicDonor(session.donor) });
}
export {
  handleDonorClaimCheckout,
  handleDonorLogin,
  handleDonorSession,
  handleDonorSignup,
  issueDonorSession2 as issueDonorSession,
};
