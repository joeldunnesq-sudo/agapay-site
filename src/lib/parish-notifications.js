import { parishSlug } from "./format.js";
import { agapayEmailHtml, sendEmail } from "./email.js";
import { d1, normalizeEmail } from "./core.js";
import { createInvitation, listInvitationsForParish, revokeInvitation } from "./memberships.js";
import {
  defaultSubscriptionTier,
  publicSubscriptionTiers as sharedPublicSubscriptionTiers,
  subscriptionReady as sharedSubscriptionReady,
  subscriptionTier,
} from "./subscriptions.js";

function subscriptionTierSummary(tier) {
  if (!tier) return "";
  if (tier.monthlyCents === null) return `${tier.label} - custom / negotiated subscription; ${tier.transactionRateLabel || "no AGAPAY donation fee"}`;
  if (tier.monthlyCents === 0) return `${tier.label} - free forever monthly subscription; ${tier.transactionRateLabel || "no AGAPAY donation fee"}`;
  return `${tier.label} - $${(tier.monthlyCents / 100).toFixed(0)}/mo; ${tier.transactionRateLabel || "no AGAPAY donation fee"}`;
}

export function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generateDashboardToken() {
  return `agp_tmp_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function startOfYearUnix(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), 0, 1) / 1000);
}

export function monthLabel(index) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][index] || "";
}

export async function loadParishOnboardingGuideAttachment(env, appUrl) {
  if (!env.RESEND_API_KEY) return null;
  const baseUrl = String(appUrl || "https://agapay.app").replace(/\/+$/, "");
  const guideUrl = `${baseUrl}/docs/AGAPAY-Stripe-Setup-Guide.pdf`;
  try {
    const request = new Request(guideUrl);
    const response = env.ASSETS && typeof env.ASSETS.fetch === "function"
      ? await env.ASSETS.fetch(request)
      : await fetch(request);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return {
      filename: "AGAPAY-Parish-Onboarding-Guide.pdf",
      content: btoa(binary)
    };
  } catch {
    return null;
  }
}

export async function sendTreasurerStripeInvite(env, appUrl, registration) {
  const to = registration.treasurerEmail || registration.priestEmail || "";
  if (!to) return { status: "missing_recipient" };

  const parishId = registration.parishId || parishSlug(registration.parishName, registration.city);
  const dashboardUrl = `${appUrl}/give/login?parish=${encodeURIComponent(parishId)}`;
  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const parishName = htmlEscape(registration.parishName || "your parish");
  const safeDashboardUrl = htmlEscape(dashboardUrl);
  const currentGuideAttachment = await loadParishOnboardingGuideAttachment(env, appUrl);


  return sendEmail(env, {
    from,
    to: [to],
    reply_to: replyTo,
    subject: `Getting started with AGAPAY — ${registration.parishName || "your parish"}`,
    html: agapayEmailHtml(appUrl, "Getting started with AGAPAY", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;"><strong>${parishName}</strong> has been verified for AGAPAY. You are now ready to activate your subscription and connect your parish Stripe account so that your donors can begin giving online.</p>
      <div style="background:#061522;border:1px solid rgba(201,162,91,0.42);border-radius:12px;padding:20px;margin:0 0 24px;">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#C9A25B;font-weight:700;">What to do next</p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#F6F1E8;">We have attached a step-by-step setup guide to this email. It walks you through choosing your tier, activating billing, and connecting Stripe — the whole process takes about 15–20 minutes.</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:rgba(246,241,232,0.72);">Open the dashboard using the button below, then follow the First-Time Setup Wizard.</p>
      </div>
      <p style="margin:0 0 28px;"><a href="${safeDashboardUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 24px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Open parish dashboard →</a></p>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#171715;">Your dashboard address is <a href="${safeDashboardUrl}" style="color:#0A365B;text-decoration:underline;">${safeDashboardUrl}</a>. Use the Parish ID and password from your first email to log in.</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6F6A60;">The attached guide includes a post-launch checklist and troubleshooting tips. Please keep it handy.</p>
    `),
    text: [
      "Getting started with AGAPAY",
      "",
      `Glory to Jesus Christ! ${registration.parishName || "Your parish"} has been verified for AGAPAY.`,
      "",
      "We have attached a step-by-step setup guide to this email. It walks you through choosing your tier, activating billing, and connecting Stripe. The process takes about 15-20 minutes.",
      "",
      `Open your parish dashboard: ${dashboardUrl}`,
      "",
      "Use the Parish ID and password from your first email to log in, then follow the First-Time Setup Wizard.",
      "",
      "The attached guide includes a post-launch checklist and troubleshooting tips. Please keep it handy."
    ].join("\n"),
    attachments: [
      ...(currentGuideAttachment ? [currentGuideAttachment] : [])
    ]
  });
}

