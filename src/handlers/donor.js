import { bookstoreReadinessSummary, bookstoreSellerDisclosure } from "../lib/commerce-readiness.js";
import { logEvent } from "../lib/logging.js";
import {
  applyDonorPassword,
  clampListLimit,
  d1,
  d1All,
  d1First,
  d1Run,
  decodeListCursor,
  deleteDonor,
  getBearerToken,
  DONOR_SESSION_TTL_MS,
  encodeListCursor,
  generateSecret,
  hashSessionToken,
  hasProductionStore,
  hasStewardshipAccess,
  isSystemKvKey,
  json,
  listKvKeys,
  loadDonor,
  loadMyAgapayReleaseFlags,
  missingProductionStoreResponse,
  normalizeEmail,
  publicDonor,
  rateLimit,
  rateLimitByKey,
  safeParseJsonRow,
  saveDonor,
  secureCompare,
  sha256Hex,
  unauthorized,
  verifyDonorPassword,
  verifyTurnstileIfConfigured,
} from "../lib/core.js";

import {
  defaultSubscriptionTier,
  subscriptionTier,
} from "../lib/subscriptions.js";

import {
  resolveSettlementProfileId,
} from "../lib/settlement-profiles.js";

import {
  agapayEmailHtml,
  sendEmail,
} from "../lib/email.js";

import {
  htmlEscape,
} from "../lib/format.js";

import {
  checkoutPaymentIntentId,
  normalizedCheckoutPaymentStatus,
  stripeAccountStatus,
  stripeFormConnectedRequest,
  stripeGetConnectedRequest,
} from "../lib/stripe-connect.js";

