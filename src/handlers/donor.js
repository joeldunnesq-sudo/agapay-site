import { addOutsideDonorPledgeSummary } from "../lib/outside-pledges.js";
import { logEvent } from "../lib/logging.js";
import { directoryInvitationNext } from "../lib/directory-invitation-next.js";
import { ACCOUNT_ACCEPTANCE_DISCLOSURE, CURRENT_TERMS_VERSION, recordLegalAcceptance } from "../lib/legal-acceptance.js";
import {
  applyDonorPassword,
  d1,
  d1First,
  d1Run,
  deleteDonor,
  DONOR_SESSION_TTL_MS,
  generateSecret,
  hashSessionToken,
  hasProductionStore,
  json,
  loadDonor,
  missingProductionStoreResponse,
  normalizeEmail,
  publicDonor,
  rateLimit,
  rateLimitByKey,
  saveDonor,
  secureCompare,
  sha256Hex,
  unauthorized,
  verifyDonorPassword,
  verifyTurnstileIfConfigured,
} from "../lib/core.js";

import { subscriptionTier } from "../lib/subscriptions.js";

import { directoryEnabledFor, exchangeEnabledFor, givingFeatureAccess, hasModuleAccess, prayerRequestsEnabledFor, signupsEnabledFor, stewardshipToolAccess } from "../lib/entitlements.js";
import { parishLifeAvailableFor } from "../lib/parish-life-access.js";
import { parishLifeExperienceFor } from "../lib/parish-life-experience.js";
import { recordParishFeatureRequest } from "../lib/parish-feature-requests.js";
import { submitParishSupportTicket } from "../lib/parish-support-tickets.js";
import { validateSafeExternalUrl } from "../lib/safe-external-url.js";
import { getDirectorySettings } from "../directory/settings.js";
import { getParishLibrarySettings } from "../lib/parish-library.js";
import { resolveDirectorySelfServiceContext, syncSelfServiceContactsFromDonor } from "../directory/self-service.js";
import { migrateConsumerPasskeyEmail } from "../lib/consumer-passkeys.js";

import { agapayEmailHtml, sendEmail } from "../lib/email.js";

import { htmlEscape } from "../lib/format.js";

import { checkoutPaymentIntentId, normalizedCheckoutPaymentStatus, stripeAccountStatus, stripeFormConnectedRequest, stripeGetConnectedRequest } from "../lib/stripe-connect.js";
import { offeringFeeBreakdown } from "../lib/stripe-fees.js";

import {
  donorSummaryFromOfferings,
  findCheckoutParish,
  findRegistrationByParishId,
  loadDonorOfferingByCheckout,
  loadDonorOfferingByPaymentIntent,
  loadDonorOfferings,
  loadReconciledDonorCommemorations,
  migrateDonorEmailReferences,
  paidOfferingStatus,
  parishFromRegistration,
  publicDonorOffering,
  reconcilePendingDonorOfferings,
  requireDonor,
  slugify,
  storeDonorOffering,
  stripePaymentIntentFinancialUpdates,
  updateDonorOfferingByCheckout,
} from "./parish.js";
import { storeCommemorationEntry } from "./parish-commemorations.js";
import { enrichParishGivingOptions } from "./parish-giving-catalog.js";

export {
  bookstoreOrderSource,
  guestBookstoreItemError,
  handleDonorBookstore,
  handleDonorBookstoreIsbnLookup,
  handleDonorBookstoreItemFields,
  handleDonorBookstoreRequestFeature,
  handleParishBookstoreReadiness,
  loadDonorBookstoreProducts,
  normalizeBookstoreCartItems,
} from "./donor-bookstore.js";

export { handleDonorParishCalendar, parseKoinoniaCalendarIcs } from "./donor-parish-calendar.js";

export { handleDonorSacramentAvailability, handleDonorSacramentBook, handleDonorSacramentCancel, handleDonorSacraments } from "./donor-sacraments.js";

export { handleDonorNotificationDismiss, handleDonorNotifications } from "./donor-notifications.js";

export { adminRegistrationSummary, loadAdminRegistrationPage } from "./registration-admin-page.js";

// src/handlers/donor.js
// Donor session, dashboard, offerings, commemorations, and password handlers.

