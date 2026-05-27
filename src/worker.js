const ADMIN_PASSWORD_KV_KEY = "__agapay_admin_password";
const COMMEMORATION_KEY_PREFIX = "__agapay_commemoration__";

const subscriptionTiers = [
  {
    id: "mission",
    label: "Mission",
    monthlyCents: 4900,
    transactionRateLabel: "5% + $0.30 per transaction",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_MISSION_MONTHLY",
    description: "Monthly AgaPay platform subscription for missions."
  },
  {
    id: "parish",
    label: "Parish",
    monthlyCents: 9900,
    transactionRateLabel: "5% + $0.30 per transaction",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_MONTHLY",
    description: "Monthly AgaPay platform subscription for established parishes."
  },
  {
    id: "diocese",
    label: "Cathedral / Diocese",
    monthlyCents: null,
    transactionRateLabel: "Negotiated transaction rate",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_DIOCESE_MONTHLY",
    description: "Custom AgaPay pricing for cathedrals, dioceses, and multi-parish organizations."
  },
  {
    id: "monastery_free",
    label: "Monastery / Skete",
    monthlyCents: 0,
    transactionRateLabel: "5% + $0.30 per transaction",
    stripePriceEnv: "",
    description: "AgaPay transaction pricing for Orthodox monasteries and sketes."
  }
];

function json(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, { status: 401 });
}

function isSystemKvKey(keyName) {
  return keyName === ADMIN_PASSWORD_KV_KEY || String(keyName || "").startsWith(COMMEMORATION_KEY_PREFIX);
}

function getAdminToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return request.headers.get("X-AgaPay-Admin-Token") || "";
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return "";
}

async function currentAdminPassword(env) {
  const kvPassword = env.AGAPAY_REGISTRATIONS
    ? await env.AGAPAY_REGISTRATIONS.get(ADMIN_PASSWORD_KV_KEY)
    : "";
  return kvPassword || env.AGAPAY_ADMIN_TOKEN || "";
}

async function requireAdmin(request, env) {
  const adminPassword = await currentAdminPassword(env);
  if (!adminPassword) return false;
  const submitted = getAdminToken(request);
  return submitted === adminPassword || submitted === env.AGAPAY_ADMIN_TOKEN;
}

function requireFields(body, fields) {
  return fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === "";
  });
}

function centsFromAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100);
}