import {
  donorSummaryFromOfferings,
  enrichParishGivingOptions,
  findCheckoutParish,
  findOrCreateDonorCustomer,
  findRegistrationByParishId,
  verifyParishDashboardBearer,
  loadDonorOfferingByCheckout,
  loadDonorOfferingByPaymentIntent,
  loadDonorOfferings,
  loadReconciledDonorCommemorations,
  migrateDonorEmailReferences,
  offeringFeeBreakdown,
  paidOfferingStatus,
  parishFromRegistration,
  publicDonorOffering,
  reconcilePendingDonorOfferings,
  requireDonor,
  slugify,
  donorName,
  storeCommemorationEntry,
  storeDonorOffering,
  stripePaymentIntentFinancialUpdates,
  updateDonorOfferingByCheckout,
} from "./parish.js";

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
  const stripe = await stripeGetConnectedRequest(
    env,
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    parish.stripeAccountId
  );
  if (stripe.ok) {
    verifiedSession = stripe.body || {};
    const paymentIntentId = checkoutPaymentIntentId(verifiedSession);
    const paymentStatus = normalizedCheckoutPaymentStatus(verifiedSession, offering.paymentStatus);
    let status = offering.status || "checkout_created";
    if (paymentStatus === "paid" || verifiedSession.status === "complete") status = "completed";
    if (verifiedSession.status === "expired") status = "expired";
    const feeUpdates = status === "completed" || paymentStatus === "paid"
      ? await stripePaymentIntentFinancialUpdates(env, paymentIntentId, offering.parishId, offering)
      : {};
    await updateDonorOfferingByCheckout(env, sessionId, {
      status,
      paymentStatus,
      stripeCustomerId: verifiedSession.customer || offering.stripeCustomerId || "",
      stripePaymentIntentId: paymentIntentId || offering.stripePaymentIntentId || "",
      stripeSubscriptionId: verifiedSession.subscription || offering.stripeSubscriptionId || "",
      completedAt: status === "completed" ? offering.completedAt || new Date().toISOString() : offering.completedAt || "",
      ...feeUpdates
    });
  }

  const refreshed = await loadDonorOfferingByCheckout(env, sessionId) || offering;
  const isPaid = refreshed.status === "completed" || refreshed.paymentStatus === "paid" || refreshed.paymentStatus === "succeeded";
  if (!isPaid) {
    return json({ error: "Payment is still processing. Please wait and try again in a moment." }, { status: 409 });
  }

  const donorEmail = normalizeEmail(
    refreshed.donorEmail
      || verifiedSession?.customer_details?.email
      || verifiedSession?.customer_email
      || ""
  );
  if (!donorEmail) return json({ error: "A donor email is required before creating an account." }, { status: 422 });

  const existing = await loadDonor(env, donorEmail);
  if (existing?.emailVerifiedAt) {
    return json({
      error: "A donor account already exists for this email. Please log in from the donor sign-in page.",
      code: "account_exists"
    }, { status: 409 });
  }

  const now = new Date().toISOString();
  const donorNameValue = String(
    body.donorName
    || body.householdName
    || refreshed.donorName
    || existing?.donorName
    || donorEmail.split("@")[0]
  ).trim();

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
    updatedAt: now
  };
  const donor = await applyDonorPassword(donorBase, password);
  const session = await issueDonorSession(env, donor);

  return json({
    ok: true,
    token: session.token,
    donor: publicDonor(session.donor),
    checkoutSessionId: sessionId,
    status: refreshed.status || "completed",
    paymentStatus: refreshed.paymentStatus || "paid"
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
    updatedAt: new Date().toISOString()
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

  return sendEmail(env, {
    from,
    to: [donor.email],
    reply_to: replyTo,
    subject: "Verify your AGAPAY donor account",
    html: agapayEmailHtml(appUrl, "Verify your donor account", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Hello ${name}, please verify your email address to finish setting up your AGAPAY donor dashboard.</p>
      <p style="margin:0 0 24px;"><a href="${safeUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Verify email address</a></p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#171715;">After verification, you can sign in to your donor dashboard to view offering history, submit commemorations, and give through AGAPAY.</p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6F6A60;">If you did not create this AGAPAY account, you can ignore this email.</p>
    `)
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
    html: agapayEmailHtml(appUrl, "Reset your donor password", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ, ${name}.</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Use this secure link to choose a new password for your AGAPAY donor dashboard.</p>
      <p style="margin:0 0 24px;"><a href="${safeUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Reset donor password</a></p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6F6A60;">If you did not request this, ignore this email. The link expires in 1 hour.</p>
    `),
    text: [
      "Reset your AGAPAY donor password",
      "",
      `Open this link to choose a new password: ${resetUrl}`,
      "",
      "If you did not request this, ignore this email. The link expires in 1 hour."
    ].join("\n")
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

  const generic = { ok: true, message: "If a verified donor account exists for that email, a reset link has been sent." };
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
    updatedAt: new Date().toISOString()
  };

  const emailResult = await sendDonorPasswordResetEmail(env, updated, resetUrl);
  updated.passwordResetEmailStatus = emailResult.status || "";
  updated.passwordResetEmailDetail = emailResult.detail || "";
  await saveDonor(env, updated);

  return json({
    ...generic,
    email: { status: emailResult.status || "unknown", detail: emailResult.detail || "" },
    resetUrl: emailResult.status === "not_configured" ? resetUrl : undefined
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

  const reset = await applyDonorPassword({
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
    updatedAt: new Date().toISOString()
  }, newPassword);
  await saveDonor(env, reset);
  return json({ ok: true, updatedAt: reset.passwordUpdatedAt || new Date().toISOString() });
}

export function formatUsdFromCents(centsValue) {
  return (Number(centsValue || 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
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
  const donatedAt = htmlEscape(new Date(offering.completedAt || offering.createdAt || Date.now()).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }));
  const dashboardUrl = htmlEscape(`${String(appUrl).replace(/\/+$/, "")}/myagapay`);
  const feeDetail = fees.coverFees
    ? `<p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Fees covered by you:</strong> ${htmlEscape(donorCovered)}</p>
       <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Parish received:</strong> ${htmlEscape(parishReceived)}</p>`
    : `<p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Processing and AGAPAY fees deducted:</strong> ${htmlEscape(totalFees)}</p>
       <p style="margin:0 0 8px;font-size:14px;color:#171715;"><strong>Parish received:</strong> ${htmlEscape(parishReceived)}</p>`;
  const coverFeesNote = fees.coverFees ? "" : `
      <p style="margin:0 0 18px;padding:13px 15px;border-left:3px solid #C9A25B;background:#FFF8EA;font-size:14px;line-height:1.65;color:#171715;">
        Next time, you can choose to cover the processing fees so ${parishName} receives the full intended gift.
      </p>`;
  return sendEmail(env, {
    from,
    to: [donorEmail],
    reply_to: replyTo,
    subject: `AGAPAY receipt - ${amount} to ${offering.parishName || "your parish"}`,
    html: agapayEmailHtml(appUrl, "Donation receipt", `
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
    `)
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
    emailReceiptSentAt: email.status === "sent" ? new Date().toISOString() : ""
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
  if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, { status: 422 });

  const now = new Date().toISOString();
  const existing = await loadDonor(env, email);
  if (existing?.emailVerifiedAt) {
    return json({ error: "A donor account already exists for this email. Please log in." }, { status: 409 });
  }
  if (existing?.passwordRecord || existing?.passwordHash) {
    if (!(await verifyDonorPassword(existing, password))) {
      return json({ error: "A donor account already exists for this email. Please log in or use the original password to resend verification." }, { status: 409 });
    }
  }

  const verificationToken = generateSecret("verify");
  const verificationSalt = generateSecret("verify_salt");
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const verificationUrl = `${String(appUrl).replace(/\/+$/, "")}/myagapay/verify?email=${encodeURIComponent(email)}&token=${encodeURIComponent(verificationToken)}`;
  const donor = await applyDonorPassword({
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
    updatedAt: now
  }, password);

  const emailResult = await sendDonorVerificationEmail(env, donor, verificationUrl);
  donor.emailVerificationStatus = emailResult.status || "";
  donor.emailVerificationDetail = emailResult.detail || "";
  await saveDonor(env, donor);

  return json({
    ok: true,
    donor: publicDonor(donor),
    email: { status: emailResult.status || "unknown", detail: emailResult.detail || "" },
    verificationUrl: emailResult.status === "not_configured" ? verificationUrl : undefined
  }, { status: 201 });
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
  const accountLimited = await rateLimitByKey(request, env, "donor-login-account", email, { limit: 10, windowSeconds: 300 });
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
    updatedAt: new Date().toISOString()
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
  return new Response(`<!DOCTYPE html>
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
</html>`, {
    ...init,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}

export async function handleDonorVerifyPage(request, env) {
  if (request.method !== "GET") {
    return donorVerifyHtml(
      {
        title: "Verification link unavailable",
        message: "Open your donor verification link in a browser to confirm your email.",
        status: "error"
      },
      { status: 405 }
    );
  }

  const verification = await handleDonorVerify(request, env);
  const data = await verification.json().catch(() => ({}));

  if (!verification.ok) {
    return donorVerifyHtml(
      {
        title: "We could not verify your email",
        message: data.error || data.detail || "This verification link is invalid or expired. Please sign up again to request a new link.",
        status: "error"
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
        refreshUrl: "/myagapay/login"
      },
      { status: 200 }
    );
  }

  const session = {
    email: data.donor?.email || new URL(request.url).searchParams.get("email") || "",
    token: data.token,
    donor: data.donor || {}
  };
  const script = `<script>
(() => {
  const session = ${jsonForScript(session)};
  try {
    if (session.email) localStorage.setItem("agapayDonorEmail", session.email);
    if (session.token) localStorage.setItem("agapayDonorToken", session.token);
    if (session.donor) localStorage.setItem("agapayDonorProfile", JSON.stringify(session.donor));
  } catch (err) {}
  window.location.replace("/myagapay");
})();
</script>`;

  return donorVerifyHtml(
    {
      title: "Email verified",
      message: data.alreadyVerified ? "Your email was already verified. Opening your donor dashboard." : "Your email is verified. Opening your donor dashboard.",
      status: "success",
      script,
      refreshUrl: "/myagapay"
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
  const norm = (v) => String(v || "").trim().toLowerCase();

  const paidCampaignGifts = offerings
    .filter(paidOfferingStatus)
    .map((o) => ({
      key: norm(o.campaign || o.campaignId || o.campaignName || o.campaignSlug),
      cents: offeringFeeBreakdown(o).giftAmountCents,
      at: o.createdAt || ""
    }))
    .filter((g) => g.key);

  for (const group of groups) {
    for (const campaign of group) {
      if (!campaign || typeof campaign !== "object") continue;
      const keys = new Set(
        [campaign.id, campaign.feastId, campaign.name, campaign.campaignName, campaign.slug,
          slugify(campaign.name || campaign.campaignName || "")]
          .map(norm).filter(Boolean)
      );
      let cents = 0, count = 0, last = "";
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

    let updated = {
      ...donor,
      donorName: body.donorName ?? donor.donorName,
      householdName: body.householdName ?? donor.householdName,
      contactPhone: body.contactPhone ?? body.phone ?? donor.contactPhone ?? "",
      defaultParishId: body.defaultParishId ?? body.parishId ?? donor.defaultParishId,
      pledgeAmountCents: Number.isFinite(Number(body.pledgeAmountCents))
        ? Math.max(0, Math.round(Number(body.pledgeAmountCents)))
        : Number(donor.pledgeAmountCents || 0),
      pledgeYear: body.pledgeYear ?? donor.pledgeYear ?? "",
      addressLine1: body.addressLine1 ?? donor.addressLine1 ?? "",
      addressLine2: body.addressLine2 ?? donor.addressLine2 ?? "",
      city: body.city ?? donor.city ?? "",
      state: body.state ?? donor.state ?? "",
      postalCode: body.postalCode ?? donor.postalCode ?? "",
      country: body.country ?? donor.country ?? "",
      updatedAt: new Date().toISOString()
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
        emailChangedAt: new Date().toISOString()
      };
    }

    if (body.newPassword) {
      const currentPassword = String(body.currentPassword || "");
      if (!(await verifyDonorPassword(donor, currentPassword))) return unauthorized();
      if (String(body.newPassword).length < 8) return json({ error: "Password must be at least 8 characters" }, { status: 422 });
      updated = await applyDonorPassword(updated, body.newPassword);
    }

    if (emailChanged) {
      await migrateDonorEmailReferences(env, donor.email, requestedEmail);
      await deleteDonor(env, donor.email);
    }
    await saveDonor(env, updated);

    // Sync pledge amount to household_pledges for parish stewardship reporting.
    // Runs whenever the donor saves settings — harmless no-op if D1 isn't available
    // or if the donor hasn't set a home parish yet.
    const pledgeSyncParish = updated.defaultParishId || "";
    const pledgeSyncAmount = Number(updated.pledgeAmountCents || 0);
    if (d1(env) && pledgeSyncParish.trim()) {
      const pledgeSyncYear = parseInt(updated.pledgeYear || new Date().getFullYear(), 10);
      await env.AGAPAY_DB.prepare(`
        INSERT INTO household_pledges (donor_email, parish_id, fiscal_year, target_amount_cents)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(donor_email, parish_id, fiscal_year) DO UPDATE SET
          target_amount_cents = excluded.target_amount_cents,
          updated_at          = datetime('now')
      `).bind(updated.email, pledgeSyncParish, pledgeSyncYear, pledgeSyncAmount).run().catch(() => {});
    }

    return json({ ok: true, donor: publicDonor(updated) });
  }

  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const publicOfferings = offerings.map(publicDonorOffering);
  const commemorations = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
  const summary = donorSummaryFromOfferings(offerings, commemorations);
  let parish = null;
  if (donor.defaultParishId) {
    const found = await findRegistrationByParishId(env, donor.defaultParishId);
    if (found) parish = parishFromRegistration(found.registration);
    if (parish) parish = await enrichParishGivingOptions(env, parish);
    if (parish) parish = attachDonorCampaignGiving(parish, offerings);
  }

  return json({
    donor: publicDonor(donor),
    featureFlags: {
      myAgapay: await loadMyAgapayReleaseFlags(env)
    },
    parish,
    summary,
    recentOfferings: publicOfferings.slice(0, 5),
    recentCommemorations: commemorations.slice(0, 5)
  });
}

export async function handleDonorOfferings(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const commemorations = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
  return json({ offerings: offerings.map(publicDonorOffering), summary: donorSummaryFromOfferings(offerings, commemorations) });
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

  const selectedOffering = recurringOfferings.find((offering) => requestedParishId && offering.parishId === requestedParishId)
    || recurringOfferings[0];

  if (!selectedOffering) {
    return json(
      { error: "No recurring gifts found", detail: "Create a recurring gift before opening subscription management." },
      { status: 422 }
    );
  }

  const found = await findRegistrationByParishId(env, selectedOffering.parishId);
  const stripeAccountId = found?.registration?.stripeAccountId || "";
  if (!stripeAccountId) {
    return json(
      { error: "Parish Stripe account unavailable", detail: "This parish is not currently connected for Stripe subscription management." },
      { status: 422 }
    );
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const form = new URLSearchParams({
    customer: selectedOffering.stripeCustomerId,
    return_url: `${String(appUrl).replace(/\/+$/, "")}/myagapay/giving/history`
  });

  const session = await stripeFormConnectedRequest(env, "/v1/billing_portal/sessions", form, stripeAccountId);
  if (!session.ok) {
    return json(
      { error: "Stripe billing portal failed", detail: session.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  return json({
    ok: true,
    portalUrl: session.body.url,
    parishId: selectedOffering.parishId,
    parishName: selectedOffering.parishName || found?.registration?.parishName || ""
  });
}

const BOOKSTORE_ITEM_FIELD_CATEGORIES = [
  { category: "book", label: "Book", fields: [
    { key: "title", label: "Title", required: true, maxLength: 180 },
    { key: "author", label: "Author", required: false, maxLength: 120 },
    { key: "isbn", label: "ISBN / barcode", required: false, maxLength: 32 }
  ] },
  { category: "prayer_rope", label: "Prayer Rope", fields: [
    { key: "description", label: "Description", required: true, maxLength: 180 },
    { key: "color", label: "Color", required: false, maxLength: 80 }
  ] },
  { category: "icon", label: "Icon", fields: [
    { key: "saint_or_feast", label: "Saint or feast", required: true, maxLength: 160 },
    { key: "size", label: "Size", required: false, maxLength: 80 }
  ] },
  { category: "candle", label: "Candle", fields: [{ key: "description", label: "Description", required: true, maxLength: 160 }] },
  { category: "jewelry", label: "Jewelry / Cross", fields: [{ key: "description", label: "Description", required: true, maxLength: 180 }] },
  { category: "incense", label: "Incense", fields: [{ key: "description", label: "Description", required: true, maxLength: 160 }] },
  { category: "cd_dvd", label: "CD / DVD", fields: [{ key: "title", label: "Title", required: true, maxLength: 180 }] },
  { category: "other", label: "Other Item", fields: [{ key: "description", label: "Description", required: true, maxLength: 180 }] }
];

function bookstoreCategoryLabel(category) {
  return BOOKSTORE_ITEM_FIELD_CATEGORIES.find(entry => entry.category === category)?.label || "Item";
}

function centsFromBookstoreAmount(value) {
  const number = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : 0;
}

function normalizeBookstoreQuantity(value) {
  const quantity = Math.trunc(Number(value || 1));
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.min(quantity, 50);
}

function describeManualBookstoreItem(category, specifics = {}) {
  if (category === "book") return [specifics.title, specifics.author ? `by ${specifics.author}` : ""].filter(Boolean).join(" ") || "Book";
  if (category === "icon") return specifics.saint_or_feast || specifics.description || "Icon";
  return specifics.description || specifics.title || bookstoreCategoryLabel(category);
}

function normalizeBookstoreProduct(row = {}) {
  const priceCents = Number(row.unit_price_cents || 0);
  return {
    id: row.id || "",
    variantId: row.variant_id || "",
    name: row.name || "Bookstore item",
    description: row.description || "",
    category: row.item_category || "other",
    categoryLabel: bookstoreCategoryLabel(row.item_category || "other"),
    sku: row.sku || row.default_sku || "",
    barcode: row.barcode || "",
    taxCode: row.tax_code || row.default_tax_code || "",
    fulfillmentType: row.variant_fulfillment_type || row.fulfillment_type || "physical_pickup",
    priceCents,
    priceLabel: `$${(priceCents / 100).toFixed(2)}`,
    stockQuantity: Number(row.stock_quantity || 0),
    trackInventory: Number(row.track_inventory ?? 1) !== 0,
    imageUrl: row.image_url || ""
  };
}

async function loadDonorBookstoreProducts(env, parishId) {
  if (!d1(env)) return [];
  const rows = await d1All(env, `
    SELECT p.id, p.name, p.description, p.item_category, p.default_sku, p.default_tax_code,
           p.fulfillment_type, p.image_url,
           v.id AS variant_id, v.sku, v.barcode, v.variant_name, v.unit_price_cents,
           v.tax_code, v.fulfillment_type AS variant_fulfillment_type,
           v.stock_quantity, v.track_inventory
    FROM commerce_products p
    LEFT JOIN commerce_product_variants v
      ON v.product_id = p.id AND v.parish_id = p.parish_id
     AND v.commerce_module = 'bookstore' AND v.status = 'active'
    WHERE p.parish_id = ? AND p.commerce_module = 'bookstore' AND p.status = 'active'
    ORDER BY p.name COLLATE NOCASE, v.variant_name COLLATE NOCASE
  `, parishId);
  return rows.map(normalizeBookstoreProduct).filter(product => product.variantId && product.priceCents > 0);
}

async function loadDonorBookstoreOrders(env, parishId, donorEmail) {
  if (!d1(env)) return [];
  const rows = await d1All(env, `
    SELECT id, order_number, status, payment_status, item_category, item_description, quantity,
           subtotal_cents, tax_cents, total_charged_cents, fulfillment_status, pickup_note, created_at
    FROM commerce_orders
    WHERE parish_id = ? AND commerce_module = 'bookstore' AND donor_email = ?
    ORDER BY created_at DESC LIMIT 20
  `, parishId, donorEmail);

  const orderIds = rows.map((row) => row.id);
  const itemsByOrder = {};
  if (orderIds.length) {
    const placeholders = orderIds.map(() => "?").join(",");
    const itemRows = await d1All(env, `
      SELECT order_id, item_name, quantity, unit_price_cents, total_cents
      FROM commerce_order_items
      WHERE parish_id = ? AND order_id IN (${placeholders})
      ORDER BY created_at ASC
    `, parishId, ...orderIds);
    for (const item of itemRows) {
      (itemsByOrder[item.order_id] ||= []).push({
        name: item.item_name,
        quantity: Number(item.quantity || 1),
        unitPriceCents: Number(item.unit_price_cents || 0),
        totalCents: Number(item.total_cents || 0)
      });
    }
  }

  return rows.map(row => ({
    id: row.id,
    orderNumber: row.order_number || "",
    status: row.status || "checkout_created",
    paymentStatus: row.payment_status || "pending",
    itemCategory: row.item_category || "other",
    itemCategoryLabel: bookstoreCategoryLabel(row.item_category || "other"),
    itemDescription: row.item_description || "Bookstore order",
    quantity: Number(row.quantity || 1),
    subtotalCents: Number(row.subtotal_cents || 0),
    taxCents: Number(row.tax_cents || 0),
    totalChargedCents: Number(row.total_charged_cents || row.subtotal_cents || 0),
    fulfillmentStatus: row.fulfillment_status || "pending",
    pickupNote: row.pickup_note || "",
    createdAt: row.created_at || "",
    // Falls back to a single synthetic line so older/edge-case orders that
    // predate itemized storage still expand into a one-line receipt instead
    // of an empty list.
    items: (itemsByOrder[row.id] && itemsByOrder[row.id].length)
      ? itemsByOrder[row.id]
      : [{
          name: row.item_description || "Bookstore item",
          quantity: Number(row.quantity || 1),
          unitPriceCents: Number(row.quantity) > 0 ? Math.round(Number(row.subtotal_cents || 0) / Number(row.quantity)) : Number(row.subtotal_cents || 0),
          totalCents: Number(row.subtotal_cents || 0)
        }]
  }));
}

async function resolveDonorBookstoreParish(request, env, donor, explicitParishId = "") {
  const parishId = String(explicitParishId || request.headers.get("X-AGAPAY-Parish-Id") || donor.defaultParishId || "").trim();
  if (!parishId) return { error: json({ error: "Choose your parish in Settings before ordering from the bookstore." }, { status: 422 }) };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found?.registration) return { error: json({ error: "Parish not found." }, { status: 404 }) };
  const registration = found.registration;
  if (!hasStewardshipAccess(registration) || registration.bookstoreEnabled === false) {
    return { parishId, registration, available: false };
  }
  return { parishId, registration, available: true };
}

export async function handleDonorBookstoreItemFields(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  return json({ categories: BOOKSTORE_ITEM_FIELD_CATEGORIES });
}

export async function handleDonorBookstoreIsbnLookup(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const url = new URL(request.url);
  const isbn = String(url.searchParams.get("isbn") || "").replace(/[^0-9Xx]/g, "");
  if (isbn.length !== 10 && isbn.length !== 13) return json({ found: false, error: "Enter a 10 or 13 digit ISBN." }, { status: 422 });

  const donor = await requireDonor(request, env);
  const parishId = String(request.headers.get("X-AGAPAY-Parish-Id") || donor?.defaultParishId || "").trim();
  if (donor?.email && parishId && d1(env)) {
    const row = await d1First(env, `
      SELECT p.id, p.name, p.description, p.item_category, p.default_sku, p.default_tax_code,
             p.fulfillment_type, p.image_url,
             v.id AS variant_id, v.sku, v.barcode, v.unit_price_cents, v.tax_code,
             v.fulfillment_type AS variant_fulfillment_type, v.stock_quantity, v.track_inventory
      FROM commerce_product_variants v
      JOIN commerce_products p ON p.id = v.product_id
      WHERE v.parish_id = ? AND v.commerce_module = 'bookstore'
        AND v.status = 'active' AND p.status = 'active'
        AND (v.barcode = ? OR v.sku = ? OR p.default_sku = ?)
      LIMIT 1
    `, parishId, isbn, isbn, isbn);
    if (row) return json({ found: true, source: "catalog", product: normalizeBookstoreProduct(row) });
  }

  try {
    const response = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`, { headers: { Accept: "application/json" } });
    if (!response.ok) return json({ found: false });
    const book = await response.json();
    let author = "";
    const authorKey = Array.isArray(book.authors) && book.authors[0]?.key ? book.authors[0].key : "";
    if (authorKey) {
      try {
        const authorRes = await fetch(`https://openlibrary.org${authorKey}.json`, { headers: { Accept: "application/json" } });
        if (authorRes.ok) author = (await authorRes.json()).name || "";
      } catch { /* best effort only */ }
    }
    return json({ found: true, source: "open_library", title: book.title || "", author, isbn });
  } catch {
    return json({ found: false });
  }
}

export async function handleDonorBookstoreRequestFeature(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor?.email) return unauthorized();
  return json({ ok: true, alreadySent: false });
}

async function normalizeBookstoreCartItems(env, parishId, items) {
  const normalized = [];
  for (const raw of items) {
    const productId = String(raw.productId || "").trim();
    const variantId = String(raw.variantId || "").trim();
    const quantity = normalizeBookstoreQuantity(raw.quantity);
    if (productId || variantId) {
      const row = await d1First(env, `
        SELECT p.id, p.name, p.description, p.item_category, p.default_sku, p.default_tax_code,
               p.fulfillment_type, p.image_url,
               v.id AS variant_id, v.sku, v.barcode, v.unit_price_cents, v.tax_code,
               v.fulfillment_type AS variant_fulfillment_type, v.stock_quantity, v.track_inventory
        FROM commerce_product_variants v
        JOIN commerce_products p ON p.id = v.product_id
        WHERE p.parish_id = ? AND p.commerce_module = 'bookstore'
          AND p.status = 'active' AND v.status = 'active'
          AND (? = '' OR p.id = ?)
          AND (? = '' OR v.id = ?)
        LIMIT 1
      `, parishId, productId, productId, variantId, variantId);
      if (!row) throw new Error("One of the selected products is no longer available.");
      const product = normalizeBookstoreProduct(row);
      if (product.trackInventory && product.stockQuantity > 0 && quantity > product.stockQuantity) {
        throw new Error(`${product.name} only has ${product.stockQuantity} available.`);
      }
      normalized.push({
        source: "catalog",
        productId: product.id,
        variantId: product.variantId,
        sku: product.sku,
        barcode: product.barcode,
        itemCategory: product.category,
        itemName: product.name,
        itemDescription: product.description || product.name,
        quantity,
        unitPriceCents: product.priceCents,
        taxCode: product.taxCode,
        fulfillmentType: product.fulfillmentType,
        snapshot: product
      });
      continue;
    }

    const category = BOOKSTORE_ITEM_FIELD_CATEGORIES.some(entry => entry.category === raw.itemCategory) ? String(raw.itemCategory) : "other";
    const specifics = raw.specifics && typeof raw.specifics === "object" ? raw.specifics : {};
    const unitPriceCents = centsFromBookstoreAmount(raw.unitPrice);
    const itemName = describeManualBookstoreItem(category, specifics);
    if (!unitPriceCents) throw new Error("Enter a valid price for every manual item.");
    if (!itemName || itemName === "Item") throw new Error("Describe every manual item before checkout.");
    normalized.push({
      source: raw.source === "scan_and_go" ? "scan_and_go" : "manual_entry",
      productId: "",
      variantId: "",
      sku: String(specifics.isbn || raw.barcode || "").slice(0, 80),
      barcode: String(specifics.isbn || raw.barcode || "").slice(0, 80),
      itemCategory: category,
      itemName,
      itemDescription: itemName,
      quantity,
      unitPriceCents,
      taxCode: "",
      fulfillmentType: "physical_pickup",
      snapshot: { specifics }
    });
  }
  if (!normalized.length) throw new Error("Add at least one item before checkout.");
  if (normalized.length > 20) throw new Error("Checkout can include up to 20 items at a time.");
  return normalized;
}

async function ensureBookstoreCatalogProductFromOrderItem(env, parishId, item, now) {
  if (item.productId || !d1(env)) return item;
  const sku = String(item.sku || item.barcode || "").trim();
  let existing = null;
  if (sku) {
    existing = await d1First(env, `
      SELECT p.id, p.name, p.description, p.item_category, p.default_sku, p.default_tax_code,
             p.fulfillment_type, p.image_url,
             v.id AS variant_id, v.sku, v.barcode, v.unit_price_cents, v.tax_code,
             v.fulfillment_type AS variant_fulfillment_type, v.stock_quantity, v.track_inventory
      FROM commerce_product_variants v
      JOIN commerce_products p ON p.id = v.product_id
      WHERE v.parish_id = ? AND v.commerce_module = 'bookstore'
        AND (v.sku = ? OR v.barcode = ? OR p.default_sku = ?)
      LIMIT 1
    `, parishId, sku, sku, sku).catch(() => null);
  }
  if (existing) {
    const product = normalizeBookstoreProduct(existing);
    return {
      ...item,
      source: "catalog",
      productId: product.id,
      variantId: product.variantId,
      sku: product.sku || item.sku,
      barcode: product.barcode || item.barcode,
      taxCode: product.taxCode || item.taxCode,
      snapshot: { ...item.snapshot, catalogProductId: product.id, catalogVariantId: product.variantId }
    };
  }

  const productId = `product_${generateSecret(18)}`;
  const variantId = `variant_${generateSecret(18)}`;
  const productName = String(item.itemName || "Bookstore item").slice(0, 180);
  const productDescription = String(item.itemDescription || item.itemName || "").slice(0, 600);
  await d1Run(env, `
    INSERT INTO commerce_products
      (id, parish_id, commerce_module, name, description, item_category, default_sku,
       default_tax_code, fulfillment_type, status, image_url, created_at, updated_at)
    VALUES (?, ?, 'bookstore', ?, ?, ?, ?, ?, ?, 'active', '', ?, ?)
  `,
    productId,
    parishId,
    productName,
    productDescription,
    item.itemCategory || "other",
    sku,
    item.taxCode || "",
    item.fulfillmentType || "physical_pickup",
    now,
    now
  );
  await d1Run(env, `
    INSERT INTO commerce_product_variants
      (id, product_id, parish_id, commerce_module, sku, barcode, variant_name,
       unit_price_cents, cost_basis_cents, tax_code, fulfillment_type, stock_quantity,
       reorder_threshold, track_inventory, status, created_at, updated_at)
    VALUES (?, ?, ?, 'bookstore', ?, ?, '', ?, 0, ?, ?, 0, 0, 1, 'active', ?, ?)
  `,
    variantId,
    productId,
    parishId,
    sku,
    item.barcode || sku,
    item.unitPriceCents,
    item.taxCode || "",
    item.fulfillmentType || "physical_pickup",
    now,
    now
  );
  return {
    ...item,
    source: "catalog",
    productId,
    variantId,
    snapshot: { ...item.snapshot, catalogProductId: productId, catalogVariantId: variantId, donorSuggested: true }
  };
}

export async function handleParishBookstoreReadiness(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish not found" }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return unauthorized();

  return json(bookstoreReadinessSummary(found.registration));
}

export async function handleDonorBookstore(request, env) {
  if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-bookstore", { limit: 40, windowSeconds: 300 });
  if (limited) return limited;

  const donor = await requireDonor(request, env);
  if (!donor?.email) return unauthorized();

  if (request.method === "GET") {
    const resolved = await resolveDonorBookstoreParish(request, env, donor);
    if (resolved.error) return resolved.error;
    return json({
      available: Boolean(resolved.available),
      parish: { id: resolved.parishId, name: resolved.registration?.name || "" },
      sellerDisclosure: resolved.registration ? bookstoreSellerDisclosure(resolved.registration.commerceSellerDisplayName || resolved.registration.name || resolved.registration.parishName) : "",
      products: resolved.available ? await loadDonorBookstoreProducts(env, resolved.parishId) : [],
      orders: await loadDonorBookstoreOrders(env, resolved.parishId, normalizeEmail(donor.email))
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const resolved = await resolveDonorBookstoreParish(request, env, donor, body.parishId);
  if (resolved.error) return resolved.error;
  if (!resolved.available) return json({ error: "Your parish hasn't turned on Bookstore Payments yet." }, { status: 409 });
  if (!resolved.registration?.stripeAccountId) {
    return json({ error: "Your parish needs to connect Stripe before bookstore payments can be accepted." }, { status: 422 });
  }
  if (!d1(env)) return missingProductionStoreResponse();

  let items;
  try {
    items = await normalizeBookstoreCartItems(env, resolved.parishId, Array.isArray(body.items) && body.items.length ? body.items : [body]);
  } catch (err) {
    return json({ error: err.message || "Check your cart and try again." }, { status: 422 });
  }

  const subtotalCents = items.reduce((sum, item) => sum + (item.unitPriceCents * item.quantity), 0);
  const donorEmail = normalizeEmail(donor.email || body.email);
  const normalizedDonorName = donorName({
    firstName: donor.firstName || "",
    lastName: donor.lastName || "",
    householdName: donor.householdName || donor.donorName || ""
  }) || donor.householdName || donor.donorName || donorEmail;
  const pickupNote = String(body.pickupNote || "").trim().slice(0, 240);
  const orderId = `bookstore_${generateSecret(18)}`;
  const checkoutLocalId = `checkout_${generateSecret(18)}`;
  const now = new Date().toISOString();
  items = await Promise.all(items.map(item => ensureBookstoreCatalogProductFromOrderItem(env, resolved.parishId, item, now)));
  const firstItem = items[0];
  const itemDescription = items.length === 1 ? firstItem.itemName : `${items.length} bookstore items`;
  const quantityTotal = items.reduce((sum, item) => sum + item.quantity, 0);
  const customer = await findOrCreateDonorCustomer(env, {
    id: resolved.parishId,
    name: resolved.registration.name || "",
    stripeAccountId: resolved.registration.stripeAccountId || ""
  }, { email: donorEmail, firstName: normalizedDonorName, lastName: "" });
  if (!customer.ok) {
    return json({ error: "Stripe customer setup failed", detail: customer.body.error?.message || "Unknown Stripe error" }, { status: 502 });
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const sellerDisplayName = resolved.registration.commerceSellerDisplayName || resolved.registration.name || resolved.registration.parishName || "";
  const sellerDisclosure = bookstoreSellerDisclosure(sellerDisplayName);
  const form = new URLSearchParams({
    mode: "payment",
    success_url: `${appUrl}/myagapay/bookstore?order_success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/myagapay/bookstore?order_canceled=1`,
    customer: customer.body.id,
    "automatic_tax[enabled]": "true",
    "payment_intent_data[on_behalf_of]": resolved.registration.stripeAccountId,
    // Seller-identity disclosure surfaced on the Stripe-hosted Checkout
    // page itself via the submit-type/custom text field -- reinforces the
    // parish, not AGAPAY, as the seller at the one checkout surface every
    // bookstore order already passes through. Storefront/cart/receipt
    // placements are a documented follow-up (see Phase 3 report).
    "custom_text[submit][message]": sellerDisclosure.slice(0, 499)
  });
  // Parish Commerce is included in AGAPAY Parish +. Do not add any AGAPAY platform/application fee to bookstore or future commerce checkouts; Stripe may still charge its own processing fee and show any applicable tax.
  const bookstoreFallbackTaxCode =
    env.BOOKSTORE_STRIPE_TAX_CODE ||
    env.PARISH_COMMERCE_DEFAULT_TAX_CODE ||
    "";
  
  items.forEach((item, index) => {
    const lineTaxCode = item.taxCode || bookstoreFallbackTaxCode;
  
    form.set(`line_items[${index}][quantity]`, String(item.quantity));
    form.set(`line_items[${index}][price_data][currency]`, "usd");
    form.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitPriceCents));
    form.set(`line_items[${index}][price_data][tax_behavior]`, "exclusive");
    form.set(`line_items[${index}][price_data][product_data][name]`, item.itemName.slice(0, 180));
  
    if (item.itemDescription && item.itemDescription !== item.itemName) {
      form.set(`line_items[${index}][price_data][product_data][description]`, item.itemDescription.slice(0, 280));
    }
  
    if (lineTaxCode) {
      form.set(`line_items[${index}][price_data][product_data][tax_code]`, lineTaxCode);
    }
  });
  const metadata = {
    order_id: orderId,
    parish_id: resolved.parishId,
    commerce_module: "bookstore",
    donor_email: donorEmail,
    donor_name: normalizedDonorName,
    item_count: String(items.length),
    subtotal_cents: String(subtotalCents)
  };
  for (const [key, value] of Object.entries(metadata)) {
    form.set(`metadata[${key}]`, value);
    form.set(`payment_intent_data[metadata][${key}]`, value);
  }

  const session = await stripeFormConnectedRequest(env, "/v1/checkout/sessions", form, resolved.registration.stripeAccountId);
  if (!session.ok) {
    return json({ error: "Stripe checkout session failed", detail: session.body.error?.message || "Unknown Stripe error" }, { status: 502 });
  }

  const settlementProfileId = await resolveSettlementProfileId(env, resolved.parishId, "bookstore");

  await d1Run(env, `
    INSERT INTO commerce_orders
      (id, commerce_module, source, parish_id, donor_email, donor_name,
       product_id, product_sku, variant_id, tax_code, product_snapshot_json,
       item_category, item_description, quantity, unit_price_cents, subtotal_cents,
       tax_cents, agapay_fee_cents, stripe_fee_cents, cover_fees, total_charged_cents,
       parish_net_cents, status, payment_status, checkout_session_local_id,
       checkout_session_id, checkout_url, stripe_customer_id, fulfillment_status,
       pickup_note, settlement_profile_id, created_at, updated_at)
    VALUES (?, 'bookstore', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?,
            'checkout_created', 'pending', ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `,
    orderId,
    items.some(item => item.source === "scan_and_go") ? "scan_and_go" : items.some(item => item.source === "catalog") ? "catalog" : "manual_entry",
    resolved.parishId,
    donorEmail,
    normalizedDonorName,
    firstItem.productId,
    firstItem.sku,
    firstItem.variantId,
    firstItem.taxCode,
    JSON.stringify({ items: items.map(item => item.snapshot) }).slice(0, 12000),
    firstItem.itemCategory,
    itemDescription,
    quantityTotal,
    firstItem.unitPriceCents,
    subtotalCents,
    body.coverFees === false ? 0 : 1,
    subtotalCents,
    subtotalCents,
    checkoutLocalId,
    session.body.id,
    session.body.url || "",
    customer.body.id || "",
    pickupNote,
    settlementProfileId,
    now,
    now
  );

  for (const item of items) {
    const itemSubtotal = item.unitPriceCents * item.quantity;
    await d1Run(env, `
      INSERT INTO commerce_order_items
        (id, order_id, parish_id, commerce_module, product_id, variant_id, sku, barcode,
         barcode_type, item_category, item_name, item_description, quantity, unit_price_cents,
         subtotal_cents, tax_cents, total_cents, tax_code, snapshot_json,
         fulfillment_type, fulfillment_status, created_at, updated_at)
      VALUES (?, ?, ?, 'bookstore', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'pending', ?, ?)
    `,
      `bookstore_item_${generateSecret(18)}`,
      orderId,
      resolved.parishId,
      item.productId,
      item.variantId,
      item.sku,
      item.barcode,
      item.barcode ? "isbn_or_sku" : "",
      item.itemCategory,
      item.itemName,
      item.itemDescription,
      item.quantity,
      item.unitPriceCents,
      itemSubtotal,
      itemSubtotal,
      item.taxCode,
      JSON.stringify(item.snapshot).slice(0, 4000),
      item.fulfillmentType,
      now,
      now
    );
  }

  return json({ ok: true, id: session.body.id, orderId, url: session.body.url }, { status: 201 });
}

// Soft rollout: Sacraments & Services is gated per-parish by an admin-set
// flag (registration.sacramentsEnabled) on top of the existing AGAPAY
// Parish + tier gate. See the matching helper in src/handlers/parish.js.
function sacramentsEnabledFor(registration) {
  return Boolean(registration?.sacramentsEnabled) && hasStewardshipAccess(registration);
}

const SACRAMENT_TYPES = new Set([
  "house_blessing", "baptism", "chrismation", "wedding", "funeral",
  "memorial_service", "confession", "home_visit", "other"
]);
const SACRAMENT_ACTIVE_STATUSES = new Set(["requested", "acknowledged", "scheduled"]);

function publicSacramentRequest(row = {}) {
  return {
    id: row.id,
    parishId: row.parish_id,
    sacramentType: row.sacrament_type,
    otherTypeLabel: row.other_type_label || "",
    status: row.status,
    requestedDate: row.requested_date || "",
    requestedTimeWindow: row.requested_time_window || "",
    participantNames: row.participant_names || "",
    locationType: row.location_type || "",
    locationAddress: row.location_address || "",
    notes: row.notes || "",
    phone: row.phone || "",
    confirmedDate: row.confirmed_date || "",
    confirmedTime: row.confirmed_time || "",
    clergyAssigned: row.clergy_assigned || "",
    declineReason: row.status === "declined" ? (row.decline_reason || "") : "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
    // parish_notes is intentionally omitted — internal to the parish only.
  };
}

function sacramentTypeLabel(type) {
  return {
    house_blessing: "House Blessing",
    baptism: "Baptism",
    chrismation: "Chrismation",
    wedding: "Wedding",
    funeral: "Funeral",
    memorial_service: "Memorial Service",
    confession: "Confession",
    home_visit: "Home Visit",
    other: "Other Request"
  }[type] || type;
}

// Structured detail for baptism/chrismation and wedding requests. Lives in
// satellite tables keyed on sacrament_requests.id — see
// migration_sacrament_details.sql. Every other sacrament type has no detail
// row, which is fine; attachSacramentDetails() just returns null for them.

function publicBaptismDetails(row) {
  if (!row) return null;
  return {
    candidateName: row.candidate_name,
    candidateDob: row.candidate_dob || "",
    candidateIsAdult: !!row.candidate_is_adult,
    parentNames: row.parent_names || "",
    patronSaint: row.patron_saint || "",
    godparent1Name: row.godparent_1_name || "",
    godparent1HomeParish: row.godparent_1_home_parish || "",
    godparent1OrthodoxAttested: !!row.godparent_1_orthodox_attested,
    godparent2Name: row.godparent_2_name || "",
    godparent2HomeParish: row.godparent_2_home_parish || "",
    godparent2OrthodoxAttested: !!row.godparent_2_orthodox_attested,
  };
}

function publicWeddingDetails(row) {
  if (!row) return null;
  return {
    partyAName: row.party_a_name,
    partyAOrthodox: !!row.party_a_orthodox,
    partyAPriorMarriage: !!row.party_a_prior_marriage,
    partyBName: row.party_b_name,
    partyBOrthodox: !!row.party_b_orthodox,
    partyBPriorMarriage: !!row.party_b_prior_marriage,
    koumbaroName: row.koumbaro_name || "",
    koumbaroHomeParish: row.koumbaro_home_parish || "",
    marriageLicenseStatus: row.marriage_license_status || "not_started",
    premaritalCounselComplete: !!row.premarital_counsel_complete,
  };
}

async function attachSacramentDetails(env, row) {
  const base = publicSacramentRequest(row);
  if (!row) return base;
  if (row.sacrament_type === "baptism" || row.sacrament_type === "chrismation") {
    const detail = await d1First(env, "SELECT * FROM sacrament_baptism_details WHERE request_id = ?", row.id).catch(() => null);
    return { ...base, baptismDetails: publicBaptismDetails(detail) };
  }
  if (row.sacrament_type === "wedding") {
    const detail = await d1First(env, "SELECT * FROM sacrament_wedding_details WHERE request_id = ?", row.id).catch(() => null);
    return { ...base, weddingDetails: publicWeddingDetails(detail) };
  }
  return base;
}

// GET  /api/donor/sacraments        — list the signed-in donor's own requests
//   ?parishId= also returns { available } for that parish's AGAPAY Parish + status,
//   so the frontend knows whether to show the "Request a sacrament" form at all.
// POST /api/donor/sacraments        — submit a new request
export async function handleDonorSacraments(request, env) {
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  if (request.method === "GET") {
    const rows = await d1All(env,
      "SELECT * FROM sacrament_requests WHERE donor_email = ? ORDER BY created_at DESC LIMIT 100",
      normalizeEmail(donor.email)
    ).catch(() => []);

    // Sacraments & Services is an AGAPAY Parish + feature, currently in
    // soft rollout — only tell the donor it's available if their home
    // parish both has active AGAPAY Parish + access AND has been enabled by
    // an AGAPAY admin. This is purely informational for the GET (so the UI
    // can show/hide the "new request" form); it never blocks viewing
    // requests already on file, even from a parish no longer enabled.
    let available = false;
    const parishId = String(request.headers.get("X-AGAPAY-Parish-Id") || donor.defaultParishId || "").trim();
    if (parishId) {
      const found = await findRegistrationByParishId(env, parishId);
      available = Boolean(found && sacramentsEnabledFor(found.registration));
    }

    const requestsWithDetails = await Promise.all(
      (rows || []).map((row) => attachSacramentDetails(env, row))
    );
    return json({ requests: requestsWithDetails, available, parishId });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const limited = await rateLimit(request, env, "donor-sacrament-request", { limit: 10, windowSeconds: 3600 });
  if (limited) return limited;

  let body = {};
  try { body = await request.json(); } catch { body = {}; }

  const parishId = String(body.parishId || donor.defaultParishId || "").trim();
  if (!parishId) {
    return json({ error: "Choose a parish before submitting a request.", detail: "Set a home parish in Settings, or include parishId." }, { status: 400 });
  }
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish not found." }, { status: 404 });

  // Gate: Sacraments & Services requires both active AGAPAY Parish + access
  // (paid subscription, trial, or a comp grant) AND an admin having flipped
  // on the soft-rollout flag for this specific parish.
  if (!sacramentsEnabledFor(found.registration)) {
    return json({
      error: hasStewardshipAccess(found.registration)
        ? "Sacraments & Services is coming soon for your parish."
        : "This parish has not enabled Sacraments & Services.",
      detail: hasStewardshipAccess(found.registration)
        ? "Your parish will have this feature soon."
        : "This feature is part of AGAPAY Parish +. Your parish will need to subscribe before you can submit requests here."
    }, { status: 402 });
  }

  const sacramentType = String(body.sacramentType || "").trim();
  if (!SACRAMENT_TYPES.has(sacramentType)) {
    return json({ error: "Choose a valid sacrament or service type." }, { status: 400 });
  }
  const otherTypeLabel = sacramentType === "other" ? String(body.otherTypeLabel || "").trim().slice(0, 120) : "";
  if (sacramentType === "other" && !otherTypeLabel) {
    return json({ error: "Describe what you're requesting." }, { status: 400 });
  }

  const locationType = ["church", "home", "other"].includes(body.locationType) ? body.locationType : "church";
  const locationAddress = String(body.locationAddress || "").trim().slice(0, 400);
  if ((sacramentType === "house_blessing" || sacramentType === "home_visit" || locationType === "home") && !locationAddress) {
    return json({ error: "An address is required for a house blessing or home visit." }, { status: 400 });
  }

  const requestedDate = String(body.requestedDate || "").trim().slice(0, 10);
  const requestedTimeWindow = String(body.requestedTimeWindow || "").trim().slice(0, 200);
  const notes = String(body.notes || "").trim().slice(0, 2000);
  const phone = String(body.phone || "").trim().slice(0, 40);

  const baptismDetails = (sacramentType === "baptism" || sacramentType === "chrismation")
    ? (body.baptismDetails || {}) : null;
  const weddingDetails = sacramentType === "wedding" ? (body.weddingDetails || {}) : null;

  if (baptismDetails && !String(baptismDetails.candidateName || "").trim()) {
    return json({ error: "Candidate name is required." }, { status: 400 });
  }
  if (weddingDetails && (!String(weddingDetails.partyAName || "").trim() || !String(weddingDetails.partyBName || "").trim())) {
    return json({ error: "Both parties' names are required." }, { status: 400 });
  }

  // Fall back to a derived label so existing dashboard views that only know
  // about participant_names (not yet updated to read the detail tables)
  // still show something sensible.
  let participantNames = String(body.participantNames || "").trim().slice(0, 1000);
  if (!participantNames && baptismDetails) {
    participantNames = String(baptismDetails.candidateName || "").trim().slice(0, 1000);
  }
  if (!participantNames && weddingDetails) {
    participantNames = `${weddingDetails.partyAName || ""} & ${weddingDetails.partyBName || ""}`.trim().slice(0, 1000);
  }

  const id = generateSecret("sac");
  const now = new Date().toISOString();

  await d1Run(env, `
    INSERT INTO sacrament_requests
      (id, parish_id, donor_email, sacrament_type, other_type_label, status,
       requested_date, requested_time_window, participant_names,
       location_type, location_address, notes, phone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    id, parishId, normalizeEmail(donor.email), sacramentType, otherTypeLabel || null,
    requestedDate || null, requestedTimeWindow || null, participantNames || null,
    locationType, locationAddress || null, notes || null, phone || null, now, now
  );

  if (baptismDetails) {
    await d1Run(env, `
      INSERT INTO sacrament_baptism_details
        (request_id, candidate_name, candidate_dob, candidate_is_adult,
         parent_names, patron_saint,
         godparent_1_name, godparent_1_home_parish, godparent_1_orthodox_attested,
         godparent_2_name, godparent_2_home_parish, godparent_2_orthodox_attested)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      String(baptismDetails.candidateName || "").trim().slice(0, 200),
      String(baptismDetails.candidateDob || "").trim().slice(0, 10) || null,
      baptismDetails.candidateIsAdult ? 1 : 0,
      String(baptismDetails.parentNames || "").trim().slice(0, 400) || null,
      String(baptismDetails.patronSaint || "").trim().slice(0, 200) || null,
      String(baptismDetails.godparent1Name || "").trim().slice(0, 200) || null,
      String(baptismDetails.godparent1HomeParish || "").trim().slice(0, 200) || null,
      baptismDetails.godparent1OrthodoxAttested ? 1 : 0,
      String(baptismDetails.godparent2Name || "").trim().slice(0, 200) || null,
      String(baptismDetails.godparent2HomeParish || "").trim().slice(0, 200) || null,
      baptismDetails.godparent2OrthodoxAttested ? 1 : 0
    );
  }

  if (weddingDetails) {
    await d1Run(env, `
      INSERT INTO sacrament_wedding_details
        (request_id, party_a_name, party_a_orthodox, party_a_prior_marriage,
         party_b_name, party_b_orthodox, party_b_prior_marriage,
         koumbaro_name, koumbaro_home_parish,
         marriage_license_status, premarital_counsel_complete)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      String(weddingDetails.partyAName || "").trim().slice(0, 200),
      weddingDetails.partyAOrthodox ? 1 : 0,
      weddingDetails.partyAPriorMarriage ? 1 : 0,
      String(weddingDetails.partyBName || "").trim().slice(0, 200),
      weddingDetails.partyBOrthodox ? 1 : 0,
      weddingDetails.partyBPriorMarriage ? 1 : 0,
      String(weddingDetails.koumbaroName || "").trim().slice(0, 200) || null,
      String(weddingDetails.koumbaroHomeParish || "").trim().slice(0, 200) || null,
      ["not_started", "applied", "obtained"].includes(weddingDetails.marriageLicenseStatus)
        ? weddingDetails.marriageLicenseStatus : "not_started",
      weddingDetails.premaritalCounselComplete ? 1 : 0
    );
  }

  // Best-effort notification to the parish — never blocks the request itself.
  try {
    const registration = found.registration;
    const to = [registration.priestEmail, registration.treasurerEmail, registration.email, registration.contactEmail]
      .filter(Boolean);
    if (to.length) {
      const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
      const typeLabel = otherTypeLabel || sacramentTypeLabel(sacramentType);
      await sendEmail(env, {
        from: env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>",
        to: [...new Set(to.map((a) => String(a).trim().toLowerCase()))],
        reply_to: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
        subject: `New request: ${typeLabel}`,
        html: agapayEmailHtml(appUrl, "New Sacrament Request", `
          <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#171715;">A parishioner has requested <strong>${htmlEscape(typeLabel)}</strong> through AGAPAY.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;">
            <tr><td style="padding:6px 10px 6px 0;color:#595959;width:140px;vertical-align:top;"><strong>Requested by</strong></td><td style="padding:6px 0;">${htmlEscape(donor.donorName || donor.email)}</td></tr>
            <tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Contact</strong></td><td style="padding:6px 0;"><a href="mailto:${htmlEscape(donor.email)}" style="color:#0A365B;">${htmlEscape(donor.email)}</a>${phone ? " · " + htmlEscape(phone) : ""}</td></tr>
            ${participantNames ? `<tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>For</strong></td><td style="padding:6px 0;">${htmlEscape(participantNames)}</td></tr>` : ""}
            ${requestedDate ? `<tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Preferred date</strong></td><td style="padding:6px 0;">${htmlEscape(requestedDate)}</td></tr>` : ""}
            ${requestedTimeWindow ? `<tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Preferred time</strong></td><td style="padding:6px 0;">${htmlEscape(requestedTimeWindow)}</td></tr>` : ""}
            ${locationAddress ? `<tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Location</strong></td><td style="padding:6px 0;">${htmlEscape(locationAddress)}</td></tr>` : ""}
            ${notes ? `<tr><td style="padding:6px 10px 6px 0;color:#595959;vertical-align:top;"><strong>Notes</strong></td><td style="padding:6px 0;white-space:pre-wrap;">${htmlEscape(notes)}</td></tr>` : ""}
          </table>
          <p style="margin:18px 0 0;font-size:13px;color:#6F6A60;">Review and respond to this request from your parish dashboard, under Sacraments &amp; Services.</p>
        `),
        text: `New sacrament request: ${typeLabel}\nFrom: ${donor.donorName || donor.email} <${donor.email}>${phone ? " / " + phone : ""}\n${participantNames ? "For: " + participantNames + "\n" : ""}${requestedDate ? "Preferred date: " + requestedDate + "\n" : ""}${notes ? "\nNotes:\n" + notes : ""}`
      });
    }
  } catch { /* notification failure never blocks the request */ }

  const row = await d1First(env, "SELECT * FROM sacrament_requests WHERE id = ?", id);
  return json({ ok: true, request: await attachSacramentDetails(env, row) });
}

// POST /api/donor/sacraments/:id/cancel — donor withdraws their own pending request
export async function handleDonorSacramentCancel(request, env, requestId) {
  // No rollout-allowlist check needed here: a request can only exist in the
  // table if it was created via handleDonorSacraments' POST gate, which
  // already restricts creation to allowlisted parishes. Cancelling an
  // existing request is safe regardless of the parish's current rollout status.
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const row = await d1First(env, "SELECT * FROM sacrament_requests WHERE id = ? AND donor_email = ?", requestId, normalizeEmail(donor.email));
  if (!row) return json({ error: "Request not found." }, { status: 404 });
  if (!SACRAMENT_ACTIVE_STATUSES.has(row.status)) {
    return json({ error: "This request can no longer be cancelled." }, { status: 409 });
  }

  const now = new Date().toISOString();
  await d1Run(env, "UPDATE sacrament_requests SET status = 'cancelled', updated_at = ? WHERE id = ?", now, requestId);
  const updated = await d1First(env, "SELECT * FROM sacrament_requests WHERE id = ?", requestId);
  return json({ ok: true, request: await attachSacramentDetails(env, updated) });
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
  const note = String(body.note || body.inMemoriam || "").trim().slice(0, 2000);
  if (!parishId) {
    return json({ error: "Choose a parish before submitting commemorations.", detail: "Set a home parish in Settings, or include parishId." }, { status: 400 });
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
      note
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
      note,
      createdAt: new Date().toISOString()
    }
  );

  if (!entry) return json({ error: "Unable to submit commemoration." }, { status: 500 });

  const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
  const entries = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
  return json({ ok: true, entry, entries });
}

export function adminRegistrationSummary(registration = {}, fallbackReference = "") {
  registration = registration || {};
  return {
    reference: registration.reference || fallbackReference || "",
    status: registration.status || "pending",
    parishName: registration.parishName || "",
    communityType: registration.communityType || "",
    liturgicalCalendar: registration.liturgicalCalendar || "julian",
    jurisdiction: registration.jurisdiction || "",
    city: registration.city || "",
    state: registration.state || "",
    priestEmail: registration.priestEmail || "",
    treasurerEmail: registration.treasurerEmail || "",
    givingStatus: registration.givingStatus || "active",
    subscriptionTier: registration.subscriptionTier || defaultSubscriptionTier(registration),
    subscriptionStatus: registration.subscriptionStatus || "not_started",
    stripeAccountStatus: registration.stripeAccountStatus || "not_started",
    dashboardInviteEmailStatus: registration.dashboardInviteEmailStatus || "",
    adminNotificationEmailStatus: registration.adminNotificationEmailStatus || "",
    receivedAt: registration.receivedAt || ""
  };
}

export async function loadAdminRegistrationPage(env, options = {}) {
  const limit = clampListLimit(options.limit, 100, 250);
  const cursor = decodeListCursor(options.cursor);
  const status = String(options.status || "").trim().toLowerCase();
  const query = String(options.query || options.q || "").trim().toLowerCase();

  if (d1(env)) {
    const where = [];
    const params = [];
    if (status && status !== "all") {
      where.push("status = ?");
      params.push(status);
    }
    if (cursor) {
      where.push("(received_at < ? OR (received_at = ? AND reference < ?))");
      params.push(cursor.receivedAt, cursor.receivedAt, cursor.reference);
    }
    if (query) {
      where.push(`(
        LOWER(COALESCE(json_extract(data, '$.parishName'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.city'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.state'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.jurisdiction'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.priestEmail'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(data, '$.treasurerEmail'), '')) LIKE ?
      )`);
      const like = `%${query}%`;
      params.push(like, like, like, like, like, like);
    }
    const rows = await d1All(
      env,
      `SELECT reference, received_at, data
       FROM registrations
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY received_at DESC, reference DESC
       LIMIT ?`,
      ...params,
      limit + 1
    );
    const pageRows = rows.slice(0, limit);
    const registrations = pageRows.map((row) => {
      try {
        return adminRegistrationSummary(safeParseJsonRow(row), row.reference);
      } catch {
        return { reference: row.reference || "", status: "unreadable" };
      }
    });
    return {
      registrations,
      cursor: rows.length > limit ? encodeListCursor(pageRows[pageRows.length - 1]) : null,
      hasMore: rows.length > limit,
      limit,
      source: "d1"
    };
  }

  const keys = await listKvKeys(env, { limit });
  const registrations = [];

  for (const key of keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      if (status && status !== "all" && registration.status !== status) continue;
      if (query) {
        const haystack = [
          registration.parishName,
          registration.city,
          registration.state,
          registration.jurisdiction,
          registration.priestEmail,
          registration.treasurerEmail
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(query)) continue;
      }
      registrations.push(adminRegistrationSummary(registration, key.name));
    } catch {
      registrations.push({ reference: key.name, status: "unreadable" });
    }
  }

  registrations.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  return { registrations, cursor: null, hasMore: false, limit, source: "kv" };
}


// ── Donor notification helpers ───────────────────────────────────────────────

function newNotifId() {
  return generateSecret(16);
}

// GET /api/donor/notifications
// Returns active (undismissed) pledge nudge notifications for the signed-in donor.
export async function handleDonorNotifications(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!d1(env)) return json({ notifications: [] });

  const notifications = await d1All(env,
    `SELECT id, parish_id, type, fiscal_year, pledge_cents, given_cents, message, sent_at
     FROM donor_notifications
     WHERE donor_email = ? AND dismissed_at IS NULL
     ORDER BY sent_at DESC
     LIMIT 10`,
    normalizeEmail(donor.email)
  );

  return json({
    notifications: (notifications || []).map(n => ({
      id:          n.id,
      parishId:    n.parish_id,
      type:        n.type,
      fiscalYear:  n.fiscal_year,
      pledgeCents: n.pledge_cents,
      givenCents:  n.given_cents,
      message:     n.message || "",
      sentAt:      n.sent_at
    }))
  });
}

// POST /api/donor/notifications/:id/dismiss
export async function handleDonorNotificationDismiss(request, env, notifId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!d1(env)) return json({ ok: true });

  await d1Run(env,
    `UPDATE donor_notifications
     SET dismissed_at = datetime('now')
     WHERE id = ? AND donor_email = ?`,
    notifId, normalizeEmail(donor.email)
  );

  return json({ ok: true });
}