export async function handleDonorClaimCheckout(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-claim-checkout", { limit: 12, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = String(body.sessionId || body.session_id || "").trim();
  const password = String(body.password || "");
  if (!sessionId.startsWith("cs_")) return json({ error: "A valid checkout session is required" }, { status: 422 });
  if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, { status: 422 });

  const offering = await loadDonorOfferingByCheckout(env, sessionId);
  if (!offering) return json({ error: "Checkout session is not tracked by AGAPAY" }, { status: 404 });

  const parish = await findCheckoutParish(env, offering.parishId);
  if (!parish?.stripeAccountId) {
    return json({ error: "Parish Stripe account is not connected yet" }, { status: 422 });
  }

  let verifiedSession = null;
  const stripe = await stripeGetConnectedRequest(env, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, parish.stripeAccountId);
  if (stripe.ok) {
    verifiedSession = stripe.body || {};
    const paymentIntentId = checkoutPaymentIntentId(verifiedSession);
    const paymentStatus = normalizedCheckoutPaymentStatus(verifiedSession, offering.paymentStatus);
    let status = offering.status || "checkout_created";
    if (paymentStatus === "paid" || verifiedSession.status === "complete") status = "completed";
    if (verifiedSession.status === "expired") status = "expired";
    const feeUpdates = status === "completed" || paymentStatus === "paid" ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, offering.parishId, offering) : {};
    await updateDonorOfferingByCheckout(env, sessionId, {
      status,
      paymentStatus,
      stripeCustomerId: verifiedSession.customer || offering.stripeCustomerId || "",
      stripePaymentIntentId: paymentIntentId || offering.stripePaymentIntentId || "",
      stripeSubscriptionId: verifiedSession.subscription || offering.stripeSubscriptionId || "",
      completedAt: status === "completed" ? offering.completedAt || new Date().toISOString() : offering.completedAt || "",
      ...feeUpdates,
    });
  }

  const refreshed = (await loadDonorOfferingByCheckout(env, sessionId)) || offering;
  const isPaid = refreshed.status === "completed" || refreshed.paymentStatus === "paid" || refreshed.paymentStatus === "succeeded";
  if (!isPaid) {
    return json({ error: "Payment is still processing. Please wait and try again in a moment." }, { status: 409 });
  }

  const donorEmail = normalizeEmail(refreshed.donorEmail || verifiedSession?.customer_details?.email || verifiedSession?.customer_email || "");
  if (!donorEmail) return json({ error: "A donor email is required before creating an account." }, { status: 422 });

  const existing = await loadDonor(env, donorEmail);
  if (existing?.emailVerifiedAt) {
    return json(
      {
        error: "A donor account already exists for this email. Please log in from the donor sign-in page.",
        code: "account_exists",
      },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const donorNameValue = String(body.donorName || body.householdName || refreshed.donorName || existing?.donorName || donorEmail.split("@")[0]).trim();

  const donorBase = {
    ...(existing || {}),
    email: donorEmail,
    donorName: donorNameValue,
    householdName: donorNameValue,
    defaultParishId: refreshed.parishId || existing?.defaultParishId || "",
    emailVerifiedAt: now,
    emailVerificationSalt: "",
    emailVerificationTokenHash: "",
    emailVerificationSentAt: "",
    emailVerificationExpiresAt: "",
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
    status: refreshed.status || "completed",
    paymentStatus: refreshed.paymentStatus || "paid",
  });
}

export async function handleDonorSession(request, env) {
  return handleDonorLogin(request, env);
}

