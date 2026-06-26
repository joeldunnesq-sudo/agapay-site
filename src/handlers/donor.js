import {
  applyDonorPassword,
  clampListLimit,
  d1,
  d1All,
  decodeListCursor,
  deleteDonor,
  DONOR_SESSION_TTL_MS,
  encodeListCursor,
  generateSecret,
  hashSessionToken,
  hasProductionStore,
  isSystemKvKey,
  json,
  listKvKeys,
  loadDonor,
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
  findRegistrationByParishId,
  loadDonorOfferingByCheckout,
  loadDonorOfferingByPaymentIntent,
  loadDonorOfferings,
  loadReconciledDonorCommemorations,
  migrateDonorEmailReferences,
  offeringFeeBreakdown,
  parishFromRegistration,
  publicDonorOffering,
  reconcilePendingDonorOfferings,
  requireDonor,
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
  if (!donor) return unauthorized();
  if (!(await verifyDonorPassword(donor, password))) return unauthorized();
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
        ON CONFLICT(donor_email, fiscal_year) DO UPDATE SET
          target_amount_cents = excluded.target_amount_cents,
          parish_id           = excluded.parish_id,
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
  }

  return json({
    donor: publicDonor(donor),
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

export async function handleDonorCommemorations(request, env) {
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();

  if (request.method === "GET") {
    const offerings = await reconcilePendingDonorOfferings(env, await loadDonorOfferings(env, donor.email, 100));
    const entries = await loadReconciledDonorCommemorations(env, donor.email, offerings, 100);
    return json({ entries });
  }

  return json(
    { error: "Commemoration submissions now require checkout", detail: "Use /api/create-checkout-session with giftType=commemoration so names are attached to a paid offering." },
    { status: 405 }
  );
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
