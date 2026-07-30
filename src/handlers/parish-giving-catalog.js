// src/handlers/parish-giving-catalog.js
// Public giving options, campaign presentation and assets, and platform totals.

import { activeFestalAlmsCampaigns } from "../festal-alms.js";
import {
  DONOR_OFFERING_KEY_PREFIX,
  d1,
  d1First,
  listKvKeys,
} from "../lib/core.js";
import {
  findRegistrationByParishId,
  getBearerToken,
  givingFeatureAccess,
  hasProductionStore,
  json,
  loadParishPaidOfferings,
  loadVerifiedRegistrationParishPage,
  missingProductionStoreResponse,
  paidOfferingStatus,
  parishFromRegistration,
  rateLimit,
  registrationRequiresJurisdiction,
  saveRegistrationRecord,
  slugify,
  unauthorized,
  verifiedRegistrationParishes,
  verifyParishDashboardBearer,
} from "./parish.js";

export function normalizedOptionKeys(option = {}) {
  return [option.id, option.feastId, option.name, option.campaignName, option.title]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
}

function campaignGiftKeys(gift = {}) {
  return normalizedOptionKeys({
    id: gift.campaignId,
    name: gift.campaign,
    campaignName: gift.description || gift.campaignDescription,
    title: gift.giftType === "campaign" ? gift.fund : ""
  });
}

function giftMatchesCampaignKeys(gift, keys) {
  const giftType = String(gift.giftType || "").toLowerCase();
  return ["campaign", "alms", "feast"].includes(giftType) && campaignGiftKeys(gift).some((key) => keys.has(key));
}

export function campaignRaisedTotals(campaign, gifts) {
  const keys = new Set(normalizedOptionKeys(campaign));
  let raisedCents = 0;
  let giftCount = 0;
  gifts.forEach((gift) => {
    if (giftMatchesCampaignKeys(gift, keys)) {
      raisedCents += Number(gift.amountCents || 0);
      giftCount += 1;
    }
  });
  return { raisedCents, giftCount };
}

export function publicBoolean(value) {
  return value === true || String(value || "").toLowerCase() === "true" || String(value || "") === "1";
}

export function publicComment(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 280);
}

function campaignPublicSupporters(campaign, gifts) {
  const keys = new Set(normalizedOptionKeys(campaign));
  return gifts
    .filter((gift) => giftMatchesCampaignKeys(gift, keys))
    .map((gift) => {
      const anonymous = publicBoolean(gift.publicAnonymous);
      const name = anonymous ? "Anonymous" : (gift.publicDisplayName || gift.donorName || "AGAPAY donor");
      return {
        name,
        amountCents: Number(gift.amountCents || gift.giftAmountCents || 0),
        comment: publicComment(gift.publicComment),
        anonymous,
        createdAt: gift.createdAt || gift.completedAt || ""
      };
    })
    .filter((gift) => gift.amountCents > 0)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 24);
}

function stFiacreRoofDemoSupporters() {
  return [
    {
      name: "Sophia Lebedev",
      amountCents: 55000,
      comment: "May this church shelter generations to come.",
      anonymous: false,
      createdAt: "2026-07-05T09:30:00.000Z"
    },
    {
      name: "Anonymous",
      amountCents: 80000,
      comment: "For the continued life of the parish.",
      anonymous: true,
      createdAt: "2026-06-07T12:30:00.000Z"
    },
    {
      name: "Elena Sokolov",
      amountCents: 65000,
      comment: "With love for our parish home.",
      anonymous: false,
      createdAt: "2026-05-03T10:00:00.000Z"
    },
    {
      name: "Nikolai Volkov",
      amountCents: 125000,
      comment: "Glory to God for this parish and the work ahead.",
      anonymous: false,
      createdAt: "2026-04-05T13:00:00.000Z"
    },
    {
      name: "Anna Kozlov",
      amountCents: 100000,
      comment: "For our children and the future of the parish.",
      anonymous: false,
      createdAt: "2026-03-15T10:30:00.000Z"
    },
    {
      name: "Anonymous",
      amountCents: 75000,
      comment: "Praying this roof protects the church for many years.",
      anonymous: true,
      createdAt: "2026-02-22T09:45:00.000Z"
    },
    {
      name: "Maria Petrov",
      amountCents: 50000,
      comment: "In thanksgiving for the mission and all who worship here.",
      anonymous: false,
      createdAt: "2026-02-01T11:15:00.000Z"
    },
    {
      name: "Joel Dunn",
      amountCents: 7500,
      comment: "May God bless this work.",
      anonymous: false,
      createdAt: "2026-01-18T11:15:00.000Z"
    }
  ];
}

