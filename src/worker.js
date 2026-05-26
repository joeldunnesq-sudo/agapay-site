const parishes = [
  {
    id: "holy-theotokos-skete",
    name: "Holy Theotokos Skete",
    type: "monastery",
    jurisdiction: "rocor",
    jurisdictionLabel: "ROCOR",
    city: "Nahant",
    state: "MA",
    status: "verified",
    freeForever: true,
    stripeAccountId: "",
    funds: [
      {
        id: "general",
        name: "General Monastery Support",
        description: "Daily life, hospitality, supplies, and monastery needs."
      }
    ]
  },
  {
    id: "st-nicholas-parish",
    name: "St. Nicholas Orthodox Church",
    type: "parish",
    jurisdiction: "antiochian",
    jurisdictionLabel: "Antiochian",
    city: "Dallas",
    state: "TX",
    status: "verified",
    stripeAccountId: "",
    funds: [
      {
        id: "general",
        name: "General Operating Fund",
        description: "Utilities, supplies, ministries, and day-to-day parish needs."
      }
    ]
  },
  {
    id: "annunciation-cathedral",
    name: "Annunciation Cathedral",
    type: "parish",
    jurisdiction: "goa",
    jurisdictionLabel: "GOA",
    city: "Atlanta",
    state: "GA",
    status: "verified",
    stripeAccountId: "",
    funds: [
      {
        id: "general",
        name: "General Operating Fund",
        description: "Utilities, supplies, ministries, and day-to-day parish needs."
      }
    ]
  },
  {
    id: "st-seraphim-mission",
    name: "St. Seraphim of Sarov Mission",
    type: "mission",
    jurisdiction: "rocor",
    jurisdictionLabel: "ROCOR",
    city: "Lubbock",
    state: "TX",
    status: "verified",
    stripeAccountId: "",
    funds: [
      {
        id: "building",
        name: "Building & Renovation Fund",
        description: "Toward the purchase or improvement of parish property."
      },
      {
        id: "iconostasis",
        name: "Iconostasis Fund",
        description: "Icons, altar screens, and the beautification of the nave."
      },
      {
        id: "clergy",
        name: "Clergy Support Fund",
        description: "Direct support for the priest and his family."
      },
      {
        id: "education",
        name: "Parish School & Education",
        description: "Catechism materials, youth programs, and seminary support."
      },
      {
        id: "general",
        name: "General Operating Fund",
        description: "Utilities, supplies, and day-to-day parish needs."
      }
    ]
  },
  {
    id: "st-john-the-theologian",
    name: "St. John the Theologian Mission",
    type: "mission",
    jurisdiction: "oca",
    jurisdictionLabel: "OCA",
    city: "Memphis",
    state: "TN",
    status: "verified",
    stripeAccountId: "",
    funds: [
      {
        id: "general",
        name: "General Operating Fund",
        description: "Utilities, supplies, ministries, and day-to-day parish needs."
      }
    ]
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

function requireAdmin(request, env) {
  if (!env.AGAPAY_ADMIN_TOKEN) return false;
  return getAdminToken(request) === env.AGAPAY_ADMIN_TOKEN;
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

function stripeAccountStatus(account) {
  if (account.payouts_enabled) return "payouts_enabled";
  if (account.charges_enabled) return "charges_enabled";
  if (account.requirements?.disabled_reason) return "restricted";
  if (account.details_submitted) return "onboarding";
  return "invited";
}

function absoluteWebsiteUrl(value) {
  const website = String(value || "").trim();
  if (!website) return "";
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website}`;
}

function publicParishes() {
  return parishes.map(({ stripeAccountId, ...parish }) => parish);
}

function findParish(id) {
  return parishes.find((parish) => parish.id === id);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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
    jurisdiction: slugify(registration.jurisdiction || "other"),
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

async function findCheckoutParish(env, parishId) {
  const staticParish = findParish(parishId);
  if (staticParish) return staticParish;

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return null;

  const parish = parishFromRegistration(found.registration);
  if (!parish) return null;

  return {
    ...parish,
    stripeAccountId: found.registration.stripeAccountId || ""
  };
}

async function handleParishes(env) {
  const staticParishes = publicParishes();
  const dynamicParishes = await verifiedRegistrationParishes(env);
  const seen = new Set(staticParishes.map((parish) => parish.id));
  const merged = [
    ...staticParishes,
    ...dynamicParishes.filter((parish) => !seen.has(parish.id))
  ];

  return json({ parishes: merged });
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
  const registration = {
    reference,
    status: "pending",
    receivedAt: new Date().toISOString(),
    canonicalVerification: "pending_review",
    ...body
  };

  if (env.AGAPAY_REGISTRATIONS) {
    await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(registration));
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

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const feeCents = body.coverFees ? Math.round(amountCents * 0.029 + 30) : 0;
  const chargeCents = amountCents + feeCents;
  const recurring = body.frequency && body.frequency !== "once";
  const giftLabel = String(body.giftType).replace(/-/g, " ");

  const form = new URLSearchParams({
    mode: recurring ? "subscription" : "payment",
    success_url: `${appUrl}/give/form?parish=${encodeURIComponent(parish.id)}&success=1`,
    cancel_url: `${appUrl}/give/form?parish=${encodeURIComponent(parish.id)}&canceled=1`,
    customer_email: body.email,
    "metadata[parish_id]": parish.id,
    "metadata[gift_type]": body.giftType,
    "metadata[fund]": body.fund || "",
    "metadata[feast_description]": body.feastDescription || "",
    "metadata[in_memoriam]": body.inMemoriam || "",
    "metadata[campaign]": body.campaign || "",
    "metadata[campaign_description]": body.campaignDescription || "",
    "metadata[frequency]": body.frequency || "once",
    "metadata[names_living]": body.namesLiving || "",
    "metadata[names_departed]": body.namesDeparted || "",
    "payment_intent_data[metadata][parish_id]": parish.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": `${parish.name} - ${giftLabel}`,
    "line_items[0][price_data][unit_amount]": String(chargeCents)
  });

  if (recurring) {
    form.set("line_items[0][price_data][recurring][interval]", body.frequency === "weekly" ? "week" : "month");
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
  if (!requireAdmin(request, env)) return unauthorized();
  if (!env.AGAPAY_REGISTRATIONS) {
    return json({ error: "AGAPAY_REGISTRATIONS KV binding is not configured" }, { status: 500 });
  }

  const list = await env.AGAPAY_REGISTRATIONS.list({ limit: 100 });
  const registrations = [];

  for (const key of list.keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const registration = JSON.parse(raw);
      registrations.push({
        reference: registration.reference || key.name,
        status: registration.status || "pending",
        parishName: registration.parishName || "",
        communityType: registration.communityType || "",
        jurisdiction: registration.jurisdiction || "",
        city: registration.city || "",
        state: registration.state || "",
        priestEmail: registration.priestEmail || "",
        treasurerEmail: registration.treasurerEmail || "",
        receivedAt: registration.receivedAt || ""
      });
    } catch {
      registrations.push({ reference: key.name, status: "unreadable" });
    }
  }

  registrations.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  return json({ registrations, cursor: list.list_complete ? null : list.cursor });
}

async function handleAdminRegistrationDetail(request, env, reference) {
  if (!requireAdmin(request, env)) return unauthorized();
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
    const updated = {
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
      recurringGivingEnabled: Boolean(body.recurringGivingEnabled ?? current.recurringGivingEnabled ?? true),
      candlesEnabled: Boolean(body.candlesEnabled ?? current.candlesEnabled ?? true),
      commemorationsEnabled: Boolean(body.commemorationsEnabled ?? current.commemorationsEnabled ?? true),
      funds: Array.isArray(body.funds) ? body.funds : current.funds,
      campaigns: Array.isArray(body.campaigns) ? body.campaigns : current.campaigns,
      parishDashboardToken: body.parishDashboardToken ?? current.parishDashboardToken ?? "",
      reviewerNotes: body.reviewerNotes ?? current.reviewerNotes ?? "",
      reviewedAt: new Date().toISOString(),
      publicProfileCreatedAt: nextStatus === "verified"
        ? current.publicProfileCreatedAt || new Date().toISOString()
        : current.publicProfileCreatedAt
    };

    await env.AGAPAY_REGISTRATIONS.put(reference, JSON.stringify(updated));
    return json({ ok: true, registration: updated });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

async function handleStripeOnboarding(request, env, reference) {
  if (!requireAdmin(request, env)) return unauthorized();
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

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  let stripeAccountId = registration.stripeAccountId || "";
  let stripeAccount = null;

  if (!stripeAccountId) {
    const accountForm = new URLSearchParams({
      type: "express",
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

  const linkForm = new URLSearchParams({
    account: stripeAccountId,
    refresh_url: `${appUrl}/admin?stripe_refresh=${encodeURIComponent(reference)}`,
    return_url: `${appUrl}/admin?stripe_return=${encodeURIComponent(reference)}`,
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

  return json({ ok: true, onboardingUrl: link.body.url, registration: updated });
}

async function handleStripeRefresh(request, env, reference) {
  if (!requireAdmin(request, env)) return unauthorized();
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
        givingStatus: registration.givingStatus || "active",
        stripeAccountStatus: registration.stripeAccountStatus || "not_started",
        platformFee: registration.platformFee || "",
        recurringGivingEnabled: registration.recurringGivingEnabled ?? true,
        candlesEnabled: registration.candlesEnabled ?? true,
        commemorationsEnabled: registration.commemorationsEnabled ?? true,
        funds: Array.isArray(registration.funds) ? registration.funds : [],
        campaigns: Array.isArray(registration.campaigns) ? registration.campaigns : []
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
    const updated = {
      ...current,
      website: body.website ?? current.website ?? "",
      givingStatus: body.givingStatus || current.givingStatus || "active",
      recurringGivingEnabled: Boolean(body.recurringGivingEnabled ?? current.recurringGivingEnabled ?? true),
      candlesEnabled: Boolean(body.candlesEnabled ?? current.candlesEnabled ?? true),
      commemorationsEnabled: Boolean(body.commemorationsEnabled ?? current.commemorationsEnabled ?? true),
      funds: Array.isArray(body.funds) ? body.funds : current.funds,
      campaigns: Array.isArray(body.campaigns) ? body.campaigns : current.campaigns,
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/parishes") return handleParishes(env);
    if (request.method === "POST" && url.pathname === "/api/registrations") return handleRegistrations(request, env);
    if (request.method === "GET" && url.pathname === "/api/admin/registrations") {
      return handleAdminRegistrations(request, env);
    }
    if (url.pathname.startsWith("/api/admin/registrations/") && url.pathname.endsWith("/stripe-onboarding")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", "").replace("/stripe-onboarding", ""));
      return handleStripeOnboarding(request, env, reference);
    }
    if (url.pathname.startsWith("/api/admin/registrations/") && url.pathname.endsWith("/stripe-refresh")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", "").replace("/stripe-refresh", ""));
      return handleStripeRefresh(request, env, reference);
    }
    if (url.pathname.startsWith("/api/admin/registrations/")) {
      const reference = decodeURIComponent(url.pathname.replace("/api/admin/registrations/", ""));
      return handleAdminRegistrationDetail(request, env, reference);
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