export async function sendParishStaffAccessInvitation(env, appUrl, registration, invitation) {
  const email = normalizeEmail(invitation?.email);
  const token = String(invitation?.token || "");
  if (!email || !token) return { status: "missing_recipient" };
  const roleLabels = {
    rector: "Rector", priest: "Priest", deacon: "Deacon", treasurer: "Treasurer",
    bookkeeper: "Bookkeeper", secretary: "Parish secretary", administrator: "Parish administrator",
    council_member: "Parish council member", volunteer: "Volunteer", reader: "Read-only staff",
    bookstore_manager: "Commerce manager"
  };
  const baseUrl = String(appUrl || "https://agapay.app").replace(/\/+$/, "");
  const accessUrl = `${baseUrl}/give/login?invite=${encodeURIComponent(token)}`;
  const parishName = registration?.parishName || "Your parish";
  const roleLabel = roleLabels[invitation.roleTemplate] || "Parish staff";
  return sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>",
    to: [email],
    reply_to: registration?.priestEmail || registration?.email || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
    subject: `${parishName} invited you to AGAPAY`,
    html: agapayEmailHtml(baseUrl, "Create your personal AGAPAY access", `
      <p><strong>${htmlEscape(parishName)}</strong> invited you to its parish dashboard as <strong>${htmlEscape(roleLabel)}</strong>.</p>
      <p>Open the secure link below, enter your name, and create your own password. If multi-factor authentication is required, AGAPAY will guide you through it before opening the dashboard.</p>
      <p style="margin:24px 0;"><a href="${htmlEscape(accessUrl)}" style="display:inline-block;background:#C9A25B;color:#061522;padding:13px 19px;border-radius:9px;text-decoration:none;font-weight:700;">Create my staff access</a></p>
      <p style="font-size:13px;color:#6F6A60;">This personal link expires in 14 days and can be used once. Do not forward it to another person.</p>
    `),
    text: [
      `${parishName} invited you to its AGAPAY parish dashboard as ${roleLabel}.`, "",
      "Open this secure link, enter your name, and create your own password:", accessUrl, "",
      "If multi-factor authentication is required, AGAPAY will guide you through it. This link expires in 14 days and can be used once."
    ].join("\n")
  });
}