export async function enrichParishGivingOptions(env, parish) {
  if (!parish?.id) return parish;
  const gifts = await loadParishPaidOfferings(env, parish.id, 1000);
  const enrichCampaign = (campaign) => {
    const totals = campaignRaisedTotals(campaign, gifts);
    const supporters = campaignPublicSupporters(campaign, gifts);
    const photos = Array.isArray(campaign.photos) ? campaign.photos : [];
    const optionKeys = [
      ...normalizedOptionKeys(campaign),
      campaign.slug,
      campaign.code
    ].filter(Boolean).map((value) => String(value).trim().toLowerCase());
    const isStFiacreRoofDemo = parish.id === "st-fiacre"
      && optionKeys.some((key) => ["alms", "roof-campaign", "roof-restoration", "roof campaign", "church roof restoration"].includes(key));
    const coverPhotoUrl = campaign.coverPhotoUrl
      || campaign.coverUrl
      || campaign.imageUrl
      || campaign.photoUrl
      || (typeof photos[0] === "string" ? photos[0] : photos[0]?.url)
      || (isStFiacreRoofDemo ? "/images/marketplace/dome-cross.jpg" : "")
      || "";
    const seededRaisedCents = isStFiacreRoofDemo ? 557500 : 0;
    return {
      ...campaign,
      name: isStFiacreRoofDemo ? "Church Roof Restoration" : campaign.name || campaign.campaignName || "Parish Campaign",
      description: isStFiacreRoofDemo ? "Help us restore and protect our church for generations to come." : campaign.description,
      category: isStFiacreRoofDemo ? "Building" : campaign.category,
      goalCents: isStFiacreRoofDemo ? 1000000 : Number(campaign.goalCents || campaign.targetCents || campaign.goalAmountCents || 0),
      coverPhotoUrl,
      raisedCents: totals.raisedCents || (isStFiacreRoofDemo
        ? seededRaisedCents
        : Number(campaign.raisedCents || campaign.amountCents || campaign.currentCents || 0)),
      giftCount: totals.giftCount || (isStFiacreRoofDemo
        ? 8
        : Number(campaign.giftCount || campaign.donorCount || 0)),
      supporters: supporters.length ? supporters : (isStFiacreRoofDemo ? stFiacreRoofDemoSupporters() : [])
    };
  };
  return {
    ...parish,
    campaigns: (parish.campaigns || []).map(enrichCampaign),
    feastCampaigns: activeFestalAlmsCampaigns(
      parish.feastCampaigns,
      parish.liturgicalCalendar
    ).map(enrichCampaign)
  };
}

export async function handleParishes(request, env) {
  const url = new URL(request.url);

  // Fast single-parish lookup: /api/parishes?id=st-fiacre
  // Used by the give/form page to avoid fetching all parishes just to find one.
  const singleId = (url.searchParams.get("id") || "").trim();
  if (singleId) {
    const found = await findRegistrationByParishId(env, singleId);
    if (!found) return json({ error: "Parish not found" }, { status: 404 });
    const parish = parishFromRegistration(found.registration);
    if (parish.status !== "verified") return json({ error: "Parish not found" }, { status: 404 });
    const enriched = await enrichParishGivingOptions(env, parish);
    return json({ parish: enriched, source: "d1" });
  }

  const page = await loadVerifiedRegistrationParishPage(env, {
    limit: url.searchParams.get("limit"),
    cursor: url.searchParams.get("cursor"),
    q: url.searchParams.get("q") || url.searchParams.get("search"),
    type: url.searchParams.get("type"),
    jurisdiction: url.searchParams.get("jurisdiction")
  });
  const enrichedParishes = await Promise.all(page.parishes.map((parish) => enrichParishGivingOptions(env, parish)));

  return json({
    parishes: enrichedParishes,
    cursor: page.cursor,
    hasMore: page.hasMore,
    limit: page.limit,
    source: page.source
  });
}