function donorName(body) {
  return [body.firstName, body.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

async function stripeFormRequest(env, path, form, method = "POST") {
  if (!env.STRIPE_SECRET_KEY) {
    return {
      ok: false,
      status: 500,
      body: { error: { message: "STRIPE_SECRET_KEY is not configured" } }
    };
  }

  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

async function stripeGetRequest(env, path) {
  if (!env.STRIPE_SECRET_KEY) {
    return {
      ok: false,
      status: 500,
      body: { error: { message: "STRIPE_SECRET_KEY is not configured" } }
    };
  }

  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`
    }
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

async function stripeGetConnectedRequest(env, path, stripeAccountId) {
  if (!env.STRIPE_SECRET_KEY) {
    return {
      ok: false,
      status: 500,
      body: { error: { message: "STRIPE_SECRET_KEY is not configured" } }
    };
  }

  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Stripe-Account": stripeAccountId
    }
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

async function stripeFormConnectedRequest(env, path, form, stripeAccountId, method = "POST") {
  if (!env.STRIPE_SECRET_KEY) {
    return {
      ok: false,
      status: 500,
      body: { error: { message: "STRIPE_SECRET_KEY is not configured" } }
    };
  }

  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (stripeAccountId) headers["Stripe-Account"] = stripeAccountId;

  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers,
    body: form
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

function stripeAccountStatus(account) {
  if (account.payouts_enabled) return "payouts_enabled";
  if (account.charges_enabled) return "charges_enabled";
  if (account.requirements?.disabled_reason) return "restricted";
  if (account.details_submitted) return "onboarding";
  return "invited";
}

function subscriptionTier(id) {
  return subscriptionTiers.find((tier) => tier.id === id) || null;
}

function defaultSubscriptionTier(registration) {
  const type = normalizeCommunityType(registration.communityType);
  if (type === "monastery") return "monastery_free";
  if (type === "mission") return "mission";
  return "parish";
}

function subscriptionStatusLabel(status) {
  const labels = {
    not_started: "Not started",
    checkout_created: "Checkout created",
    active: "Active",
    past_due: "Past due",
    cancelled: "Cancelled",
    free_forever: "Free forever"
  };
  return labels[status] || status || "Not started";
}

function subscriptionTierSummary(tier) {
  if (!tier) return "";
  if (tier.monthlyCents === null) return `${tier.label} - custom / negotiated`;
  if (tier.monthlyCents === 0) return `${tier.label} - free forever monthly subscription; ${tier.transactionRateLabel || "standard transaction fees apply"}`;
  return `${tier.label} - $${(tier.monthlyCents / 100).toFixed(0)}/mo + ${tier.transactionRateLabel || "standard transaction fees"}`;
}

function absoluteWebsiteUrl(value) {
  const website = String(value || "").trim();
  if (!website) return "";
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website}`;
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function agapayEmailHtml(appUrl, title, bodyHtml) {
  const baseUrl = String(appUrl || "https://agapay.app").replace(/\/+$/, "");
  const markUrl = htmlEscape(`${baseUrl}/mark.png`);

  return `
    <div style="margin:0;padding:0;background:#F6F1E8;color:#171715;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:660px;margin:0 auto;padding:28px 14px;">
        <div style="background:#FFFFFF;border:1px solid rgba(166,159,145,0.32);border-radius:16px;overflow:hidden;box-shadow:0 12px 34px rgba(15,45,31,0.10);">
          <div style="background:#0F2D1F;padding:28px 30px;border-bottom:3px solid #B8902F;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:58px;vertical-align:middle;">
                  <img src="${markUrl}" alt="AgaPay" width="50" height="50" style="display:block;width:50px;height:50px;border-radius:10px;" />
                </td>
                <td style="vertical-align:middle;padding-left:12px;">
                  <div style="font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:1;font-weight:500;color:#F6F1E8;letter-spacing:-0.01em;">Aga<span style="color:#B8902F;">Pay</span></div>
                  <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;font-style:italic;color:rgba(246,241,232,0.72);padding-top:6px;">Love where you give.</div>
                </td>
              </tr>
            </table>
          </div>

          <div style="padding:34px 30px 30px;background:#FFFFFF;">
            <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#B8902F;font-weight:700;margin-bottom:12px;">AgaPay parish onboarding</div>
            <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.18;font-weight:500;color:#0F2D1F;">${htmlEscape(title)}</h1>
            ${bodyHtml}
            <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#171715;">In Christ,<br /><strong>AgaPay Team</strong></p>
          </div>

          <div style="background:#F6F1E8;padding:18px 30px;border-top:1px solid rgba(166,159,145,0.26);">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#6F6A60;">AgaPay helps canonical Orthodox parishes, missions, and monasteries receive faithful giving online. If you need help, reply to this email.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function generateDashboardToken() {
  return `agp_tmp_${crypto.randomUUID().replace(/-/g, "")}`;
}

function startOfYearUnix(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), 0, 1) / 1000);
}

function monthLabel(index) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][index] || "";
}

async function sendEmail(env, message) {
  if (!env.RESEND_API_KEY) return { status: "not_configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        status: "failed",
        detail: body.message || body.error || "Email provider rejected the message"
      };
    }

    return { status: "sent", id: body.id || "" };
  } catch (err) {
    return {
      status: "failed",
      detail: err.message || "Email request failed"
    };
  }
}

async function sendTreasurerStripeInvite(env, appUrl, registration) {
  const to = registration.treasurerEmail || registration.priestEmail || "";
  if (!to) return { status: "missing_recipient" };

  const parishId = registration.parishId || slugify(registration.parishName);
  const dashboardUrl = `${appUrl}/parish/dashboard?parish=${encodeURIComponent(parishId)}`;
  const from = env.AGAPAY_FROM_EMAIL || "AgaPay <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const parishName = htmlEscape(registration.parishName || "your parish");
  const token = htmlEscape(registration.parishDashboardToken || "");
  const safeDashboardUrl = htmlEscape(dashboardUrl);

  return sendEmail(env, {
    from,
    to: [to],
    reply_to: replyTo,
    subject: `Set up Stripe giving for ${registration.parishName || "your parish"}`,
    html: agapayEmailHtml(appUrl, "AgaPay Stripe onboarding", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">AgaPay is ready for <strong>${parishName}</strong> to complete Stripe onboarding so online gifts can be routed to the parish's connected Stripe account.</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#171715;"><strong>Please complete Stripe onboarding as soon as possible.</strong> Once Stripe approves and connects the account, your parish can begin receiving donations through AgaPay.</p>
      <p style="margin:0 0 24px;"><a href="${safeDashboardUrl}" style="display:inline-block;background:#B8902F;color:#0F2D1F;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Open parish dashboard</a></p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Dashboard credentials</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Parish ID:</strong> ${htmlEscape(parishId)}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Parish password:</strong> ${token}</p>
      </div>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#171715;">After opening the dashboard, enter the parish ID and password, then use the Stripe onboarding button in the Payments section.</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6F6A60;">For security, Stripe onboarding links are created inside AgaPay after the parish password is entered.</p>
    `),
    text: [
      "AgaPay Stripe onboarding",
      "",
      `AgaPay is ready for ${registration.parishName || "your parish"} to complete Stripe onboarding.`,
      "Please complete Stripe onboarding as soon as possible. Once Stripe approves and connects the account, your parish can begin receiving donations through AgaPay.",
      "",
      `Open parish dashboard: ${dashboardUrl}`,
      `Parish ID: ${parishId}`,
      `Parish password: ${registration.parishDashboardToken || ""}`,
      "",
      "After opening the dashboard, enter the parish ID and password, then use the Stripe onboarding button in the Payments section."
    ].join("\n")
  });
}

async function sendDashboardInvite(env, appUrl, registration) {
  const recipients = Array.from(new Set([
    registration.priestEmail,
    registration.treasurerEmail
  ].filter(Boolean)));
  if (!recipients.length) return { status: "missing_recipient" };

  const parishId = registration.parishId || slugify(registration.parishName);
  const dashboardUrl = `${appUrl}/parish/dashboard?parish=${encodeURIComponent(parishId)}`;
  const from = env.AGAPAY_FROM_EMAIL || "AgaPay <onboarding@agapay.app>";
  const replyTo = env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const parishName = htmlEscape(registration.parishName || "your parish");
  const token = htmlEscape(registration.parishDashboardToken || "");
  const safeDashboardUrl = htmlEscape(dashboardUrl);

  const email = await sendEmail(env, {
    from,
    to: recipients,
    reply_to: replyTo,
    subject: `AgaPay dashboard access for ${registration.parishName || "your parish"}`,
    html: agapayEmailHtml(appUrl, "Your AgaPay parish dashboard", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;"><strong>${parishName}</strong> has been verified for AgaPay. You can now access the parish dashboard to manage your giving page, funds, campaigns, and Stripe onboarding.</p>
      <div style="background:#0F2D1F;border-radius:12px;padding:18px 18px;margin:0 0 22px;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#B8902F;font-weight:700;">Next step</p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#F6F1E8;"><strong>Please start Stripe onboarding as soon as possible.</strong> Your parish will be able to receive donations through AgaPay once the Stripe connection is completed and approved.</p>
      </div>
      <p style="margin:0 0 24px;"><a href="${safeDashboardUrl}" style="display:inline-block;background:#B8902F;color:#0F2D1F;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Open parish dashboard</a></p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Dashboard credentials</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Dashboard:</strong> <a href="${safeDashboardUrl}" style="color:#2F5A39;text-decoration:underline;">${safeDashboardUrl}</a></p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Parish ID:</strong> ${htmlEscape(parishId)}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Temporary password:</strong> ${token}</p>
      </div>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#171715;">After opening the dashboard, enter the parish ID and temporary password, then use the Stripe onboarding button in the Payments section.</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6F6A60;">This temporary password gives access to your AgaPay parish dashboard. Please keep it private.</p>
    `),
    text: [
      "Your AgaPay parish dashboard",
      "",
      `${registration.parishName || "Your parish"} has been verified for AgaPay.`,
      "Please start Stripe onboarding as soon as possible. Your parish will be able to receive donations through AgaPay once the Stripe connection is completed and approved.",
      "",
      `Dashboard: ${dashboardUrl}`,
      `Parish ID: ${parishId}`,
      `Temporary password: ${registration.parishDashboardToken || ""}`,
      "",
      "After opening the dashboard, enter the parish ID and temporary password, then use the Stripe onboarding button in the Payments section.",
      "",
      "This temporary password gives access to your AgaPay parish dashboard. Please keep it private."
    ].join("\n")
  });

  return { ...email, recipients };
}

async function sendAdminRegistrationNotice(env, appUrl, registration) {
  const to = env.AGAPAY_REGISTRATION_NOTIFY_EMAIL || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  if (!to) return { status: "missing_recipient" };

  const from = env.AGAPAY_FROM_EMAIL || "AgaPay <onboarding@agapay.app>";
  const replyTo = registration.priestEmail || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const adminUrl = `${appUrl}/admin`;
  const parishName = htmlEscape(registration.parishName || "New parish registration");
  const tier = subscriptionTier(registration.subscriptionTier || defaultSubscriptionTier(registration));
  const location = [registration.city, registration.state].filter(Boolean).join(", ");

  return sendEmail(env, {
    from,
    to: [to],
    reply_to: replyTo,
    subject: `New AgaPay registration: ${registration.parishName || registration.reference}`,
    html: agapayEmailHtml(appUrl, "New parish registration", `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">A new community has submitted the AgaPay registration form and is ready for canonical review.</p>
      <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Registration summary</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Reference:</strong> ${htmlEscape(registration.reference)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Community:</strong> ${parishName}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Type:</strong> ${htmlEscape(registration.communityType || "")}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Jurisdiction:</strong> ${htmlEscape(registration.jurisdiction || "")}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#171715;"><strong>Location:</strong> ${htmlEscape(location)}</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#171715;"><strong>Subscription tier:</strong> ${htmlEscape(subscriptionTierSummary(tier))}</p>
      </div>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#171715;"><strong>Priest/Admin:</strong> ${htmlEscape(`${registration.priestFirst || ""} ${registration.priestLast || ""}`.trim())} - ${htmlEscape(registration.priestEmail || "")}</p>
      <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#171715;"><strong>Treasurer:</strong> ${htmlEscape(`${registration.treasurerFirst || ""} ${registration.treasurerLast || ""}`.trim())} - ${htmlEscape(registration.treasurerEmail || "")}</p>
      <p style="margin:0;"><a href="${htmlEscape(adminUrl)}" style="display:inline-block;background:#B8902F;color:#0F2D1F;padding:14px 20px;border-radius:10px;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-style:italic;font-weight:600;">Open admin dashboard</a></p>
    `),
    text: [
      "New parish registration",
      "",
      `Reference: ${registration.reference}`,
      `Community: ${registration.parishName || ""}`,
      `Type: ${registration.communityType || ""}`,
      `Jurisdiction: ${registration.jurisdiction || ""}`,
      `Location: ${location}`,
      `Subscription tier: ${subscriptionTierSummary(tier)}`,
      "",
      `Priest/Admin: ${`${registration.priestFirst || ""} ${registration.priestLast || ""}`.trim()} - ${registration.priestEmail || ""}`,
      `Treasurer: ${`${registration.treasurerFirst || ""} ${registration.treasurerLast || ""}`.trim()} - ${registration.treasurerEmail || ""}`,
      "",
      `Open admin dashboard: ${adminUrl}`
    ].join("\n")
  });
}

function publicSubscriptionTiers() {
  return subscriptionTiers.map(({ stripePriceEnv, ...tier }) => tier);
}

function stripeReady(registration) {
  return ["charges_enabled", "payouts_enabled"].includes(registration.stripeAccountStatus);
}

function subscriptionReady(registration) {
  return ["active", "free_forever"].includes(registration.subscriptionStatus);
}

function weekWindow(date = new Date()) {
  const end = new Date(date);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return { start, end };
}

function splitSubmittedNames(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function commemorationKey(parishId, sourceId) {
  return `${COMMEMORATION_KEY_PREFIX}${parishId}:${sourceId}`;
}

async function loadCommemorationEntries(env, parishId, startDate, endDate) {
  if (!env.AGAPAY_REGISTRATIONS || !parishId) return [];
  const prefix = commemorationKey(parishId, "");
  const list = await env.AGAPAY_REGISTRATIONS.list({ prefix, limit: 100 });
  const entries = [];

  for (const key of list.keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      const created = new Date(entry.createdAt || 0);
      if (startDate && created < startDate) continue;
      if (endDate && created > endDate) continue;
      entries.push(entry);
    } catch {
      // Ignore malformed queue entries rather than blocking the dashboard.
    }
  }

  entries.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return entries;
}

async function storeCommemorationEntry(env, sourceId, metadata = {}, fallback = {}) {
  if (!env.AGAPAY_REGISTRATIONS) return null;
  const parishId = metadata.parish_id || fallback.parishId || "";
  const living = splitSubmittedNames(metadata.names_living);
  const departed = splitSubmittedNames(metadata.names_departed);
  if (!parishId || (!living.length && !departed.length)) return null;

  const entry = {
    id: sourceId || crypto.randomUUID(),
    parishId,
    sourceId: sourceId || "",
    giftType: metadata.gift_type || fallback.giftType || "commemoration",
    frequency: metadata.frequency || fallback.frequency || "once",
    donorEmail: fallback.donorEmail || "",
    donorName: fallback.donorName || "",
    amountCents: Number(fallback.amountCents || 0),
    living,
    departed,
    createdAt: fallback.createdAt || new Date().toISOString()
  };

  await env.AGAPAY_REGISTRATIONS.put(commemorationKey(parishId, entry.id), JSON.stringify(entry));
  return entry;
}


function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeJurisdiction(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("rocor") || normalized.includes("russian orthodox church outside russia")) return "rocor";
  if (normalized.includes("orthodox church in america") || normalized === "oca") return "oca";
  if (normalized.includes("antiochian")) return "antiochian";
  if (normalized.includes("greek") || normalized.includes("goa")) return "goa";
  if (normalized.includes("serbian")) return "serbian";
  if (normalized.includes("romanian")) return "romanian";
  if (normalized.includes("bulgarian")) return "bulgarian";
  if (normalized.includes("ukrainian")) return "ukrainian";
  return slugify(value || "other");
}

function parishFromRegistration(registration) {
  const id = registration.parishId || slugify(registration.parishName);
  if (!id || registration.status !== "verified") return null;
  if (registration.givingStatus && registration.givingStatus !== "active") return null;
  const type = normalizeCommunityType(registration.communityType);

  return {
    id,
    name: registration.parishName,
    type,
    jurisdiction: normalizeJurisdiction(registration.jurisdiction || "other"),
    jurisdictionLabel: registration.jurisdiction || "Other canonical jurisdiction",
    city: registration.city || "",
    state: registration.state || "",
    status: "verified",
    givingStatus: registration.givingStatus || "active",
    source: "registration",
    funds: Array.isArray(registration.funds) && registration.funds.length ? registration.funds : [
      {
        id: "general",
        name: "General Operating Fund",
        description: "Utilities, supplies, ministries, and day-to-day parish needs."
      }
    ]
  };
}

function normalizeCommunityType(value) {
  const normalized = String(value || "parish").toLowerCase();
  if (normalized.includes("monastery") || normalized.includes("skete")) return "monastery";
  if (normalized.includes("mission")) return "mission";
  return "parish";
}

async function verifiedRegistrationParishes(env) {
  if (!env.AGAPAY_REGISTRATIONS) return [];

  const list = await env.AGAPAY_REGISTRATIONS.list({ limit: 100 });
  const verified = [];

  for (const key of list.keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const parish = parishFromRegistration(JSON.parse(raw));
      if (parish) verified.push(parish);
    } catch {
      // Ignore malformed registration records in the public parish directory.
    }
  }

  return verified;
}

async function findRegistrationByParishId(env, parishId) {
  if (!env.AGAPAY_REGISTRATIONS) return null;
  const list = await env.AGAPAY_REGISTRATIONS.list({ limit: 100 });

  for (const key of list.keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      const currentParishId = registration.parishId || slugify(registration.parishName);
      if (currentParishId === parishId) return { key: key.name, registration };
    } catch {
      // Ignore malformed records while searching.
    }
  }

  return null;
}

async function findRegistrationByStripeSubscriptionId(env, subscriptionId) {
  if (!env.AGAPAY_REGISTRATIONS || !subscriptionId) return null;
  const list = await env.AGAPAY_REGISTRATIONS.list({ limit: 100 });

  for (const key of list.keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      if (registration.stripeSubscriptionId === subscriptionId) return { key: key.name, registration };
    } catch {
      // Ignore malformed records during lookup.
    }
  }
  return null;
}

async function findCheckoutParish(env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return null;

  const parish = parishFromRegistration(found.registration);
  if (!parish) return null;

  return {
    ...parish,
    stripeAccountId: found.registration.stripeAccountId || ""
  };
}

async function findOrCreateDonorCustomer(env, parish, body) {
  const email = String(body.email || "").trim().toLowerCase();
  const name = donorName(body);
  const stripeAccountId = parish.stripeAccountId || "";

  const customerPath = `/v1/customers?email=${encodeURIComponent(email)}&limit=1`;
  const lookup = stripeAccountId
    ? await stripeGetConnectedRequest(env, customerPath, stripeAccountId)
    : await stripeGetRequest(env, customerPath);

  if (!lookup.ok) return lookup;

  const existing = Array.isArray(lookup.body.data)
    ? lookup.body.data.find((customer) => !customer.deleted)
    : null;
  if (existing?.id) return { ok: true, body: existing };

  const customerForm = new URLSearchParams({
    email,
    name,
    "metadata[agapay_parish_id]": parish.id,
    "metadata[agapay_parish_name]": parish.name || "",
    "metadata[agapay_donor_first_name]": body.firstName || "",
    "metadata[agapay_donor_last_name]": body.lastName || ""
  });

  return stripeFormConnectedRequest(env, "/v1/customers", customerForm, stripeAccountId);
}

async function handleParishes(env) {
  const dynamicParishes = await verifiedRegistrationParishes(env);

  return json({ parishes: dynamicParishes });
}

async function handleRegistrations(request, env) {
  const requiredFields = [
    "communityType",
    "parishName",
    "jurisdiction",
    "city",
    "state",
    "priestFirst",
    "priestEmail",
    "priestPhone",
    "treasurerFirst",
    "treasurerEmail"
  ];

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const missing = requireFields(body, requiredFields);
  if (missing.length) return json({ error: "Missing required fields", fields: missing }, { status: 422 });

  if (!String(body.priestEmail).includes("@") || !String(body.treasurerEmail).includes("@")) {
    return json({ error: "A valid priest and treasurer email are required" }, { status: 422 });
  }

  const reference = `AGP-REG-${Date.now().toString(36).toUpperCase()}`;
  const subscriptionTierId = body.subscriptionTier || defaultSubscriptionTier(body);
  const tier = subscriptionTier(subscriptionTierId) || subscriptionTier(defaultSubscriptionTier(body));
  const registration = {
    reference,
    status: "pending",
    receivedAt: new Date().toISOString(),
    canonicalVerification: "pending_review",
    ...body,
    subscriptionTier: tier?.id || "parish",
    subscriptionStatus: tier?.monthlyCents === 0 ? "free_forever" : "not_started",
    subscriptionMonthlyCents: tier?.monthlyCents ?? null,
    subscriptionTierLabel: tier?.label || ""
  };

  if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(registration));
    const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
    const notice = await sendAdminRegistrationNotice(env, appUrl, registration);
    await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify({
      ...registration,
      adminNotificationEmailStatus: notice.status,
      adminNotificationEmailId: notice.id || "",
      adminNotificationEmailDetail: notice.detail || "",
      adminNotificationEmailSentAt: notice.status === "sent" ? new Date().toISOString() : ""
    }));
  }

  return json(
    {
      ok: true,
      reference,
      mode: env.AGAPAY_REGISTRATIONS ? "stored" : "demo",
      message: "Registration received. AgaPay will review the parish before activation."
    },
    { status: 201 }
  );
}

async function handleCheckout(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const missing = requireFields(body, ["parishId", "giftType", "amount", "firstName", "email"]);
  if (missing.length) return json({ error: "Missing required fields", fields: missing }, { status: 422 });

  const amountCents = centsFromAmount(body.amount);
  if (!amountCents) return json({ error: "Amount must be greater than zero" }, { status: 422 });

  const parish = await findCheckoutParish(env, body.parishId);
  if (!parish || parish.status !== "verified") return json({ error: "Verified parish not found" }, { status: 404 });

  if (!env.STRIPE_SECRET_KEY) {
    return json({
      mode: "demo",
      reference: `AGP-DEMO-${Date.now().toString(36).toUpperCase()}`,
      message: "Stripe is not configured yet. Set STRIPE_SECRET_KEY to create live checkout sessions."
    });
  }

  if (!parish.stripeAccountId) {
    return json(
      { error: "Parish Stripe account is not connected yet", detail: "This parish needs to complete Stripe onboarding before it can receive donations." },
      { status: 422 }
    );
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const totalTransactionFeeCents = Math.round(amountCents * 0.05 + 30);
  const chargeCents = body.coverFees ? amountCents + totalTransactionFeeCents : amountCents;
  const estimatedStripeFeeCents = Math.round(chargeCents * 0.029 + 30);
  const agapayFeeCents = Math.max(0, totalTransactionFeeCents - estimatedStripeFeeCents);
  const recurring = body.frequency && body.frequency !== "once";
  const giftLabel = String(body.giftType).replace(/-/g, " ");
  const customer = await findOrCreateDonorCustomer(env, parish, body);
  if (!customer.ok) {
    return json(
      { error: "Stripe customer setup failed", detail: customer.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  const checkoutMetadata = {
    parish_id: parish.id,
    stripe_customer_id: customer.body.id || "",
    gift_type: body.giftType,
    fund: body.fund || "",
    feast_description: body.feastDescription || "",
    in_memoriam: body.inMemoriam || "",
    campaign: body.campaign || "",
    campaign_description: body.campaignDescription || "",
    frequency: body.frequency || "once",
    names_living: body.namesLiving || "",
    names_departed: body.namesDeparted || ""
  };

  const form = new URLSearchParams({
    mode: recurring ? "subscription" : "payment",
    success_url: `${appUrl}/give/form?parish=${encodeURIComponent(parish.id)}&success=1`,
    cancel_url: `${appUrl}/give/form?parish=${encodeURIComponent(parish.id)}&canceled=1`,
    customer: customer.body.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": `${parish.name} - ${giftLabel}`,
    "line_items[0][price_data][unit_amount]": String(chargeCents)
  });

  for (const [key, value] of Object.entries(checkoutMetadata)) {
    form.set(`metadata[${key}]`, value);
    if (recurring) {
      form.set(`subscription_data[metadata][${key}]`, value);
    } else {
      form.set(`payment_intent_data[metadata][${key}]`, value);
    }
  }

  if (recurring) {
    const applicationFeePercent = (agapayFeeCents / chargeCents) * 100;
    form.set("subscription_data[application_fee_percent]", applicationFeePercent.toFixed(2));
  } else {
    form.set("payment_intent_data[application_fee_amount]", String(agapayFeeCents));
  }

  if (recurring) {
    form.set("line_items[0][price_data][recurring][interval]", body.frequency === "weekly" || body.frequency === "biweekly" ? "week" : "month");
    if (body.frequency === "biweekly") form.set("line_items[0][price_data][recurring][interval_count]", "2");
  }

  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (parish.stripeAccountId) headers["Stripe-Account"] = parish.stripeAccountId;

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers,
    body: form
  });
  const stripeBody = await stripeResponse.json();

  if (!stripeResponse.ok) {
    return json(
      { error: "Stripe checkout session failed", detail: stripeBody.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  return json({ id: stripeBody.id, url: stripeBody.url }, { status: 201 });
}

async function handleAdminRegistrations(request, env) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!env.AGAPAY_REGISTRATIONS) {
    return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });
  }

  const list = await env.AGAPAY_REGISTRATIONS.list({ limit: 100 });
  const registrations = [];

  for (const key of list.keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      registrations.push({
        reference: registration.reference || key.name,
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
      });
    } catch {
      registrations.push({ reference: key.name, status: "unreadable" });
    }
  }

  registrations.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  return json({ registrations, cursor: list.list_complete ? null : list.cursor });
}

async function loadAllRegistrations(env) {
  if (!env.AGAPAY_REGISTRATIONS) return [];

  const list = await env.AGAPAY_REGISTRATIONS.list({ limit: 100 });
  const registrations = [];

  for (const key of list.keys) {
    if (isSystemKvKey(key.name)) continue;
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      registrations.push(JSON.parse(raw));
    } catch {
      registrations.push({ reference: key.name, status: "unreadable" });
    }
  }

  return registrations;
}

async function handleAdminPlatformSummary(request, env) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!env.AGAPAY_REGISTRATIONS) {
    return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });
  }

  const registrations = await loadAllRegistrations(env);
  const now = new Date();
  const year = now.getUTCFullYear();
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: monthLabel(index),
    registered: 0,
    verified: 0,
    ytdDonationsCents: 0,
    giftCount: 0
  }));

  let totalRegistered = 0;
  let totalVerified = 0;
  let connectedStripeAccounts = 0;
  const connected = [];

  for (const registration of registrations) {
    totalRegistered += 1;
    if (registration.status === "verified") totalVerified += 1;
    if (registration.stripeAccountId) {
      connectedStripeAccounts += 1;
      connected.push(registration);
    }

    const received = registration.receivedAt ? new Date(registration.receivedAt) : null;
    if (received && !Number.isNaN(received.getTime()) && received.getUTCFullYear() === year) {
      monthly[received.getUTCMonth()].registered += 1;
      if (registration.status === "verified") monthly[received.getUTCMonth()].verified += 1;
    }
  }

  let donationDataSource = "not_configured";
  let donationError = "";

  if (env.STRIPE_SECRET_KEY && connected.length) {
    donationDataSource = "stripe";
    for (const registration of connected) {
      const result = await listYtdStripeCharges(env, registration.stripeAccountId);
      if (!result.ok) {
        donationDataSource = "partial";
        donationError = result.body?.error?.message || "Stripe giving summary failed for at least one parish.";
        continue;
      }

      const summary = summarizeCharges(result.body.data || []);
      for (const month of summary.monthly) {
        const target = monthly[month.month - 1];
        target.ytdDonationsCents += month.amountCents || 0;
        target.giftCount += month.giftCount || 0;
      }
    }
  } else if (!connected.length) {
    donationDataSource = "not_connected";
  }

  const ytdDonationsCents = monthly.reduce((sum, item) => sum + item.ytdDonationsCents, 0);
  const giftCount = monthly.reduce((sum, item) => sum + item.giftCount, 0);

  return json({
    summary: {
      year,
      generatedAt: now.toISOString(),
      totalRegistered,
      totalVerified,
      connectedStripeAccounts,
      ytdDonationsCents,
      giftCount,
      donationDataSource,
      donationError,
      monthly
    }
  });
}

async function handleAdminPassword(request, env) {
  if (request.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!env.AGAPAY_REGISTRATIONS) {
    return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const newPassword = String(body.newAdminPassword || "").trim();
  const confirmPassword = String(body.confirmAdminPassword || "").trim();
  if (newPassword.length < 12) {
    return json({ error: "Admin password must be at least 12 characters." }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return json({ error: "Admin passwords do not match." }, { status: 400 });
  }
  if (newPassword === env.AGAPAY_ADMIN_TOKEN) {
    return json({ error: "Choose a password different from the Cloudflare root secret." }, { status: 400 });
  }

  await env.AGAPAY_REGISTRATIONS.put(ADMIN_PASSWORD_KV_KEY, newPassword);
  return json({ ok: true, updatedAt: new Date().toISOString() });
}

async function handleAdminRegistrationDetail(request, env, reference) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!env.AGAPAY_REGISTRATIONS) {
    return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });
  }

  if (request.method === "GET") {
    const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
    if (!raw) return json({ error: "Registration not found" }, { status: 404 });
    return json({ registration: JSON.parse(raw) });
  }

  if (request.method === "PATCH") {
    const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
    if (!raw) return json({ error: "Registration not found" }, { status: 404 });

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const current = JSON.parse(raw);
    const nextStatus = body.status || current.status;
    const parishId = nextStatus === "verified"
      ? current.parishId || slugify(current.parishName)
      : current.parishId;
    const requestedDashboardToken = body.parishDashboardToken !== undefined
      ? String(body.parishDashboardToken || "").trim()
      : String(current.parishDashboardToken || "").trim();
    const parishDashboardToken = nextStatus === "verified" && !requestedDashboardToken
      ? generateDashboardToken()
      : requestedDashboardToken;
    const nextSubscriptionTierId = body.subscriptionTier || current.subscriptionTier || defaultSubscriptionTier(current);
    const nextTier = subscriptionTier(nextSubscriptionTierId) || subscriptionTier(defaultSubscriptionTier(current));
    const nextSubscriptionStatus = nextTier?.monthlyCents === 0
      ? "free_forever"
      : body.subscriptionStatus || current.subscriptionStatus || "not_started";
    let updated = {
      ...current,
      status: nextStatus,
      parishId,
      givingStatus: body.givingStatus || current.givingStatus || (nextStatus === "verified" ? "active" : "hidden"),
      stripeAccountStatus: body.stripeAccountStatus || current.stripeAccountStatus || "not_started",
      stripeAccountId: body.stripeAccountId ?? current.stripeAccountId ?? "",
      reviewedBy: body.reviewedBy ?? current.reviewedBy ?? "",
      verificationSource: body.verificationSource ?? current.verificationSource ?? "",
      bishopOrAuthority: body.bishopOrAuthority ?? current.bishopOrAuthority ?? "",
      dioceseOrDeanery: body.dioceseOrDeanery ?? current.dioceseOrDeanery ?? "",
      platformFee: body.platformFee ?? current.platformFee ?? "",
      liturgicalCalendar: body.liturgicalCalendar ?? current.liturgicalCalendar ?? "julian",
      subscriptionTier: nextTier?.id || nextSubscriptionTierId,
      subscriptionTierLabel: nextTier?.label || current.subscriptionTierLabel || "",
      subscriptionMonthlyCents: nextTier?.monthlyCents ?? current.subscriptionMonthlyCents ?? null,
      subscriptionStatus: nextSubscriptionStatus,
      stripeCustomerId: body.stripeCustomerId ?? current.stripeCustomerId ?? "",
      stripeSubscriptionId: body.stripeSubscriptionId ?? current.stripeSubscriptionId ?? "",
      recurringGivingEnabled: Boolean(body.recurringGivingEnabled ?? current.recurringGivingEnabled ?? true),
      candlesEnabled: Boolean(body.candlesEnabled ?? current.candlesEnabled ?? true),
      commemorationsEnabled: Boolean(body.commemorationsEnabled ?? current.commemorationsEnabled ?? true),
      funds: Array.isArray(body.funds) ? body.funds : current.funds,
      campaigns: Array.isArray(body.campaigns) ? body.campaigns : current.campaigns,
      feastCampaigns: Array.isArray(body.feastCampaigns) ? body.feastCampaigns : current.feastCampaigns,
      parishDashboardToken,
      parishDashboardTokenTemporary: Boolean(parishDashboardToken),
      parishDashboardTokenCreatedAt: parishDashboardToken && parishDashboardToken !== current.parishDashboardToken
        ? new Date().toISOString()
        : current.parishDashboardTokenCreatedAt,
      reviewerNotes: body.reviewerNotes ?? current.reviewerNotes ?? "",
      reviewedAt: new Date().toISOString(),
      publicProfileCreatedAt: nextStatus === "verified"
        ? current.publicProfileCreatedAt || new Date().toISOString()
        : current.publicProfileCreatedAt
    };

    let dashboardInvite = null;
    if (body.sendDashboardInvite && nextStatus === "verified") {
      const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
      dashboardInvite = await sendDashboardInvite(env, appUrl, updated);
      updated = {
        ...updated,
        dashboardInviteEmailStatus: dashboardInvite.status,
        dashboardInviteEmailId: dashboardInvite.id || "",
        dashboardInviteEmailDetail: dashboardInvite.detail || "",
        dashboardInviteEmailRecipients: dashboardInvite.recipients || [],
        dashboardInviteEmailSentAt: dashboardInvite.status === "sent"
          ? new Date().toISOString()
          : updated.dashboardInviteEmailSentAt
      };
    }

    await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(updated));
    return json({ ok: true, registration: updated, dashboardInvite });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

async function createSubscriptionCheckoutForRegistration(request, env, reference, registration, body = {}, returnPath = "/admin") {
  const tierId = body.subscriptionTier || registration.subscriptionTier || defaultSubscriptionTier(registration);
  const tier = subscriptionTier(tierId);
  if (!tier) return json({ error: "Unknown subscription tier" }, { status: 422 });

  if (tier.monthlyCents === 0) {
    const updated = {
      ...registration,
      subscriptionTier: tier.id,
      subscriptionTierLabel: tier.label,
      subscriptionMonthlyCents: 0,
      subscriptionStatus: "free_forever",
      subscriptionUpdatedAt: new Date().toISOString()
    };
    await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(updated));
    return json({ ok: true, subscription: updated.subscriptionStatus, registration: updated });
  }

  if (tier.monthlyCents === null && !env[tier.stripePriceEnv]) {
    return json({ error: "This tier needs a Stripe Price ID or a custom billing setup before checkout can be created" }, { status: 422 });
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  let stripeCustomerId = registration.stripeCustomerId || "";
  if (!stripeCustomerId) {
    const customerForm = new URLSearchParams({
      email: registration.treasurerEmail || registration.priestEmail || "",
      name: registration.parishName || "AgaPay parish",
      "metadata[agapay_reference]": reference,
      "metadata[agapay_parish_id]": registration.parishId || slugify(registration.parishName),
      "metadata[agapay_subscription_tier]": tier.id
    });
    const customer = await stripeFormRequest(env, "/v1/customers", customerForm);
    if (!customer.ok) {
      return json(
        { error: "Stripe customer creation failed", detail: customer.body.error?.message || "Unknown Stripe error" },
        { status: 502 }
      );
    }
    stripeCustomerId = customer.body.id;
  }

  const returnSeparator = returnPath.includes("?") ? "&" : "?";
  const checkoutForm = new URLSearchParams({
    mode: "subscription",
    customer: stripeCustomerId,
    success_url: `${appUrl}${returnPath}${returnSeparator}subscription_return=${encodeURIComponent(reference)}`,
    cancel_url: `${appUrl}${returnPath}${returnSeparator}subscription_cancel=${encodeURIComponent(reference)}`,
    client_reference_id: reference,
    "metadata[agapay_reference]": reference,
    "metadata[agapay_parish_id]": registration.parishId || slugify(registration.parishName),
    "metadata[agapay_subscription_tier]": tier.id,
    "subscription_data[metadata][agapay_reference]": reference,
    "subscription_data[metadata][agapay_parish_id]": registration.parishId || slugify(registration.parishName),
    "subscription_data[metadata][agapay_subscription_tier]": tier.id,
    "line_items[0][quantity]": "1"
  });

  const configuredPriceId = tier.stripePriceEnv ? env[tier.stripePriceEnv] : "";
  if (configuredPriceId) {
    checkoutForm.set("line_items[0][price]", configuredPriceId);
  } else {
    checkoutForm.set("line_items[0][price_data][currency]", "usd");
    checkoutForm.set("line_items[0][price_data][unit_amount]", String(tier.monthlyCents));
    checkoutForm.set("line_items[0][price_data][recurring][interval]", "month");
    checkoutForm.set("line_items[0][price_data][product_data][name]", `AgaPay ${tier.label} Subscription`);
    checkoutForm.set("line_items[0][price_data][product_data][description]", tier.description);
  }

  const session = await stripeFormRequest(env, "/v1/checkout/sessions", checkoutForm);
  if (!session.ok) {
    return json(
      { error: "Stripe subscription checkout failed", detail: session.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  const updated = {
    ...registration,
    subscriptionTier: tier.id,
    subscriptionTierLabel: tier.label,
    subscriptionMonthlyCents: tier.monthlyCents,
    subscriptionStatus: "checkout_created",
    stripeCustomerId,
    stripeSubscriptionCheckoutSessionId: session.body.id || "",
    stripeSubscriptionCheckoutCreatedAt: new Date().toISOString()
  };
  await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(updated));

  return json({ ok: true, checkoutUrl: session.body.url, registration: updated }, { status: 201 });
}

async function handleSubscriptionCheckout(request, env, reference) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!env.AGAPAY_REGISTRATIONS) {
    return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });
  }

  const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
  if (!raw) return json({ error: "Registration not found" }, { status: 404 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  return createSubscriptionCheckoutForRegistration(request, env, reference, JSON.parse(raw), body, "/admin");
}

function parseStripeSignature(header) {
  const values = {};
  for (const part of String(header || "").split(",")) {
    const [key, value] = part.split("=");
    if (key && value) values[key.trim()] = value.trim();
  }
  return values;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureCompare(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

async function verifyStripeWebhook(payload, signatureHeader, secret) {
  if (!secret) return false;
  const signature = parseStripeSignature(signatureHeader);
  if (!signature.t || !signature.v1) return false;

  const timestamp = Number(signature.t);
  if (!Number.isFinite(timestamp)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedPayload = `${signature.t}.${payload}`;
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  return secureCompare(toHex(digest), signature.v1);
}

function subscriptionStatusFromStripe(status) {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "cancelled";
  return status || "not_started";
}

async function updateSubscriptionRecord(env, reference, updates) {
  if (!env.AGAPAY_REGISTRATIONS || !reference) return null;
  const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
  if (!raw) return null;
  const current = JSON.parse(raw);
  const updated = {
    ...current,
    ...updates,
    subscriptionUpdatedAt: new Date().toISOString()
  };
  await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(updated));
  return updated;
}

async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return json({ error: "STRIPE_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }

  const payload = await request.text();
  const verified = await verifyStripeWebhook(payload, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET);
  if (!verified) return json({ error: "Invalid Stripe signature" }, { status: 400 });

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  const object = event.data?.object || {};
  if (event.type === "checkout.session.completed") {
    await storeCommemorationEntry(env, object.id, object.metadata || {}, {
      amountCents: object.amount_total || object.amount_subtotal || 0,
      donorEmail: object.customer_details?.email || object.customer_email || "",
      donorName: object.customer_details?.name || "",
      createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
    });
  }

  if (event.type === "invoice.payment_succeeded") {
    const metadata = object.subscription_details?.metadata || object.lines?.data?.[0]?.metadata || object.metadata || {};
    await storeCommemorationEntry(env, object.id, metadata, {
      amountCents: object.amount_paid || 0,
      donorEmail: object.customer_email || object.customer_details?.email || "",
      donorName: object.customer_name || "",
      createdAt: object.created ? new Date(object.created * 1000).toISOString() : new Date().toISOString()
    });
  }

  if (event.type === "checkout.session.completed" && object.mode === "subscription") {
    const reference = object.metadata?.agapay_reference || object.client_reference_id || "";
    await updateSubscriptionRecord(env, reference, {
      subscriptionStatus: "active",
      stripeCustomerId: object.customer || "",
      stripeSubscriptionId: object.subscription || "",
      stripeSubscriptionCheckoutSessionId: object.id || "",
      subscriptionActivatedAt: new Date().toISOString()
    });
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const reference = object.metadata?.agapay_reference || "";
    const status = event.type === "customer.subscription.deleted"
      ? "cancelled"
      : subscriptionStatusFromStripe(object.status);
    if (reference) {
      await updateSubscriptionRecord(env, reference, {
        subscriptionStatus: status,
        stripeSubscriptionId: object.id || "",
        stripeCustomerId: object.customer || ""
      });
    } else {
      const found = await findRegistrationByStripeSubscriptionId(env, object.id);
      if (found) {
        await updateSubscriptionRecord(env, found.key, {
          subscriptionStatus: status,
          stripeSubscriptionId: object.id || "",
          stripeCustomerId: object.customer || ""
        });
      }
    }
  }

  if (event.type === "invoice.payment_failed") {
    const subscriptionId = object.subscription || "";
    const found = await findRegistrationByStripeSubscriptionId(env, subscriptionId);
    if (found) {
      await updateSubscriptionRecord(env, found.key, {
        subscriptionStatus: "past_due",
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: object.customer || found.registration.stripeCustomerId || ""
      });
    }
  }

  return json({ received: true });
}

async function createStripeOnboardingSession(request, env, reference, registration, returnPath = "/admin") {
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  let stripeAccountId = registration.stripeAccountId || "";
  let stripeAccount = null;

  if (!stripeAccountId) {
    const accountForm = new URLSearchParams({
      type: "standard",
      country: "US",
      email: registration.treasurerEmail || registration.priestEmail || "",
      business_type: "non_profit",
      "business_profile[name]": registration.parishName || "AgaPay Parish",
      "business_profile[product_description]": "Online tithes, stewardship, and charitable donations for an Orthodox Christian parish.",
      "capabilities[card_payments][requested]": "true",
      "capabilities[transfers][requested]": "true",
      "metadata[agapay_reference]": reference,
      "metadata[agapay_parish_id]": registration.parishId || slugify(registration.parishName)
    });
    const website = absoluteWebsiteUrl(registration.website);
    if (website) accountForm.set("business_profile[url]", website);

    const created = await stripeFormRequest(env, "/v1/accounts", accountForm);
    if (!created.ok) {
      return json(
        { error: "Stripe connected account creation failed", detail: created.body.error?.message || "Unknown Stripe error" },
        { status: 502 }
      );
    }

    stripeAccount = created.body;
    stripeAccountId = stripeAccount.id;
  } else {
    const retrieved = await stripeGetRequest(env, `/v1/accounts/${encodeURIComponent(stripeAccountId)}`);
    if (!retrieved.ok) {
      return json(
        { error: "Stripe connected account lookup failed", detail: retrieved.body.error?.message || "Unknown Stripe error" },
        { status: 502 }
      );
    }
    stripeAccount = retrieved.body;
  }

  const returnSeparator = returnPath.includes("?") ? "&" : "?";
  const linkForm = new URLSearchParams({
    account: stripeAccountId,
    refresh_url: `${appUrl}${returnPath}${returnSeparator}stripe_refresh=${encodeURIComponent(reference)}`,
    return_url: `${appUrl}${returnPath}${returnSeparator}stripe_return=${encodeURIComponent(reference)}`,
    type: "account_onboarding"
  });
  const link = await stripeFormRequest(env, "/v1/account_links", linkForm);
  if (!link.ok) {
    return json(
      { error: "Stripe onboarding link failed", detail: link.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  const updated = {
    ...registration,
    parishDashboardToken: registration.parishDashboardToken || crypto.randomUUID(),
    stripeAccountId,
    stripeAccountStatus: stripeAccountStatus(stripeAccount),
    stripeChargesEnabled: Boolean(stripeAccount.charges_enabled),
    stripePayoutsEnabled: Boolean(stripeAccount.payouts_enabled),
    stripeDetailsSubmitted: Boolean(stripeAccount.details_submitted),
    stripeDisabledReason: stripeAccount.requirements?.disabled_reason || "",
    stripeRequirementsDue: stripeAccount.requirements?.currently_due || [],
    stripeOnboardingLinkCreatedAt: new Date().toISOString(),
    reviewedAt: registration.reviewedAt || new Date().toISOString()
  };
  await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(updated));

  return { onboardingUrl: link.body.url, registration: updated };
}

async function handleStripeOnboarding(request, env, reference) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!env.AGAPAY_REGISTRATIONS) {
    return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });
  }

  const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
  if (!raw) return json({ error: "Registration not found" }, { status: 404 });

  const registration = JSON.parse(raw);
  if (registration.status !== "verified") {
    return json({ error: "Verify the parish before starting Stripe onboarding" }, { status: 422 });
  }

  const result = await createStripeOnboardingSession(request, env, reference, registration);
  if (result instanceof Response) return result;

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const email = await sendTreasurerStripeInvite(env, appUrl, result.registration);
  const updated = {
    ...result.registration,
    stripeOnboardingEmailStatus: email.status,
    stripeOnboardingEmailId: email.id || "",
    stripeOnboardingEmailDetail: email.detail || "",
    stripeOnboardingEmailSentAt: email.status === "sent" ? new Date().toISOString() : result.registration.stripeOnboardingEmailSentAt
  };
  await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(updated));

  return json({ ok: true, onboardingUrl: result.onboardingUrl, email, registration: updated });
}

async function handleStripeRefresh(request, env, reference) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!env.AGAPAY_REGISTRATIONS) {
    return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });
  }

  const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
  if (!raw) return json({ error: "Registration not found" }, { status: 404 });

  const registration = JSON.parse(raw);
  if (!registration.stripeAccountId) {
    return json({ error: "This registration does not have a Stripe connected account yet" }, { status: 422 });
  }

  const retrieved = await stripeGetRequest(env, `/v1/accounts/${encodeURIComponent(registration.stripeAccountId)}`);
  if (!retrieved.ok) {
    return json(
      { error: "Stripe connected account lookup failed", detail: retrieved.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  const account = retrieved.body;
  const updated = {
    ...registration,
    stripeAccountStatus: stripeAccountStatus(account),
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
    stripeDisabledReason: account.requirements?.disabled_reason || "",
    stripeRequirementsDue: account.requirements?.currently_due || [],
    stripeStatusCheckedAt: new Date().toISOString()
  };
  await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(updated));

  return json({ ok: true, registration: updated });
}

async function handleDashboardInvite(request, env, reference) {
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!env.AGAPAY_REGISTRATIONS) {
    return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });
  }

  const raw = await env.AGAPAY_REGISTRATIONS.get(reference);
  if (!raw) return json({ error: "Registration not found" }, { status: 404 });

  const registration = JSON.parse(raw);
  if (registration.status !== "verified") {
    return json({ error: "Verify the parish before sending a dashboard invite" }, { status: 422 });
  }

  const parishDashboardToken = registration.parishDashboardToken || generateDashboardToken();
  const withToken = {
    ...registration,
    parishId: registration.parishId || slugify(registration.parishName),
    parishDashboardToken,
    parishDashboardTokenTemporary: true,
    parishDashboardTokenCreatedAt: registration.parishDashboardTokenCreatedAt || new Date().toISOString()
  };

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const email = await sendDashboardInvite(env, appUrl, withToken);
  const updated = {
    ...withToken,
    dashboardInviteEmailStatus: email.status,
    dashboardInviteEmailId: email.id || "",
    dashboardInviteEmailDetail: email.detail || "",
    dashboardInviteEmailRecipients: email.recipients || [],
    dashboardInviteEmailSentAt: email.status === "sent" ? new Date().toISOString() : withToken.dashboardInviteEmailSentAt
  };
  await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(updated));

  return json({ ok: true, email, registration: updated });
}

async function handleParishStripeOnboarding(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!env.AGAPAY_REGISTRATIONS) {
    return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });
  }

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!found.registration.parishDashboardToken || token !== found.registration.parishDashboardToken) {
    return unauthorized();
  }
  if (found.registration.status !== "verified") {
    return json({ error: "This parish is not verified for giving yet" }, { status: 422 });
  }

  const result = await createStripeOnboardingSession(
    request,
    env,
    found.key,
    found.registration,
    `/parish/dashboard?parish=${encodeURIComponent(parishId)}`
  );
  if (result instanceof Response) return result;

  return json({ ok: true, onboardingUrl: result.onboardingUrl, parish: result.registration });
}

async function handleParishSubscriptionCheckout(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!env.AGAPAY_REGISTRATIONS) {
    return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });
  }

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!found.registration.parishDashboardToken || token !== found.registration.parishDashboardToken) {
    return unauthorized();
  }
  if (found.registration.status !== "verified") {
    return json({ error: "This parish is not verified for billing setup yet" }, { status: 422 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  return createSubscriptionCheckoutForRegistration(
    request,
    env,
    found.key,
    found.registration,
    body,
    `/parish/dashboard?parish=${encodeURIComponent(parishId)}`
  );
}

async function handleParishCommemorations(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!found.registration.parishDashboardToken || token !== found.registration.parishDashboardToken) {
    return unauthorized();
  }

  const { start, end } = weekWindow();
  const entries = await loadCommemorationEntries(env, parishId, start, end);
  return json({
    week: {
      start: start.toISOString(),
      end: end.toISOString()
    },
    entries
  });
}

async function listYtdStripeCharges(env, stripeAccountId) {
  const charges = [];
  let startingAfter = "";
  let pages = 0;

  do {
    const params = new URLSearchParams({
      limit: "100",
      "created[gte]": String(startOfYearUnix())
    });
    if (startingAfter) params.set("starting_after", startingAfter);

    const result = await stripeGetConnectedRequest(env, `/v1/charges?${params.toString()}`, stripeAccountId);
    if (!result.ok) return result;

    const data = Array.isArray(result.body.data) ? result.body.data : [];
    charges.push(...data);
    startingAfter = data.length ? data[data.length - 1].id : "";
    pages += 1;

    if (!result.body.has_more || !startingAfter || pages >= 5) break;
  } while (true);

  return { ok: true, body: { data: charges } };
}

function summarizeCharges(charges) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: monthLabel(index),
    amountCents: 0,
    giftCount: 0
  }));
  const givers = new Set();
  let ytdCents = 0;
  let giftCount = 0;
  let lastGiftAt = "";

  for (const charge of charges) {
    if (charge.status !== "succeeded" || charge.paid === false) continue;

    const created = new Date((charge.created || 0) * 1000);
    if (created.getUTCFullYear() !== year) continue;

    const netCents = Math.max(0, Number(charge.amount_captured || charge.amount || 0) - Number(charge.amount_refunded || 0));
    if (!netCents) continue;

    const monthIndex = created.getUTCMonth();
    monthly[monthIndex].amountCents += netCents;
    monthly[monthIndex].giftCount += 1;
    ytdCents += netCents;
    giftCount += 1;

    const giverKey = charge.billing_details?.email || charge.receipt_email || charge.customer || charge.payment_method || charge.id;
    if (giverKey) givers.add(String(giverKey).toLowerCase());
    if (!lastGiftAt || created.toISOString() > lastGiftAt) lastGiftAt = created.toISOString();
  }

  return {
    year,
    currency: "usd",
    ytdCents,
    giftCount,
    giverCount: givers.size,
    averageGiftCents: giftCount ? Math.round(ytdCents / giftCount) : 0,
    lastGiftAt,
    monthly
  };
}

async function handleParishGivingSummary(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  if (!env.AGAPAY_REGISTRATIONS) {
    return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });
  }

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!found.registration.parishDashboardToken || token !== found.registration.parishDashboardToken) {
    return unauthorized();
  }

  const emptySummary = {
    ...summarizeCharges([]),
    generatedAt: new Date().toISOString()
  };

  if (!found.registration.stripeAccountId) {
    return json({
      summary: {
        ...emptySummary,
        dataSource: "not_connected",
        note: "Stripe is not connected yet."
      }
    });
  }

  const result = await listYtdStripeCharges(env, found.registration.stripeAccountId);
  if (!result.ok) {
    return json(
      { error: "Stripe giving summary failed", detail: result.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  return json({
    summary: {
      ...summarizeCharges(result.body.data || []),
      dataSource: "stripe",
      generatedAt: new Date().toISOString(),
      note: result.body.data?.length >= 500 ? "Showing the first 500 Stripe charges for this year." : ""
    }
  });
}

async function handleParishDashboard(request, env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!found.registration.parishDashboardToken || token !== found.registration.parishDashboardToken) {
    return unauthorized();
  }

  if (request.method === "GET") {
    const { registration } = found;
    return json({
      parish: {
        parishId,
        parishName: registration.parishName,
        communityType: registration.communityType,
        jurisdiction: registration.jurisdiction,
        city: registration.city,
        state: registration.state,
        website: registration.website,
        liturgicalCalendar: registration.liturgicalCalendar || "julian",
        givingStatus: registration.givingStatus || "active",
        stripeAccountStatus: registration.stripeAccountStatus || "not_started",
        subscriptionTier: registration.subscriptionTier || defaultSubscriptionTier(registration),
        subscriptionTierLabel: registration.subscriptionTierLabel || subscriptionTier(registration.subscriptionTier || defaultSubscriptionTier(registration))?.label || "",
        subscriptionStatus: registration.subscriptionStatus || "not_started",
        subscriptionMonthlyCents: registration.subscriptionMonthlyCents ?? subscriptionTier(registration.subscriptionTier || defaultSubscriptionTier(registration))?.monthlyCents ?? null,
        parishDashboardTokenTemporary: Boolean(registration.parishDashboardTokenTemporary),
        priestEmail: registration.priestEmail || "",
        treasurerEmail: registration.treasurerEmail || "",
        setup: {
          contactInfoVerified: true,
          stripeConnected: stripeReady(registration),
          billingActive: subscriptionReady(registration),
          temporaryPassword: Boolean(registration.parishDashboardTokenTemporary)
        },
        subscriptionTiers: publicSubscriptionTiers(),
        platformFee: registration.platformFee || "",
        recurringGivingEnabled: registration.recurringGivingEnabled ?? true,
        candlesEnabled: registration.candlesEnabled ?? true,
        commemorationsEnabled: registration.commemorationsEnabled ?? true,
        funds: Array.isArray(registration.funds) ? registration.funds : [],
        campaigns: Array.isArray(registration.campaigns) ? registration.campaigns : [],
        feastCampaigns: Array.isArray(registration.feastCampaigns) ? registration.feastCampaigns : []
      }
    });
  }

  if (request.method === "PATCH") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const current = found.registration;
    const requestedPassword = body.newDashboardPassword !== undefined
      ? String(body.newDashboardPassword || "").trim()
      : "";
    if (requestedPassword && requestedPassword.length < 8) {
      return json({ error: "Dashboard password must be at least 8 characters." }, { status: 400 });
    }

    const updated = {
      ...current,
      website: body.website ?? current.website ?? "",
      liturgicalCalendar: body.liturgicalCalendar || current.liturgicalCalendar || "julian",
      givingStatus: body.givingStatus || current.givingStatus || "active",
      recurringGivingEnabled: Boolean(body.recurringGivingEnabled ?? current.recurringGivingEnabled ?? true),
      candlesEnabled: Boolean(body.candlesEnabled ?? current.candlesEnabled ?? true),
      commemorationsEnabled: Boolean(body.commemorationsEnabled ?? current.commemorationsEnabled ?? true),
      funds: Array.isArray(body.funds) ? body.funds : current.funds,
      campaigns: Array.isArray(body.campaigns) ? body.campaigns : current.campaigns,
      feastCampaigns: Array.isArray(body.feastCampaigns) ? body.feastCampaigns : current.feastCampaigns,
      parishDashboardToken: requestedPassword || current.parishDashboardToken,
      parishDashboardTokenTemporary: requestedPassword ? false : current.parishDashboardTokenTemporary,
      parishDashboardTokenUpdatedAt: requestedPassword ? new Date().toISOString() : current.parishDashboardTokenUpdatedAt,
      parishUpdatedAt: new Date().toISOString()
    };

    await env.AGAPAY_REGISTRATIONS.put(found.key, JSON.stringify(updated));
    return json({ ok: true, parish: updated });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

function cleanAssetRequest(request) {
  const url = new URL(request.url);
  if (url.pathname === "/") return request;
  if (url.pathname === "/admin") {
    url.pathname = "/admin.html";
    return new Request(url, request);
  }
  if (url.pathname === "/parish/dashboard") {
    url.pathname = "/parish/dashboard.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give/form") {
    url.pathname = "/give/form.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give/find_parish") {
    url.pathname = "/give/form.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give/parish-list") {
    url.pathname = "/give/form.html";
    return new Request(url, request);
  }
  if (url.pathname === "/give/st-seraphim-mission") {
    url.pathname = "/give/form.html";
    return new Request(url, request);
  }
  if (url.pathname.startsWith("/give/")) {
    url.pathname = "/give/form.html";
    return new Request(url, request);
  }
  if (!url.pathname.includes(".")) {
    url.pathname = `${url.pathname}.html`;
    return new Request(url, request);
  }
  return request;
}

function formatCommemorationNames(entries, field) {
  const names = entries.flatMap((entry) => Array.isArray(entry[field]) ? entry[field] : []);
  if (!names.length) return "<p style=\"margin:0;color:#6F6A60;\">No names submitted.</p>";
  return `<ul style="margin:0 0 0 18px;padding:0;color:#171715;line-height:1.7;">${names.map((name) => `<li>${htmlEscape(name)}</li>`).join("")}</ul>`;
}

async function sendWeeklyCommemorationEmails(env, scheduledTime) {
  const registrations = await loadAllRegistrations(env);
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  const { start, end } = weekWindow(new Date(scheduledTime || Date.now()));

  const results = [];
  for (const registration of registrations) {
    if (registration.status !== "verified" || !registration.parishId || !registration.priestEmail) continue;
    const entries = await loadCommemorationEntries(env, registration.parishId, start, end);
    const email = await sendEmail(env, {
      from: env.AGAPAY_FROM_EMAIL || "AgaPay <onboarding@agapay.app>",
      to: [registration.priestEmail],
      reply_to: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
      subject: `Weekly AgaPay commemorations for ${registration.parishName || "your parish"}`,
      html: agapayEmailHtml(appUrl, "Weekly Commemoration List", `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Glory to Jesus Christ!</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#171715;">Here is this week's AgaPay commemoration list for <strong>${htmlEscape(registration.parishName || "your parish")}</strong>.</p>
        <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Living</p>
          ${formatCommemorationNames(entries, "living")}
        </div>
        <div style="background:#F6F1E8;border:1px solid rgba(166,159,145,0.34);border-radius:12px;padding:18px 18px;margin:0 0 20px;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6F6A60;font-weight:700;">Departed</p>
          ${formatCommemorationNames(entries, "departed")}
        </div>
        <p style="margin:0;font-size:13px;line-height:1.7;color:#6F6A60;">This message is sent every Saturday morning, even when no names were submitted.</p>
      `),
      text: `Weekly AgaPay commemorations for ${registration.parishName || "your parish"}\n\nLiving:\n${entries.flatMap((entry) => entry.living || []).join("\n") || "No names submitted."}\n\nDeparted:\n${entries.flatMap((entry) => entry.departed || []).join("\n") || "No names submitted."}`
    });
    results.push({ parishId: registration.parishId, status: email.status });
  }

  return results;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendWeeklyCommemorationEmails(env, event.scheduledTime));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/stripe/webhook") {
      return handleStripeWebhook(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/parishes") return handleParishes(env);
    if (request.method === "GET" && url.pathname === "/api/subscription-tiers") {
      return json({ tiers: publicSubscriptionTiers() });
    }
    if (request.method === "POST" && url.pathname === "/api/registrations") return handleRegistrations(request, env);
    if (request.method === "GET" && url.pathname === "/api/admin/registrations") {
      return handleAdminRegistrations(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/platform-summary") {
      return handleAdminPlatformSummary(request, env);
    }
    if (url.pathname === "/api/admin/password") {
      return handleAdminPassword(request, env);
    }
    if (url.pathname.startsWith("/api/admin/registrations/") && url.pathname.endsWith("/subscription-checkout")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", "").replace("/subscription-checkout", ""));
      return handleSubscriptionCheckout(request, env, reference);
    }
    if (url.pathname.startsWith("/api/admin/registrations/") && url.pathname.endsWith("/stripe-onboarding")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", "").replace("/stripe-onboarding", ""));
      return handleStripeOnboarding(request, env, reference);
    }
    if (url.pathname.startsWith("/api/admin/registrations/") && url.pathname.endsWith("/stripe-refresh")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", "").replace("/stripe-refresh", ""));
      return handleStripeRefresh(request, env, reference);
    }
    if (url.pathname.startsWith("/api/admin/registrations/") && url.pathname.endsWith("/dashboard-invite")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", "").replace("/dashboard-invite", ""));
      return handleDashboardInvite(request, env, reference);
    }
    if (url.pathname.startsWith("/api/admin/registrations/")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", ""));
      return handleAdminRegistrationDetail(request, env, reference);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/stripe-onboarding")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/stripe-onboarding", ""));
      return handleParishStripeOnboarding(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/subscription-checkout")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/subscription-checkout", ""));
      return handleParishSubscriptionCheckout(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/commemorations")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/commemorations", ""));
      return handleParishCommemorations(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.endsWith("/giving-summary")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").replace("/giving-summary", ""));
      return handleParishGivingSummary(request, env, parishId);
    }
    if (url.pathname.startsWith("/api/parish/dashboard/")) {
      const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", ""));
      return handleParishDashboard(request, env, parishId);
    }
    if (request.method === "POST" && url.pathname === "/api/create-checkout-session") {
      return handleCheckout(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found" }, { status: 404 });
    }

    return env.ASSETS.fetch(cleanAssetRequest(request));
  }
};