export async function sendDashboardInvite(env, appUrl, registration) {
  const parishId = registration.parishId || parishSlug(registration.parishName, registration.city);
  const paidSubscription = String(registration.subscriptionStatus || "").trim().toLowerCase() === "active";
  const people = paidSubscription
    ? [{ key: "treasurer", email: normalizeEmail(registration.treasurerEmail), roleTemplate: "treasurer", label: "treasurer" }].filter((person) => person.email)
    : [];
  const uniquePeople = people.filter((person, index) => people.findIndex((candidate) => candidate.email === person.email) === index);
  const currentGuideAttachment = await loadParishOnboardingGuideAttachment(env, appUrl);

  if (uniquePeople.length && d1(env)) {
    const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
    const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
    const parishName = htmlEscape(registration.parishName || "your parish");
    const existing = await listInvitationsForParish(env, parishId);
    const deliveries = [];
    const access = {};

    for (const person of uniquePeople) {
      for (const pending of existing.filter((item) => item.status === "pending" && normalizeEmail(item.email) === person.email)) {
        await revokeInvitation(env, { invitationId: pending.id });
      }
      const invitation = await createInvitation(env, {
        parishId,
        email: person.email,
        roleTemplate: person.roleTemplate,
        invitedByLegacyBearer: true
      });
      if (!invitation.ok) {
        deliveries.push({ ...person, status: "failed", detail: invitation.error || "Unable to create access invitation." });
        continue;
      }

      const accessUrl = `${String(appUrl).replace(/\/+$/, "")}/give/login?invite=${encodeURIComponent(invitation.token)}`;
      const email = await sendEmail(env, {
        from,
        to: [person.email],
        reply_to: replyTo,
        subject: `Getting started with AGAPAY - ${registration.parishName || "your parish"}`,
        html: agapayEmailHtml(appUrl, "Getting started with AGAPAY", `
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;"><strong>${parishName}</strong> invited you to its AGAPAY dashboard as ${htmlEscape(person.label)}.</p>
          <div style="background:#061522;border:1px solid rgba(201,162,91,0.42);border-radius:12px;padding:18px;margin:0 0 22px;">
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#C9A25B;font-weight:700;">10-minute parish setup</p>
            <p style="margin:0;font-size:15px;line-height:1.7;color:#F6F1E8;">Open your secure link and create your own password. No parish ID or temporary password is required.</p>
          </div>
          <p style="margin:0 0 24px;"><a href="${htmlEscape(accessUrl)}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Create my access</a></p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6F6A60;">This personal link expires in 14 days and can be used once.</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6F6A60;">The Parish Onboarding Guide is attached for reference.</p>
        `),
        text: [
          "Create your AGAPAY access",
          "",
          `${registration.parishName || "Your parish"} invited you to its AGAPAY dashboard as ${person.label}.`,
          "Open your secure link and create your own password. No parish ID or temporary password is required.",
          "",
          accessUrl,
          "",
          "This personal link expires in 14 days and can be used once.",
          "The Parish Onboarding Guide is attached for reference."
        ].join("\n"),
        attachments: currentGuideAttachment ? [currentGuideAttachment] : []
      });
      deliveries.push({ ...person, invitationId: invitation.id, expiresAt: invitation.expiresAt, status: email.status, id: email.id || "", detail: email.detail || "" });
      access[person.key] = {
        email: person.email,
        roleTemplate: person.roleTemplate,
        invitationId: invitation.id,
        status: "invited",
        invitedAt: new Date().toISOString(),
        expiresAt: invitation.expiresAt,
        emailStatus: email.status
      };
    }

    for (const person of people) {
      if (!access[person.key]) {
        const shared = Object.values(access).find((entry) => entry.email === person.email);
        if (shared) access[person.key] = { ...shared, roleTemplate: person.roleTemplate };
      }
    }
    const sent = deliveries.filter((item) => item.status === "sent").length;
    return {
      status: sent === deliveries.length && deliveries.length ? "sent" : deliveries.some((item) => item.status === "not_configured") ? "not_configured" : "failed",
      recipients: uniquePeople.map((person) => person.email),
      deliveries,
      access
    };
  }

  const recipients = Array.from(new Set([
    registration.priestEmail,
    registration.treasurerEmail
  ].filter(Boolean)));
  if (!recipients.length) return { status: "missing_recipient" };

  const dashboardUrl = `${appUrl}/give/login?parish=${encodeURIComponent(parishId)}`;
  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const parishName = htmlEscape(registration.parishName || "your parish");
  const safeDashboardUrl = htmlEscape(dashboardUrl);

  const email = await sendEmail(env, {
    from,
    to: recipients,
    reply_to: replyTo,
    subject: `Getting started with AGAPAY — ${registration.parishName || "your parish"}`,
    html: agapayEmailHtml(appUrl, "Getting started with AGAPAY", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;"><strong>${parishName}</strong> has been verified for AGAPAY. You can now begin the setup process for your parish giving page, AGAPAY billing, and Stripe onboarding.</p>
      <div style="background:#061522;border:1px solid rgba(201,162,91,0.42);border-radius:12px;padding:18px 18px;margin:0 0 22px;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#C9A25B;font-weight:700;">Next step</p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#F6F1E8;"><strong>Open your dashboard with the Parish ID and temporary password from your welcome email.</strong> Then choose your AGAPAY tier and complete billing. Once billing is active, the dashboard will guide you into Stripe onboarding so your parish can receive donations.</p>
      </div>
      <p style="margin:0 0 24px;"><a href="${safeDashboardUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Open parish dashboard</a></p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Dashboard reminder</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Dashboard:</strong> <a href="${safeDashboardUrl}" style="color:#0A365B;text-decoration:underline;">${safeDashboardUrl}</a></p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Parish ID:</strong> ${htmlEscape(parishId)}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Temporary password:</strong> Use the password from your welcome email.</p>
      </div>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#171715;">After opening the dashboard, enter the parish ID and temporary password from your welcome email. The setup card will walk you through billing first, then Stripe onboarding.</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6F6A60;">If you cannot find the welcome email, use the “Forgot password” link on the parish login page or reply to this email.</p>
    `),
    text: [
      "Getting started with AGAPAY",
      "",
      `${registration.parishName || "Your parish"} has been verified for AGAPAY.`,
      "Open your dashboard with the Parish ID and temporary password from your welcome email.",
      "Then choose your AGAPAY tier and complete billing. Once billing is active, the dashboard will guide you into Stripe onboarding so your parish can receive donations.",
      "",
      `Dashboard: ${dashboardUrl}`,
      `Parish ID: ${parishId}`,
      "Temporary password: Use the password from your welcome email.",
      "",
      "After opening the dashboard, enter the parish ID and temporary password from your welcome email. The setup card will walk you through billing first, then Stripe onboarding.",
      "",
      "If you cannot find the welcome email, use the Forgot password link on the parish login page or reply to this email.",
      "The Parish Onboarding Guide is attached for reference."
    ].join("\n"),
    attachments: currentGuideAttachment ? [currentGuideAttachment] : []
  });

  return { ...email, recipients };
}

export async function sendParishPasswordResetEmail(env, appUrl, registration, resetUrl, recipients) {
  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const parishName = htmlEscape(registration.parishName || "your parish");
  const parishId = htmlEscape(registration.parishId || parishSlug(registration.parishName, registration.city));
  const safeResetUrl = htmlEscape(resetUrl);

  return sendEmail(env, {
    from,
    to: recipients,
    reply_to: replyTo,
    subject: `Reset AGAPAY parish dashboard password for ${registration.parishName || "your parish"}`,
    html: agapayEmailHtml(appUrl, "Reset parish dashboard password", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">A password reset was requested for <strong>${parishName}</strong>.</p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Parish ID:</strong> ${parishId}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Reset link:</strong> <a href="${safeResetUrl}" style="color:#0A365B;text-decoration:underline;">${safeResetUrl}</a></p>
      </div>
      <p style="margin:0 0 24px;"><a href="${safeResetUrl}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Reset parish password</a></p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6F6A60;">If you did not request this, ignore this email. The link expires in 1 hour.</p>
    `),
    text: [
      "Reset parish dashboard password",
      "",
      `Parish: ${registration.parishName || ""}`,
      `Parish ID: ${registration.parishId || parishSlug(registration.parishName, registration.city)}`,
      `Open this link to choose a new password: ${resetUrl}`,
      "",
      "If you did not request this, ignore this email. The link expires in 1 hour."
    ].join("\n")
  });
}