export async function handlePublicCampaign(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const url = new URL(request.url);
  const parishId = String(url.searchParams.get("parish") || url.searchParams.get("parishId") || "").trim();
  const slug = String(url.searchParams.get("slug") || url.searchParams.get("campaign") || url.searchParams.get("c") || "").trim();
  if (!parishId || !slug) return json({ error: "Campaign parish and slug are required." }, { status: 422 });

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Campaign not found" }, { status: 404 });
  const parish = parishFromRegistration(found.registration);
  if (!parish) return json({ error: "Campaign not found" }, { status: 404 });

  const enrichedParish = await enrichParishGivingOptions(env, parish);
  const campaigns = [
    ...(Array.isArray(enrichedParish.campaigns) ? enrichedParish.campaigns : []),
    ...(Array.isArray(enrichedParish.feastCampaigns) ? enrichedParish.feastCampaigns : [])
  ];
  const normalizedSlug = slugify(slug);
  const campaign = campaigns.find((item) => {
    const keys = [item.slug, item.id, item.feastId, item.name, item.campaignName, item.title]
      .filter(Boolean)
      .map((value) => slugify(value));
    return keys.includes(normalizedSlug);
  });
  if (!campaign) return json({ error: "Campaign not found" }, { status: 404 });

  const status = String(campaign.status || (campaign.enabled === false ? "hidden" : "active")).toLowerCase();
  if (["hidden", "cancelled", "inactive"].includes(status)) {
    return json({ error: "Campaign not found" }, { status: 404 });
  }

  return json({
    ok: true,
    parish: enrichedParish,
    campaign: {
      ...campaign,
      slug: campaign.slug || slugify(campaign.name || campaign.campaignName || campaign.id || slug)
    }
  });
}

export async function handleParishCampaignUpload(request, env, parishId) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-campaign-upload", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return unauthorized();
  if (!givingFeatureAccess(found.registration, "campaigns")) {
    return json({ error: "Campaigns are available with Giving Plus." }, { status: 403 });
  }

  if (!env.CAMPAIGN_ASSETS || !env.CAMPAIGN_ASSETS_URL) {
    return json({ error: "Campaign photo storage is not configured." }, { status: 503 });
  }

  const contentType = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const allowed = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
  ]);
  const ext = allowed.get(contentType);
  if (!ext) {
    return json({ error: "Campaign photos must be JPG, PNG, or WebP images." }, { status: 415 });
  }

  const maxBytes = 10 * 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength && contentLength > maxBytes) {
    return json({ error: "Campaign photo must be 10MB or smaller." }, { status: 413 });
  }

  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: "Campaign photo is empty." }, { status: 422 });
  if (bytes.byteLength > maxBytes) return json({ error: "Campaign photo must be 10MB or smaller." }, { status: 413 });

  const uploadUrl = new URL(request.url);
  const campaignId = slugify(uploadUrl.searchParams.get("campaign") || "draft");
  const key = [
    "campaigns",
    slugify(parishId),
    campaignId,
    `${Date.now()}-${crypto.randomUUID()}.${ext}`
  ].join("/");
  await env.CAMPAIGN_ASSETS.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable"
    }
  });
  const publicBase = String(env.CAMPAIGN_ASSETS_URL || "").replace(/\/+$/, "");
  return json({
    ok: true,
    key,
    url: `${publicBase}/${key}`,
    contentType,
    size: bytes.byteLength
  });
}