export async function issueDonorSession(env, donor) {
  const token = generateSecret("agp_donor");
  const sessionSalt = generateSecret("session");
  const updated = {
    ...donor,
    sessionSalt,
    sessionTokenHash: await hashSessionToken(token, sessionSalt),
    sessionExpiresAt: new Date(Date.now() + DONOR_SESSION_TTL_MS).toISOString(),
    lastLoginAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveDonor(env, updated);
  return { token, donor: updated };
}

export async function sendDonorVerificationEmail(env, donor, verificationUrl) {
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const safeUrl = htmlEscape(verificationUrl);
  const name = htmlEscape(donor.donorName || donor.householdName || "friend");
  const diagnostic = donor.isDiagnostic === true;
  const diagnosticBanner = diagnostic
    ? `<p style="margin:0 0 18px;padding:12px 14px;border:1px solid rgba(201,162,91,0.52);border-radius:10px;background:#FFF8EA;font-size:14px;line-height:1.6;color:#171715;"><strong>Delivery test:</strong> No donor account was created and the verification link is intentionally nonfunctional.</p>`
    : "";

  return sendEmail(env, {
    from,
    to: [donor.email],
    reply_to: replyTo,
    subject: `${diagnostic ? "[TEST] " : ""}Verify your AGAPAY donor account`,
    html: agapayEmailHtml(
      appUrl,
      "Verify your donor account",
      `
      ${diagnosticBanner}
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Hello ${name}, please verify your email address to finish setting up your AGAPAY donor dashboard.</p>
      <p style="margin:0 0 24px;"><a href="${safeUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Verify email address</a></p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#171715;">After verification, you can sign in to your donor dashboard to view offering history, submit commemorations, and give through AGAPAY.</p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6F6A60;">If you did not create this AGAPAY account, you can ignore this email.</p>
    `
    ),
  });
}

export async function sendDonorPasswordResetEmail(env, donor, resetUrl) {
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const safeUrl = htmlEscape(resetUrl);
  const name = htmlEscape(donor.donorName || donor.householdName || "friend");

  return sendEmail(env, {
    from,
    to: [donor.email],
    reply_to: replyTo,
    subject: "Reset your AGAPAY donor password",
    html: agapayEmailHtml(
      appUrl,
      "Reset your donor password",
      `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ, ${name}.</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Use this secure link to choose a new password for your AGAPAY donor dashboard.</p>
      <p style="margin:0 0 24px;"><a href="${safeUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Reset donor password</a></p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6F6A60;">If you did not request this, ignore this email. The link expires in 1 hour.</p>
    `
    ),
    text: ["Reset your AGAPAY donor password", "", `Open this link to choose a new password: ${resetUrl}`, "", "If you did not request this, ignore this email. The link expires in 1 hour."].join("\n"),
  });
}

export async function handleDonorPasswordResetRequest(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-password-reset-request", { limit: 6, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "Email is required" }, { status: 422 });

  const generic = {
    ok: true,
    message: "If a verified donor account exists for that email, a reset link has been sent.",
  };
  const donor = await loadDonor(env, email);
  if (!donor?.emailVerifiedAt) return json(generic);

  const resetToken = generateSecret("donor_reset");
  const resetSalt = generateSecret("donor_reset_salt");
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const resetUrl = `${String(appUrl).replace(/\/+$/, "")}/myagapay/login?reset=1&email=${encodeURIComponent(email)}&token=${encodeURIComponent(resetToken)}`;
  const updated = {
    ...donor,
    passwordResetSalt: resetSalt,
    passwordResetTokenHash: await sha256Hex(`${resetSalt}:${resetToken}`),
    passwordResetSentAt: new Date().toISOString(),
    passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const emailResult = await sendDonorPasswordResetEmail(env, updated, resetUrl);
  updated.passwordResetEmailStatus = emailResult.status || "";
  updated.passwordResetEmailDetail = emailResult.detail || "";
  await saveDonor(env, updated);

  return json({
    ...generic,
    email: { status: emailResult.status || "unknown", detail: emailResult.detail || "" },
    resetUrl: emailResult.status === "not_configured" ? resetUrl : undefined,
  });
}

export async function handleDonorPasswordResetConfirm(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-password-reset-confirm", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const token = String(body.token || "");
  const newPassword = String(body.newPassword || body.password || "").trim();
  const confirmPassword = String(body.confirmPassword || body.newPassword || body.password || "").trim();
  if (!email || !token) return json({ error: "Email and reset token are required" }, { status: 422 });
  if (newPassword.length < 8) return json({ error: "Password must be at least 8 characters" }, { status: 422 });
  if (newPassword !== confirmPassword) return json({ error: "Passwords do not match" }, { status: 422 });

  const donor = await loadDonor(env, email);
  if (!donor?.emailVerifiedAt) return unauthorized();
  if (!donor.passwordResetSalt || !donor.passwordResetTokenHash) {
    return json({ error: "Reset link is missing or expired. Please request a new link." }, { status: 410 });
  }
  if (donor.passwordResetExpiresAt && new Date(donor.passwordResetExpiresAt).getTime() < Date.now()) {
    return json({ error: "Reset link expired. Please request a new link." }, { status: 410 });
  }
  const submittedHash = await sha256Hex(`${donor.passwordResetSalt}:${token}`);
  if (!secureCompare(submittedHash, donor.passwordResetTokenHash)) return unauthorized();

  const reset = await applyDonorPassword(
    {
      ...donor,
      passwordResetSalt: "",
      passwordResetTokenHash: "",
      passwordResetSentAt: "",
      passwordResetExpiresAt: "",
      passwordResetEmailStatus: "",
      passwordResetEmailDetail: "",
      sessionSalt: "",
      sessionTokenHash: "",
      sessionExpiresAt: "",
      updatedAt: new Date().toISOString(),
    },
    newPassword
  );
  await saveDonor(env, reset);
  return json({ ok: true, updatedAt: reset.passwordUpdatedAt || new Date().toISOString() });
}

export function formatUsdFromCents(centsValue) {
  return (Number(centsValue || 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function offeringLabel(offering = {}) {
  if (offering.title) return String(offering.title);
  const giftType = String(offering.giftType || "offering").replace(/-/g, " ");
  const parishName = offering.parishName || "your parish";
  return `${parishName} - ${giftType}`;
}

export async function sendDonorDonationReceiptEmail(env, offering = {}) {
  const donorEmail = normalizeEmail(offering.donorEmail);
  if (!donorEmail) return { status: "missing_recipient" };
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const donorName = htmlEscape(offering.donorName || "friend");
  const lineItem = htmlEscape(offeringLabel(offering));
  const parishName = htmlEscape(offering.parishName || "Orthodox parish");
  const fees = offeringFeeBreakdown(offering);
  const amount = formatUsdFromCents(fees.giftAmountCents);
  const chargeAmount = formatUsdFromCents(fees.chargeCents);
  const parishReceived = formatUsdFromCents(fees.parishNetCents);
  const totalFees = formatUsdFromCents(fees.totalFeeCents);
  const donorCovered = formatUsdFromCents(fees.donorCoveredFeeCents);
  const stripeReference = htmlEscape(offering.stripePaymentIntentId || offering.checkoutSessionId || offering.id || "");
  const donatedAt = htmlEscape(
    new Date(offering.completedAt || offering.createdAt || Date.now()).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  );
  const dashboardUrl = htmlEscape(`${String(appUrl).replace(/\/+$/, "")}/myagapay`);
  const diagnostic = offering.isDiagnostic === true;
  const diagnosticBanner = diagnostic
    ? `<p style="margin:0 0 18px;padding:12px 14px;border:1px solid rgba(201,162,91,0.52);border-radius:10px;background:#FFF8EA;font-size:14px;line-height:1.6;color:#171715;"><strong>Delivery test:</strong> No payment or donation occurred. The values below are template-rendering fixtures only.</p>`
    : "";
  // AGAPAY does not charge a donation platform fee -- totalFees here is
  // Stripe's own processing cost only. AGAPAY's revenue is the parish
  // subscription plan, not a percentage of this gift.
  const feeDetail = fees.coverFees
    ? `<p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Fees covered by you:</strong> ${htmlEscape(donorCovered)}</p>
       <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Parish received:</strong> ${htmlEscape(parishReceived)}</p>`
    : `<p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Stripe processing fee deducted:</strong> ${htmlEscape(totalFees)}</p>
       <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Parish received:</strong> ${htmlEscape(parishReceived)}</p>`;
  const coverFeesNote = fees.coverFees
    ? ""
    : `
      <p style="margin:0 0 18px;padding:13px 15px;border-left:3px solid #C9A25B;background:#FFF8EA;font-size:14px;line-height:1.65;color:#171715;">
        Next time, you can choose to cover the processing fees so ${parishName} receives the full intended gift.
      </p>`;
  return sendEmail(env, {
    from,
    to: [donorEmail],
    reply_to: replyTo,
    subject: `${diagnostic ? "[TEST] " : ""}AGAPAY receipt - ${amount} to ${offering.parishName || "your parish"}`,
    html: agapayEmailHtml(
      appUrl,
      "Donation receipt",
      `
      ${diagnosticBanner}
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ, ${donorName}.</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Your gift has been received successfully through AGAPAY.</p>
      <div style="margin:0 0 20px;padding:16px 18px;border:1px solid rgba(201,162,91,0.34);border-radius:12px;background:#FDF9F0;">
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Your gift:</strong> ${htmlEscape(amount)}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Amount charged:</strong> ${htmlEscape(chargeAmount)}</p>
        ${feeDetail}
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Parish:</strong> ${parishName}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Offering:</strong> ${lineItem}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Date:</strong> ${donatedAt}</p>
        ${stripeReference ? `<p style="margin:0;font-size:12px;color:#6F6A60;"><strong>Stripe reference:</strong> ${stripeReference}</p>` : ""}
      </div>
      ${coverFeesNote}
      <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#171715;">You can view this gift in your donor dashboard and keep track of your offering history there.</p>
      <p style="margin:0;"><a href="${dashboardUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:12px 18px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:17px;font-style:italic;font-weight:600;">Open donor dashboard</a></p>
    `
    ),
  });
}

export async function sendDonationReceiptIfNeeded(env, offering = {}) {
  if (!offering) return offering;
  if (offering.emailReceiptSentAt) return offering;
  const paidLike = offering.status === "completed" || offering.paymentStatus === "paid" || offering.paymentStatus === "succeeded";
  if (!paidLike) return offering;

  let current = offering;
  if (offering.checkoutSessionId) {
    const byCheckout = await loadDonorOfferingByCheckout(env, offering.checkoutSessionId);
    if (byCheckout) current = byCheckout;
  } else if (offering.stripePaymentIntentId) {
    const byIntent = await loadDonorOfferingByPaymentIntent(env, offering.stripePaymentIntentId);
    if (byIntent) current = byIntent;
  }
  if (current.emailReceiptSentAt) return current;

  const email = await sendDonorDonationReceiptEmail(env, current);
  const updates = {
    emailReceiptStatus: email.status || "unknown",
    emailReceiptId: email.id || "",
    emailReceiptDetail: email.detail || "",
    emailReceiptSentAt: email.status === "sent" ? new Date().toISOString() : "",
  };
  return storeDonorOffering(env, { ...current, ...updates });
}

export async function handleDonorSignup(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-signup", { limit: 8, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const turnstile = await verifyTurnstileIfConfigured(request, env, body.turnstileToken || body.cfTurnstileToken);
  if (turnstile) return turnstile;

  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const donorNameValue = String(body.donorName || [body.firstName, body.lastName].filter(Boolean).join(" ") || "").trim();
  if (!email || !email.includes("@") || !password || !donorNameValue) {
    return json({ error: "Name, email, and password are required" }, { status: 422 });
  }
  if (body.termsAccepted !== true) {
    return json({ error: "Agreement to the current Terms of Service is required." }, { status: 422 });
  }
  if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, { status: 422 });

  const now = new Date().toISOString();
  const existing = await loadDonor(env, email);
  if (existing?.emailVerifiedAt) {
    return json({ error: "A donor account already exists for this email. Please log in." }, { status: 409 });
  }
  if (existing?.passwordRecord || existing?.passwordHash) {
    if (!(await verifyDonorPassword(existing, password))) {
      return json(
        {
          error: "A donor account already exists for this email. Please log in or use the original password to resend verification.",
        },
        { status: 409 }
      );
    }
  }

  const verificationToken = generateSecret("verify");
  const verificationSalt = generateSecret("verify_salt");
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const invitationNext = directoryInvitationNext(body.next);
  const verificationUrl = `${String(appUrl).replace(/\/+$/, "")}/myagapay/verify?email=${encodeURIComponent(email)}&token=${encodeURIComponent(verificationToken)}${invitationNext ? `&next=${encodeURIComponent(invitationNext)}` : ""}`;
  const donor = await applyDonorPassword(
    {
      ...(existing || {}),
      email,
      donorName: donorNameValue,
      householdName: body.householdName || donorNameValue,
      defaultParishId: body.parishId || body.defaultParishId || existing?.defaultParishId || "",
      emailVerifiedAt: "",
      emailVerificationSalt: verificationSalt,
      emailVerificationTokenHash: await sha256Hex(`${verificationSalt}:${verificationToken}`),
      emailVerificationSentAt: now,
      emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    },
    password
  );

  await recordLegalAcceptance(env, request, {
    actorType: "adult_account_holder",
    subjectUserId: email,
    actorName: donorNameValue,
    actorEmail: email,
    actorRole: "adult account holder",
    disclosureText: ACCOUNT_ACCEPTANCE_DISCLOSURE,
    acceptanceSource: "myagapay_account_creation",
    transactionReference: `donor-signup:${email}:${CURRENT_TERMS_VERSION}`,
  });

  const emailResult = await sendDonorVerificationEmail(env, donor, verificationUrl);
  donor.emailVerificationStatus = emailResult.status || "";
  donor.emailVerificationDetail = emailResult.detail || "";
  await saveDonor(env, donor);

  return json(
    {
      ok: true,
      donor: publicDonor(donor),
      email: { status: emailResult.status || "unknown", detail: emailResult.detail || "" },
      verificationUrl: emailResult.status === "not_configured" ? verificationUrl : undefined,
    },
    { status: 201 }
  );
}

export async function handleDonorLogin(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-login", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!email || !password) return json({ error: "Email and password are required" }, { status: 422 });
  const accountLimited = await rateLimitByKey(request, env, "donor-login-account", email, {
    limit: 10,
    windowSeconds: 300,
  });
  if (accountLimited) return accountLimited;

  const donor = await loadDonor(env, email);
  if (!donor || !(await verifyDonorPassword(donor, password))) {
    await logEvent(env, {
      eventType: "donor.login.failed",
      severity: "warn",
      route: "/api/donor/login",
      method: "POST",
      retryable: false,
      metadata: { emailHash: await sha256Hex(email) },
    });
    return unauthorized();
  }
  if (donor.accountDeletionRequestedAt) {
    return json(
      {
        error: "This account is scheduled for deletion. Contact support@agapay.app if you need help.",
        code: "account_deletion_pending",
      },
      { status: 423 }
    );
  }
  if (!donor.emailVerifiedAt) {
    return json({ error: "Please verify your email before logging in.", code: "email_unverified" }, { status: 403 });
  }

  const migrated = donor.passwordRecord ? donor : await applyDonorPassword(donor, password);
  const session = await issueDonorSession(env, migrated);
  return json({ ok: true, token: session.token, donor: publicDonor(session.donor) });
}

export async function handleDonorVerify(request, env) {
  if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-verify", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;

  let email = "";
  let token = "";
  const url = new URL(request.url);
  if (request.method === "GET") {
    email = normalizeEmail(url.searchParams.get("email"));
    token = String(url.searchParams.get("token") || "");
  } else {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }
    email = normalizeEmail(body.email);
    token = String(body.token || "");
  }

  if (!email || !token) return json({ error: "Verification email and token are required" }, { status: 422 });
  const donor = await loadDonor(env, email);
  if (!donor) return unauthorized();

  const hasVerificationToken = donor.emailVerificationSalt && donor.emailVerificationTokenHash;
  if (!hasVerificationToken) {
    if (donor.emailVerifiedAt) {
      return json({ ok: true, alreadyVerified: true });
    }
    return json({ error: "Verification token is missing or expired. Please sign up again to resend verification." }, { status: 410 });
  }
  if (donor.emailVerificationExpiresAt && new Date(donor.emailVerificationExpiresAt).getTime() < Date.now()) {
    if (donor.emailVerifiedAt) {
      return json({ ok: true, alreadyVerified: true });
    }
    return json({ error: "Verification link expired. Please sign up again to resend verification." }, { status: 410 });
  }
  const submittedHash = await sha256Hex(`${donor.emailVerificationSalt}:${token}`);
  if (!secureCompare(submittedHash, donor.emailVerificationTokenHash)) return unauthorized();
  if (donor.emailVerifiedAt) {
    const session = await issueDonorSession(env, donor);
    return json({ ok: true, alreadyVerified: true, token: session.token, donor: publicDonor(session.donor) });
  }

  const verified = {
    ...donor,
    emailVerifiedAt: new Date().toISOString(),
    emailVerificationSalt: "",
    emailVerificationTokenHash: "",
    emailVerificationExpiresAt: "",
    updatedAt: new Date().toISOString(),
  };
  const session = await issueDonorSession(env, verified);
  return json({ ok: true, token: session.token, donor: publicDonor(session.donor) });
}

export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function donorVerifyHtml({ title, message, status = "info", script = "", refreshUrl = "" }, init = {}) {
  const statusClass = status === "success" ? "success" : status === "error" ? "error" : "";
  const refresh = refreshUrl ? `<meta http-equiv="refresh" content="2; url=${htmlEscape(refreshUrl)}" />` : "";
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${refresh}
  <title>${htmlEscape(title)} | AGAPAY</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/donor/style.css" />
</head>
<body>
  <div class="app">
    <main class="content" style="min-height:100vh;">
      <div class="page">
        <section class="hero">
          <div class="hero-grid">
            <div>
              <div class="eyebrow">Email verification</div>
              <h1>${htmlEscape(title)}</h1>
              <p>${htmlEscape(message)}</p>
              <div class="notice ${statusClass}" style="margin-top:1rem;">${htmlEscape(message)}</div>
              <p class="form-help" style="margin-top:1rem;"><a href="/myagapay/login">Go to My AGAPAY login</a></p>
            </div>
            <div class="hero-mark"><img src="/mark.png" alt="" /></div>
          </div>
        </section>
      </div>
    </main>
  </div>
  ${script}
</body>
</html>`,
    {
      ...init,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        ...(init.headers || {}),
      },
    }
  );
}

export async function handleDonorVerifyPage(request, env) {
  if (request.method !== "GET") {
    return donorVerifyHtml(
      {
        title: "Verification link unavailable",
        message: "Open your donor verification link in a browser to confirm your email.",
        status: "error",
      },
      { status: 405 }
    );
  }

  const verification = await handleDonorVerify(request, env);
  const data = await verification.json().catch(() => ({}));
  const invitationNext = directoryInvitationNext(new URL(request.url).searchParams.get("next"));
  const destination = invitationNext || "/myagapay";

  if (!verification.ok) {
    return donorVerifyHtml(
      {
        title: "We could not verify your email",
        message: data.error || data.detail || "This verification link is invalid or expired. Please sign up again to request a new link.",
        status: "error",
      },
      { status: verification.status }
    );
  }

  if (!data.token) {
    return donorVerifyHtml(
      {
        title: "Email already verified",
        message: "Your email is already verified. Please log in to open your donor dashboard.",
        status: "success",
        refreshUrl: invitationNext ? `/myagapay/login?next=${encodeURIComponent(invitationNext)}` : "/myagapay/login",
      },
      { status: 200 }
    );
  }

  const session = {
    email: data.donor?.email || new URL(request.url).searchParams.get("email") || "",
    token: data.token,
    donor: data.donor || {},
  };
  const script = `<script>
(() => {
  const session = ${jsonForScript(session)};
  try {
    if (session.email) localStorage.setItem("agapayDonorEmail", session.email);
    if (session.token) localStorage.setItem("agapayDonorToken", session.token);
    if (session.donor) localStorage.setItem("agapayDonorProfile", JSON.stringify(session.donor));
  } catch (err) {}
  window.location.replace(${jsonForScript(destination)});
})();
</script>`;

  return donorVerifyHtml(
    {
      title: "Email verified",
      message: data.alreadyVerified ? "Your email was already verified. Opening your donor dashboard." : "Your email is verified. Opening your donor dashboard.",
      status: "success",
      script,
      refreshUrl: destination,
    },
    { status: 200 }
  );
}

// Sums how much THIS donor has personally given to each of the parish's active
// campaigns, and annotates each campaign object with donorGivenCents /
// donorGiftCount / donorLastGiftAt. Lets the My AGAPAY home card show the donor
// their own contribution under the campaign description (and nudge those at $0).
// Each paid offering carries a single campaign identifier (campaign/campaignId),
// so membership-testing against a campaign's candidate keys can't double-count.
function attachDonorCampaignGiving(parish, offerings) {
  if (!parish) return parish;
  const groups = [parish.campaigns, parish.feastCampaigns].filter(Array.isArray);
  if (!groups.length) return parish;
  const norm = (v) =>
    String(v || "")
      .trim()
      .toLowerCase();

  const paidCampaignGifts = offerings
    .filter(paidOfferingStatus)
    .map((o) => ({
      key: norm(o.campaign || o.campaignId || o.campaignName || o.campaignSlug),
      cents: offeringFeeBreakdown(o).giftAmountCents,
      at: o.createdAt || "",
    }))
    .filter((g) => g.key);

  for (const group of groups) {
    for (const campaign of group) {
      if (!campaign || typeof campaign !== "object") continue;
      const keys = new Set([campaign.id, campaign.feastId, campaign.name, campaign.campaignName, campaign.slug, slugify(campaign.name || campaign.campaignName || "")].map(norm).filter(Boolean));
      let cents = 0,
        count = 0,
        last = "";
      for (const g of paidCampaignGifts) {
        if (!keys.has(g.key)) continue;
        cents += g.cents;
        count += 1;
        if (g.at > last) last = g.at;
      }
      campaign.donorGivenCents = cents;
      campaign.donorGiftCount = count;
      campaign.donorLastGiftAt = last || null;
    }
  }
  return parish;
}

export async function handleDonorDashboard(request, env) {
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();

  if (request.method === "PATCH") {
    const limited = await rateLimit(request, env, "donor-settings", { limit: 20, windowSeconds: 300 });
    if (limited) return limited;

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const directoryContext = await resolveDirectorySelfServiceContext(env, { request }).catch(() => null);

    let updated = {
      ...donor,
      donorName: body.donorName ?? donor.donorName,
      householdName: body.householdName ?? donor.householdName,
      contactPhone: body.contactPhone ?? body.phone ?? donor.contactPhone ?? "",
      defaultParishId: body.defaultParishId ?? body.parishId ?? donor.defaultParishId,
      pledgeAmountCents: Number.isFinite(Number(body.pledgeAmountCents)) ? Math.max(0, Math.round(Number(body.pledgeAmountCents))) : Number(donor.pledgeAmountCents || 0),
      pledgeCadence: body.pledgeCadence === "monthly" ? "monthly" : body.pledgeCadence === "annual" ? "annual" : donor.pledgeCadence === "monthly" ? "monthly" : "annual",
      pledgeYear: body.pledgeYear ?? donor.pledgeYear ?? "",
      addressLine1: body.addressLine1 ?? donor.addressLine1 ?? "",
      addressLine2: body.addressLine2 ?? donor.addressLine2 ?? "",
      city: body.city ?? donor.city ?? "",
      state: body.state ?? donor.state ?? "",
      postalCode: body.postalCode ?? donor.postalCode ?? "",
      country: body.country ?? donor.country ?? "",
      updatedAt: new Date().toISOString(),
    };

    const requestedEmail = normalizeEmail(body.email || donor.email);
    const emailChanged = requestedEmail && requestedEmail !== normalizeEmail(donor.email);
    if (emailChanged) {
      const currentPassword = String(body.currentPassword || "");
      if (!(await verifyDonorPassword(donor, currentPassword))) return unauthorized();
      const existing = await loadDonor(env, requestedEmail);
      if (existing) return json({ error: "That email address is already connected to a donor account" }, { status: 409 });
      updated = {
        ...updated,
        email: requestedEmail,
        emailVerifiedAt: new Date().toISOString(),
        emailChangedAt: new Date().toISOString(),
      };
    }

    if (body.newPassword) {
      const currentPassword = String(body.currentPassword || "");
      if (!(await verifyDonorPassword(donor, currentPassword))) return unauthorized();
      if (String(body.newPassword).length < 8) return json({ error: "Password must be at least 8 characters" }, { status: 422 });
      updated = await applyDonorPassword(updated, body.newPassword);
    }

    if (emailChanged) {
      const passkeyMigration = await migrateConsumerPasskeyEmail(env, donor.email, requestedEmail);
      if (passkeyMigration.conflict) {
        return json({ error: "That email address is already connected to another passkey account" }, { status: 409 });
      }
      await migrateDonorEmailReferences(env, donor.email, requestedEmail);
      await deleteDonor(env, donor.email);
    }
    await saveDonor(env, updated);
    if (directoryContext?.claimed) {
      await syncSelfServiceContactsFromDonor(env, {
        context: directoryContext,
        donor: updated,
        correlationId: request.headers.get("X-Correlation-ID") || "",
      }).catch(() => null);
    }

    // Sync pledge amount to household_pledges for parish stewardship reporting.
    // Runs whenever the donor saves settings — harmless no-op if D1 isn't available
    // or if the donor hasn't set a home parish yet.
    const pledgeSyncParish = updated.defaultParishId || "";
    // Parish stewardship reports remain annual. A monthly donor pledge is
    // annualized here while My AGAPAY retains the donor's chosen cadence.
    const pledgeSyncAmount = Number(updated.pledgeAmountCents || 0) * (updated.pledgeCadence === "monthly" ? 12 : 1);
    if (d1(env) && pledgeSyncParish.trim()) {
      const pledgeSyncYear = parseInt(updated.pledgeYear || new Date().getFullYear(), 10);
      await env.AGAPAY_DB.prepare(
        `
        INSERT INTO household_pledges (donor_email, parish_id, fiscal_year, target_amount_cents)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(donor_email, parish_id, fiscal_year) DO UPDATE SET
          target_amount_cents = excluded.target_amount_cents,
          updated_at          = datetime('now')
      `
      )
        .bind(updated.email, pledgeSyncParish, pledgeSyncYear, pledgeSyncAmount)
        .run()
        .catch(() => {});
    }

    return json({ ok: true, donor: publicDonor(updated) });
  }

  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const publicOfferings = offerings.map(publicDonorOffering);
  const commemorations = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
  const summary = await addOutsideDonorPledgeSummary(env, donor, donorSummaryFromOfferings(offerings, commemorations));
  let parish = null;
  if (donor.defaultParishId) {
    const found = await findRegistrationByParishId(env, donor.defaultParishId);
    if (found) {
      parish = parishFromRegistration(found.registration);
      if (parish) {
        const [directorySettings, librarySettings] = await Promise.all([getDirectorySettings(env, parish.id), getParishLibrarySettings(env.AGAPAY_DB || env.DB, parish.id)]);
        parish.directoryEnabled = directoryEnabledFor(found.registration, directorySettings);
        parish.libraryEnabled = librarySettings.enabled && hasModuleAccess(found.registration, "library");
        const parishLifeExperience = parishLifeExperienceFor(found.registration);
        parish.communicationsEnabled = parishLifeExperience.communicationsEnabled;
        parish.signupsEnabled = signupsEnabledFor(found.registration);
        parish.exchangeEnabled = exchangeEnabledFor(found.registration);
        parish.prayerRequestsEnabled = prayerRequestsEnabledFor(found.registration);
        parish.parishLifeLabel = parishLifeExperience.label;
        parish.parishLifeAvailable = parishLifeAvailableFor(env);
        parish.pledgeTrackerEnabled = stewardshipToolAccess(found.registration);
      }
    }
    if (parish) parish = await enrichParishGivingOptions(env, parish);
    if (parish) parish = attachDonorCampaignGiving(parish, offerings);
  }

  return json({
    donor: publicDonor(donor),
    parish,
    summary,
    recentOfferings: publicOfferings.slice(0, 5),
    recentCommemorations: commemorations.slice(0, 5),
  });
}

export async function handleDonorSupportTicket(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const limited = await rateLimit(request, env, "donor-support-ticket", { limit: 8, windowSeconds: 300 });
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Support request was invalid." }, { status: 400 });

  const parishId = String(donor.defaultParishId || "").trim();
  const found = parishId ? await findRegistrationByParishId(env, parishId) : null;
  const registration = found?.registration || {};
  const result = await submitParishSupportTicket(
    env,
    request,
    {
      parishId,
      parishName: registration.parishName || registration.name || "My AGAPAY",
      email: donor.email,
    },
    {
      ...body,
      source: "myagapay",
      submittedBy: donor.email,
      page: String(body.page || "myagapay").slice(0, 80),
      path: String(body.path || new URL(request.url).pathname).slice(0, 240),
    }
  );
  return json(result, { status: result.ok ? 201 : result.status || 500 });
}

export async function handleDonorAccountDeletion(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const limited = await rateLimitByKey(request, env, "donor-account-deletion", donor.email, {
    limit: 3,
    windowSeconds: 86400,
  });
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  if (!body || body.confirmation !== "DELETE") {
    return json({ error: "Type DELETE to confirm the account deletion request." }, { status: 422 });
  }
  if (!(await verifyDonorPassword(donor, String(body.currentPassword || "")))) {
    return json({ error: "Your current password was not accepted." }, { status: 403 });
  }

  const requestedAt = new Date().toISOString();
  const requestId = `account_delete_${crypto.randomUUID()}`;
  if (d1(env)) {
    await d1Run(
      env,
      `INSERT INTO account_deletion_requests
       (id, donor_email, status, source, requested_at, updated_at)
       VALUES (?1, ?2, 'pending', ?3, ?4, ?4)`,
      requestId,
      donor.email,
      String(body.source || "myagapay-account-settings").slice(0, 80),
      requestedAt
    );
  } else if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(
      `account-deletion-request:${requestId}`,
      JSON.stringify({
        id: requestId,
        donorEmail: donor.email,
        status: "pending",
        source: String(body.source || "myagapay-account-settings").slice(0, 80),
        requestedAt,
        updatedAt: requestedAt,
      })
    );
  }

  await saveDonor(env, {
    ...donor,
    accountDeletionRequestId: requestId,
    accountDeletionRequestedAt: requestedAt,
    sessionSalt: "",
    sessionTokenHash: "",
    sessionExpiresAt: "",
    updatedAt: requestedAt,
  });
  await logEvent(env, {
    eventType: "donor.account_deletion.requested",
    severity: "info",
    route: "/api/donor/account-deletion",
    method: "POST",
    retryable: false,
    metadata: { requestId, emailHash: await sha256Hex(donor.email) },
  });

  return json(
    {
      ok: true,
      requestId,
      requestedAt,
      message: "Your account deletion request has been received. AGAPAY will complete it within 30 days and retain only records required by law.",
    },
    { status: 202 }
  );
}

export async function handleDonorStewardshipFeatureRequest(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!donor.defaultParishId) {
    return json({ error: "Choose your home parish before sending this request." }, { status: 422 });
  }

  const limited = await rateLimitByKey(request, env, "donor-stewardship-feature-request", `${donor.email}:${donor.defaultParishId}`, { limit: 3, windowSeconds: 86400 });
  if (limited) return limited;

  const found = await findRegistrationByParishId(env, donor.defaultParishId);
  if (!found) return json({ error: "Your selected parish could not be found." }, { status: 404 });
  if (stewardshipToolAccess(found.registration)) {
    return json({ ok: true, alreadyEnabled: true, message: "Your parish already includes pledge tracking." });
  }

  const result = await recordParishFeatureRequest(env, {
    parishId: donor.defaultParishId,
    featureId: "pledge-tracker",
    donorEmail: donor.email,
  });
  return json(
    {
      ok: true,
      duplicate: result.duplicate,
      message: result.duplicate ? "Your parish has already received your request." : "Thank you. Your parish will see this request the next time they open their dashboard.",
    },
    { status: result.duplicate ? 200 : 201 }
  );
}

export async function handleDonorGivingPlusFeatureRequest(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!donor.defaultParishId) {
    return json({ error: "Choose your home parish before sending this request." }, { status: 422 });
  }

  const limited = await rateLimitByKey(request, env, "donor-giving-plus-feature-request", `${donor.email}:${donor.defaultParishId}`, { limit: 3, windowSeconds: 86400 });
  if (limited) return limited;

  const found = await findRegistrationByParishId(env, donor.defaultParishId);
  if (!found) return json({ error: "Your selected parish could not be found." }, { status: 404 });
  if (givingFeatureAccess(found.registration, "campaigns")) {
    return json({ ok: true, alreadyEnabled: true, message: "Your parish already includes Give +." });
  }

  const result = await recordParishFeatureRequest(env, {
    parishId: donor.defaultParishId,
    featureId: "giving-plus",
    donorEmail: donor.email,
  });
  return json(
    {
      ok: true,
      duplicate: result.duplicate,
      message: result.duplicate ? "Your parish has already received your request." : "Thank you. Your parish will see this request the next time they open their dashboard.",
    },
    { status: result.duplicate ? 200 : 201 }
  );
}

export async function handleDonorMinistryServiceInterest(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  if (!donor.defaultParishId) {
    return json({ error: "Choose your home parish before sending this request." }, { status: 422 });
  }

  const limited = await rateLimitByKey(request, env, "donor-ministry-service-interest", `${donor.email}:${donor.defaultParishId}`, { limit: 3, windowSeconds: 86400 });
  if (limited) return limited;

  const found = await findRegistrationByParishId(env, donor.defaultParishId);
  if (!found) return json({ error: "Your selected parish could not be found." }, { status: 404 });
  const result = await recordParishFeatureRequest(env, {
    parishId: donor.defaultParishId,
    featureId: "ministry-service",
    donorEmail: donor.email,
  });
  return json(
    {
      ok: true,
      duplicate: result.duplicate,
      message: result.duplicate ? "Your parish has already received your interest." : "Thank you. Your parish dashboard has been notified that a parishioner wants to serve.",
    },
    { status: result.duplicate ? 200 : 201 }
  );
}

export async function handleDonorOfferings(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const commemorations = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
  return json({
    offerings: offerings.map(publicDonorOffering),
    summary: await addOutsideDonorPledgeSummary(env, donor, donorSummaryFromOfferings(offerings, commemorations)),
  });
}

export async function handleDonorSubscriptionPortal(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "donor-money-actions", { limit: 10, windowSeconds: 300 });
  if (limited) return limited;

  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const requestedParishId = String(body.parishId || donor.defaultParishId || "").trim();
  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const recurringOfferings = offerings
    .filter((offering) => offering.stripeCustomerId && offering.parishId && offering.frequency && offering.frequency !== "once")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const selectedOffering = recurringOfferings.find((offering) => requestedParishId && offering.parishId === requestedParishId) || recurringOfferings[0];

  if (!selectedOffering) {
    return json({ error: "No recurring gifts found", detail: "Create a recurring gift before opening subscription management." }, { status: 422 });
  }

  const found = await findRegistrationByParishId(env, selectedOffering.parishId);
  const stripeAccountId = found?.registration?.stripeAccountId || "";
  if (!stripeAccountId) {
    return json(
      {
        error: "Parish Stripe account unavailable",
        detail: "This parish is not currently connected for Stripe subscription management.",
      },
      { status: 422 }
    );
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const form = new URLSearchParams({
    customer: selectedOffering.stripeCustomerId,
    return_url: `${String(appUrl).replace(/\/+$/, "")}/myagapay/giving/history`,
  });

  const session = await stripeFormConnectedRequest(env, "/v1/billing_portal/sessions", form, stripeAccountId);
  if (!session.ok) {
    return json({ error: "Stripe billing portal failed", detail: session.body.error?.message || "Unknown Stripe error" }, { status: 502 });
  }

  return json({
    ok: true,
    portalUrl: session.body.url,
    parishId: selectedOffering.parishId,
    parishName: selectedOffering.parishName || found?.registration?.parishName || "",
  });
}

export async function handleDonorCommemorations(request, env) {
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();

  if (request.method === "GET") {
    const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
    const entries = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
    return json({ entries });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-commemoration-submit", { limit: 20, windowSeconds: 3600 });
  if (limited) return limited;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parishId = String(body.parishId || donor.defaultParishId || "").trim();
  const namesLiving = String(body.namesLiving || body.living || "").trim();
  const namesDeparted = String(body.namesDeparted || body.departed || "").trim();
  const commemorationKind = String(body.commemorationKind || "") === "molieben_panikhida" ? "molieben_panikhida" : "proskomedia_liturgy";
  const note = String(body.note || body.inMemoriam || "")
    .trim()
    .slice(0, 2000);
  if (!parishId) {
    return json(
      {
        error: "Choose a parish before submitting commemorations.",
        detail: "Set a home parish in Settings, or include parishId.",
      },
      { status: 400 }
    );
  }
  if (!namesLiving && !namesDeparted) {
    return json({ error: "Add at least one living or departed name." }, { status: 400 });
  }

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish not found." }, { status: 404 });

  const donorName = String(donor.donorName || donor.householdName || donor.email || "").trim();
  const entry = await storeCommemorationEntry(
    env,
    generateSecret("comm"),
    {
      parish_id: parishId,
      parish_name: found.registration?.parishName || "",
      donor_email: donor.email,
      donor_name: donorName,
      gift_type: "commemoration",
      frequency: "none",
      names_living: namesLiving,
      names_departed: namesDeparted,
      note,
    },
    {
      parishId,
      parishName: found.registration?.parishName || "",
      donorEmail: donor.email,
      donorName,
      giftType: "commemoration",
      frequency: "none",
      amountCents: 0,
      namesLiving,
      namesDeparted,
      commemorationKind,
      note,
      createdAt: new Date().toISOString(),
    }
  );

  if (!entry) return json({ error: "Unable to submit commemoration." }, { status: 500 });

  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const entries = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
  return json({ ok: true, entry, entries });
}