export async function sendRegistrationConfirmation(env, appUrl, registration) {
  const recipients = Array.from(new Set([
    registration.priestEmail,
    registration.treasurerEmail
  ].filter(Boolean)));
  if (!recipients.length) return { status: "missing_recipient" };

  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const parishName = htmlEscape(registration.parishName || "your community");
  const reference = htmlEscape(registration.reference || "");
  const parishId = registration.parishId || parishSlug(registration.parishName, registration.city);
  const dashboardUrl = `${appUrl}/give/login?parish=${encodeURIComponent(parishId)}`;
  const safeDashboardUrl = htmlEscape(dashboardUrl);
  const temporaryPassword = htmlEscape(registration.parishDashboardToken || "");
  const tier = subscriptionTier(registration);
  const tierLabel = htmlEscape(subscriptionTierSummary(tier));
  return sendEmail(env, {
    from,
    to: recipients,
    reply_to: replyTo,
    subject: `Welcome to AGAPAY — dashboard access for ${registration.parishName || "your parish"}`,
    html: agapayEmailHtml(appUrl, "Welcome to AGAPAY", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Thank you for registering <strong>${parishName}</strong> with AGAPAY. We have received your application and will personally review it for canonical standing before activation.</p>
      <div style="background:#061522;border:1px solid rgba(201,162,91,0.42);border-radius:12px;padding:20px;margin:0 0 24px;">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#C9A25B;font-weight:700;">Your registration summary</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#F6F1E8;"><strong style="color:#C9A25B;">Reference number:</strong> ${reference}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#F6F1E8;"><strong style="color:#C9A25B;">Community:</strong> ${parishName}</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#F6F1E8;"><strong style="color:#C9A25B;">Subscription tier:</strong> ${tierLabel}</p>
      </div>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Dashboard access</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Dashboard:</strong> <a href="${safeDashboardUrl}" style="color:#0A365B;text-decoration:underline;">${safeDashboardUrl}</a></p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Parish ID:</strong> ${htmlEscape(parishId)}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Temporary password:</strong> ${temporaryPassword}</p>
      </div>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#171715;">Please save your reference number. If you have questions about your registration status, email <a href="mailto:onboarding@agapay.app" style="color:#0A365B;">onboarding@agapay.app</a> and include it in your message.</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6F6A60;">Keep the Parish ID and temporary password above; you will use them after verification. The setup guide will arrive with your Getting started email after review.</p>
    `),
    text: [
      "Welcome to AGAPAY",
      "",
      "Glory to Jesus Christ!",
      "",
      `Thank you for registering ${registration.parishName || ""} with AGAPAY.`,
      "We have received your application and will personally review it for canonical standing before activation.",
      "You will hear from us within one business day.",
      "",
      "YOUR REGISTRATION SUMMARY",
      `Reference number: ${registration.reference || ""}`,
      `Community: ${registration.parishName || ""}`,
      `Subscription tier: ${subscriptionTierSummary(tier)}`,
      registration.parishHouseholdBand ? `Parish household band: ${registration.parishHouseholdBand}` : "",
      registration.subscriptionPricingProgram ? `Pricing program: ${registration.subscriptionPricingProgram}` : "",
      "",
      "DASHBOARD ACCESS",
      `Dashboard: ${dashboardUrl}`,
      `Parish ID: ${parishId}`,
      `Temporary password: ${registration.parishDashboardToken || ""}`,
      "",
      "Please save your reference number. If you have questions about your registration status,",
      "email onboarding@agapay.app and include it in your message.",
      "",
      "Keep the Parish ID and temporary password above; you will use them after verification.",
      "The setup guide will arrive with your Getting started email after review."
    ].join("\n")
  });
}

export async function sendAdminRegistrationNotice(env, appUrl, registration) {
  const to = env.AGAPAY_REGISTRATION_NOTIFY_EMAIL || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  if (!to) return { status: "missing_recipient" };

  const from = env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>";
  const replyTo = registration.priestEmail || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const adminUrl = `${appUrl}/admin`;
  const parishName = htmlEscape(registration.parishName || "New parish registration");
  const tier = subscriptionTier(registration);
  const location = [registration.city, registration.state].filter(Boolean).join(", ");
  const address = [registration.addressLine1, registration.addressLine2, [registration.city, registration.state, registration.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const jurisdictionRow = registration.jurisdiction
    ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Jurisdiction:</strong> ${htmlEscape(registration.jurisdiction || "")}</p>`
    : "";
  const websiteRow = registration.website
    ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Website:</strong> ${htmlEscape(registration.website || "")}</p>`
    : "";
  const descriptionRow = registration.organizationDescription
    ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Description:</strong> ${htmlEscape(registration.organizationDescription || "")}</p>`
    : "";

  return sendEmail(env, {
    from,
    to: [to],
    reply_to: replyTo,
    subject: `New AGAPAY ${subscriptionTierSummary(tier)} registration: ${registration.parishName || registration.reference}`,
    html: agapayEmailHtml(appUrl, "New organization registration", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">A new organization has submitted the AGAPAY registration form and is ready for review.</p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Registration summary</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Reference:</strong> ${htmlEscape(registration.reference)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Community:</strong> ${parishName}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Type:</strong> ${htmlEscape(registration.communityType || "")}</p>
        ${jurisdictionRow}
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Location:</strong> ${htmlEscape(location)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Address:</strong> ${htmlEscape(address)}</p>
        ${websiteRow}
        ${descriptionRow}
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Subscription tier:</strong> ${htmlEscape(subscriptionTierSummary(tier))}</p>
      </div>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#171715;"><strong>Primary contact:</strong> ${htmlEscape(`${registration.priestFirst || ""} ${registration.priestLast || ""}`.trim())} - ${htmlEscape(registration.priestEmail || "")}</p>
      <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#171715;"><strong>Finance contact:</strong> ${htmlEscape(`${registration.treasurerFirst || ""} ${registration.treasurerLast || ""}`.trim())} - ${htmlEscape(registration.treasurerEmail || "")}</p>
      <p style="margin:0;"><a href="${htmlEscape(adminUrl)}" style="display:inline-block;background:#C9A25B;color:#061522;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Open admin dashboard</a></p>
    `),
    text: [
      "New AGAPAY registration",
      "",
      `Reference: ${registration.reference}`,
      `Community: ${registration.parishName || ""}`,
      `Type: ${registration.communityType || ""}`,
      registration.jurisdiction ? `Jurisdiction: ${registration.jurisdiction || ""}` : "",
      `Location: ${location}`,
      `Address: ${address}`,
      registration.website ? `Website: ${registration.website || ""}` : "",
      registration.organizationDescription ? `Description: ${registration.organizationDescription || ""}` : "",
      `Subscription tier: ${subscriptionTierSummary(tier)}`,
      "",
      `Primary contact: ${`${registration.priestFirst || ""} ${registration.priestLast || ""}`.trim()} - ${registration.priestEmail || ""}`,
      `Finance contact: ${`${registration.treasurerFirst || ""} ${registration.treasurerLast || ""}`.trim()} - ${registration.treasurerEmail || ""}`,
      "",
      `Open admin dashboard: ${adminUrl}`
    ].join("\n")
  });
}

export function publicSubscriptionTiers() {
  return sharedPublicSubscriptionTiers();
}

export function subscriptionReady(registration) {
  return sharedSubscriptionReady(registration);
}