export async function handleParishLogo(request, env, parishId) {
  if (!["POST", "DELETE"].includes(request.method)) {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const limited = await rateLimit(request, env, "parish-logo", { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) return unauthorized();
  if (request.method === "POST" && !givingFeatureAccess(found.registration, "branding")) {
    return json({ error: "Parish logo branding is available with Giving Plus." }, { status: 403 });
  }
  if (!env.CAMPAIGN_ASSETS || !env.CAMPAIGN_ASSETS_URL) {
    return json({ error: "Parish logo storage is not configured." }, { status: 503 });
  }

  const previousKey = String(found.registration.logoStorageKey || "");
  if (request.method === "DELETE") {
    const updated = {
      ...found.registration,
      logoUrl: "",
      logoStorageKey: "",
      parishUpdatedAt: new Date().toISOString()
    };
    await saveRegistrationRecord(env, found.key, updated, found.registration);
    if (previousKey) await env.CAMPAIGN_ASSETS.delete(previousKey);
    return json({ ok: true, logoUrl: "" });
  }

  const contentType = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const allowed = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
  ]);
  const ext = allowed.get(contentType);
  if (!ext) return json({ error: "Logo must be a JPG, PNG, or WebP image." }, { status: 415 });

  const maxBytes = 5 * 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength && contentLength > maxBytes) {
    return json({ error: "Logo must be 5MB or smaller." }, { status: 413 });
  }
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: "Logo image is empty." }, { status: 422 });
  if (bytes.byteLength > maxBytes) return json({ error: "Logo must be 5MB or smaller." }, { status: 413 });

  const key = `parish-logos/${slugify(parishId)}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  await env.CAMPAIGN_ASSETS.put(key, bytes, {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" }
  });
  const publicBase = String(env.CAMPAIGN_ASSETS_URL || "").replace(/\/+$/, "");
  const logoUrl = `${publicBase}/${key}`;
  const updated = {
    ...found.registration,
    logoUrl,
    logoStorageKey: key,
    parishUpdatedAt: new Date().toISOString()
  };
  try {
    await saveRegistrationRecord(env, found.key, updated, found.registration);
  } catch (error) {
    await env.CAMPAIGN_ASSETS.delete(key);
    throw error;
  }
  if (previousKey && previousKey !== key) await env.CAMPAIGN_ASSETS.delete(previousKey);
  return json({ ok: true, logoUrl, key, contentType, size: bytes.byteLength });
}

export async function loadPaidDonorOfferingPlatformTotals(env) {
  if (d1(env)) {
    const row = await d1First(
      env,
      `SELECT
         COUNT(*) AS gift_count,
         COALESCE(SUM(CAST(json_extract(data, '$.amountCents') AS INTEGER)), 0) AS total_given_cents
       FROM donor_offerings
       WHERE payment_status IN ('paid', 'succeeded') OR status IN ('paid', 'completed')`
    );
    return {
      giftCount: Number(row?.gift_count || 0),
      totalGivenCents: Number(row?.total_given_cents || 0)
    };
  }

  if (!env.AGAPAY_REGISTRATIONS) return { giftCount: 0, totalGivenCents: 0 };
  const keys = await listKvKeys(env, { prefix: DONOR_OFFERING_KEY_PREFIX, limit: 5000 });
  let giftCount = 0;
  let totalGivenCents = 0;

  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const offering = JSON.parse(raw);
      if (paidOfferingStatus(offering)) {
        giftCount += 1;
        totalGivenCents += Number(offering.amountCents || 0);
      }
    } catch {
      // Ignore malformed donation records in public aggregate totals.
    }
  }

  return { giftCount, totalGivenCents };
}

export async function handlePublicPlatformSummary(env) {
  if (!hasProductionStore(env)) {
    return json({
      summary: {
        organizationsSupported: 0,
        activeCampaigns: 0,
        totalGivenCents: 0,
        giftCount: 0,
        dataSource: "not_configured",
        generatedAt: new Date().toISOString()
      }
    });
  }

  const parishes = await verifiedRegistrationParishes(env, { limit: 10000 });
  const donationTotals = await loadPaidDonorOfferingPlatformTotals(env);
  const activeCampaigns = parishes.reduce((total, parish) => {
    const campaigns = Array.isArray(parish.campaigns) ? parish.campaigns : [];
    return total + campaigns.filter((campaign) => campaign && campaign.active !== false && campaign.hidden !== true).length;
  }, 0);

  return json({
    summary: {
      organizationsSupported: parishes.length,
      activeCampaigns,
      totalGivenCents: donationTotals.totalGivenCents,
      giftCount: donationTotals.giftCount,
      dataSource: d1(env) ? "d1" : "kv",
      generatedAt: new Date().toISOString()
    }
  });
}
