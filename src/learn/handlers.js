import { json, rateLimit, unauthorized } from "../lib/core.js";
import { closeLearnTerm } from "./academic-records.js";
import { assertLearnEnabled, enabledProductSlugs, LEARN_PRODUCT_SLUG, learnCoOpEnabled } from "./access.js";
import { LEARN_FREE_PRINT_LIMIT, learnBillingCancel, learnBillingCheckout, learnBillingStatus, learnRequestHasFamilyAccessAsync } from "./billing.js";
import { googleCalendarCallback, googleCalendarConnect, googleCalendarPreview, googleCalendarStatus, googleCalendarSync } from "./google-calendar.js";
import { flagLearnCommunityResource, listLearnCommunityResources, submitLearnCommunityResource } from "./community-store.js";
import { enrichLiturgicalDayWithPonomar, handleLearnHymnsStatus } from "./hymn-source.js";
import { enrichLiturgicalDayWithOrthocal, fetchOrthocalDay, handleLearnReadingsStatus, orthocalSaintStories } from "./readings-source.js";
import { buildLearnPrintDocument, buildLearnReportPrintDocument, printDocumentFilename, renderPrintDocumentPdf } from "./print-engine.js";
import { createLearnRepositoryForRequest, SeedLearnRepository } from "./repository.js";
import { learnSetupIdentity, saveLearnCompletion, saveLearnGraceMode, saveLearnSetup } from "./setup-persistence.js";

const LEARN_PRINT_USAGE_PREFIX = "__agapay_learn_print_usage:";

function requestedCalendarType(url) {
  return url.searchParams.get("calendar") || "julian";
}

function repositoryCalendarType(repository, fallback = "julian") {
  return repository?.seed?.setupSnapshot?.preferences?.calendarType
    || repository?.seed?.setupSnapshot?.household?.liturgicalCalendarType
    || repository?.seed?.household?.liturgicalCalendarType
    || fallback;
}

function todayIso(env = {}) {
  const timeZone = env.AGAPAY_LEARN_TIME_ZONE || env.TZ || "America/Chicago";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date()).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function requireLearnRepository(request, env, options = {}) {
  const repository = await createLearnRepositoryForRequest(request, env, options);
  if (!repository) return { response: unauthorized() };
  return { repository };
}

function learnPrintUsageKey(identity) {
  return `${LEARN_PRINT_USAGE_PREFIX}${identity?.householdId || identity?.email || "unknown"}`;
}

async function loadLearnPrintUsage(env, identity) {
  if (!env.AGAPAY_REGISTRATIONS || !identity) return { count: 0 };
  const raw = await env.AGAPAY_REGISTRATIONS.get(learnPrintUsageKey(identity));
  if (!raw) return { count: 0 };
  try {
    const parsed = JSON.parse(raw);
    return {
      count: Math.max(0, Number(parsed.count || 0)),
      updatedAt: parsed.updatedAt || ""
    };
  } catch {
    return { count: 0 };
  }
}

async function incrementLearnPrintUsage(env, identity) {
  if (!env.AGAPAY_REGISTRATIONS || !identity) return { count: 0 };
  const current = await loadLearnPrintUsage(env, identity);
  const next = {
    count: current.count + 1,
    updatedAt: new Date().toISOString()
  };
  await env.AGAPAY_REGISTRATIONS.put(learnPrintUsageKey(identity), JSON.stringify(next));
  return next;
}

async function enforceLearnPrintLimit(request, env, identity) {
  if (await learnRequestHasFamilyAccessAsync(request, env, identity)) {
    return { ok: true, family: true, count: 0, limit: LEARN_FREE_PRINT_LIMIT };
  }
  const usage = await loadLearnPrintUsage(env, identity);
  if (usage.count >= LEARN_FREE_PRINT_LIMIT) {
    return {
      ok: false,
      response: json({
        ok: false,
        error: `The free AGAPAY Learn plan includes ${LEARN_FREE_PRINT_LIMIT} PDF prints. Upgrade to keep generating print packs.`,
        upgradeRequired: true,
        printLimit: LEARN_FREE_PRINT_LIMIT,
        printCount: usage.count
      }, { status: 403 })
    };
  }
  const updated = await incrementLearnPrintUsage(env, identity);
  return { ok: true, family: false, count: updated.count, limit: LEARN_FREE_PRINT_LIMIT };
}

export function handleLearnMeta(env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  return json({
    ok: true,
    product: {
      slug: LEARN_PRODUCT_SLUG,
      enabled: true,
      enabledProducts: enabledProductSlugs(env)
    },
    navigation: [
      { href: "/learn", label: "Dashboard", implemented: true },
      { href: "/myagapay/learn/planner", label: "Planner", implemented: true },
      { href: "/myagapay/learn/formation", label: "Formation", implemented: true },
      { href: "/myagapay/learn/books", label: "Books", implemented: true },
      { href: "/myagapay/learn/community", label: "Community", implemented: true },
      { href: "/myagapay/learn/print", label: "Print Center", implemented: true },
      { href: "/myagapay/learn/setup", label: "Setup", implemented: true },
      { href: "/myagapay/learn/co-op", label: "Co-op", implemented: learnCoOpEnabled(env), featureFlag: "learn-coop" }
    ]
  });
}

async function applyReadingsProvider(payload, { calendarType, civilDate, env }) {
  if (!payload?.dashboard?.today?.liturgicalDay) return payload;
  payload.dashboard.today.liturgicalDay = await enrichLiturgicalDayWithOrthocal(payload.dashboard.today.liturgicalDay, {
    calendarType,
    civilDate
  });
  payload.dashboard.today.liturgicalDay = await enrichLiturgicalDayWithPonomar(payload.dashboard.today.liturgicalDay, {
    civilDate,
    env
  });
  payload.dashboard.today.churchRhythms = (payload.dashboard.today.churchRhythms || []).map((entry) => {
    if (entry.title === "Daily Readings" || entry.title === "Gospel Reading") {
      return { ...entry, note: payload.dashboard.today.liturgicalDay.gospelRef || entry.note };
    }
    if (entry.title === "Fasting Rule" || entry.title.includes("Fast")) {
      return { ...entry, note: payload.dashboard.today.liturgicalDay.fastingRule || entry.note };
    }
    return entry;
  });
  return payload;
}

export async function handleLearnDashboard(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  const { repository } = auth;
  const calendarType = requestedCalendarType(url);
  const civilDate = url.searchParams.get("date") || todayIso(env);
  const dashboard = repository.getDashboard({
    calendarType,
    civilDate
  });

  return json(await applyReadingsProvider({
    ok: true,
    setupCompleted: Boolean(repository.seed?.setupSnapshot),
    product: {
      slug: LEARN_PRODUCT_SLUG,
      enabled: true
    },
    dashboard
  }, { calendarType, civilDate, env }));
}

export async function handleLearnPlanner(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const auth = await requireLearnRepository(request, env, { termId: url.searchParams.get("termId") || "" });
  if (auth.response) return auth.response;
  const { repository } = auth;
  const planner = repository.getPlanner({
    calendarType: requestedCalendarType(url),
    view: url.searchParams.get("view") || "week",
    month: url.searchParams.get("month") || ""
  });

  return json({
    ok: true,
    product: {
      slug: LEARN_PRODUCT_SLUG,
      enabled: true
    },
    planner
  });
}

export async function handleLearnPrintCenter(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  const { repository } = auth;
  const printCenter = repository.getPrintCenter({
    calendarType: requestedCalendarType(url),
    month: url.searchParams.get("month") || ""
  });

  return json({
    ok: true,
    product: {
      slug: LEARN_PRODUCT_SLUG,
      enabled: true
    },
    printCenter: {
      ...printCenter,
      reports: repository.getReports()
    }
  });
}

export async function handleLearnCompletionSave(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, { status: 405 });
  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ ok: false, error: "Progress payload was invalid." }, { status: 400 });

  const saved = await saveLearnCompletion(env, request, payload);
  if (!saved.ok) return json({ ok: false, error: saved.error }, { status: saved.status || 500 });
  const repository = await createLearnRepositoryForRequest(request, env);
  const calendarType = requestedCalendarType(new URL(request.url));
  const civilDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.civilDate || "")) ? String(payload.civilDate) : todayIso(env);
  const dashboard = repository.getDashboard({ calendarType, civilDate });
  return json(await applyReadingsProvider({
    ok: true,
    setupCompleted: true,
    product: { slug: LEARN_PRODUCT_SLUG, enabled: true },
    completion: { scope: saved.scope, periodKey: saved.periodKey, itemId: saved.itemId, completed: saved.completed },
    dashboard
  }, { calendarType, civilDate, env }));
}

export async function handleLearnPrintPdf(request, env, templateId = "") {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const url = new URL(request.url);
  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  const { repository } = auth;
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return unauthorized();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const limit = await enforceLearnPrintLimit(request, env, identity);
  if (!limit.ok) return limit.response;
  const resolvedTemplateId = templateId || body.templateId || "print_mom_weekly";
  const reportTemplate = /report|transcript|subject-progress|year-end/i.test(resolvedTemplateId);
  const document = reportTemplate
    ? buildLearnReportPrintDocument(repository.getReports(), {
        templateId: resolvedTemplateId,
        label: body.label || "",
        generatedAt: new Date().toISOString()
      })
    : buildLearnPrintDocument(repository.getPrintCenter({
        calendarType: requestedCalendarType(url),
        month: body.month || url.searchParams.get("month") || ""
      }), {
        templateId: resolvedTemplateId,
        childId: body.childId || "",
        termId: body.termId || "",
        month: body.month || "",
        year: body.year || "",
        generatedAt: new Date().toISOString()
      });
  const pdfBytes = await renderPrintDocumentPdf(document);

  return new Response(pdfBytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${printDocumentFilename(document)}"`,
      "cache-control": "no-store",
      "x-agapay-learn-print-count": String(limit.count),
      "x-agapay-learn-print-limit": String(limit.limit)
    }
  });
}

export async function handleLearnFormation(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const calendarType = requestedCalendarType(url);
  const civilDate = url.searchParams.get("date") || todayIso(env);
  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  const { repository } = auth;
  const formation = repository.getFormation({
    calendarType,
    civilDate
  });
  formation.today.liturgicalDay = await enrichLiturgicalDayWithOrthocal(formation.today.liturgicalDay, {
    calendarType,
    civilDate
  });
  formation.today.liturgicalDay = await enrichLiturgicalDayWithPonomar(formation.today.liturgicalDay, {
    civilDate,
    env
  });
  return json({
    ok: true,
    formation
  });
}

export async function handleLearnSaints(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  const { repository } = auth;
  const civilDate = url.searchParams.get("date") || todayIso(env);
  const calendarType = url.searchParams.get("calendar") || repositoryCalendarType(repository);

  try {
    const day = await fetchOrthocalDay({ calendarType, civilDate });
    const saintStories = orthocalSaintStories(day);
    return json({
      ok: true,
      date: civilDate,
      calendar: calendarType,
      sourceConnected: true,
      sourceLabel: "Orthocal.info",
      sourceUrl: `https://orthocal.info/api/${calendarType === "revised-julian" ? "gregorian" : "julian"}/${civilDate.split("-").map(Number).join("/")}/`,
      saints: saintStories,
      saintNames: Array.isArray(day?.saints) ? day.saints : [],
      feastRank: day?.feast_level_description || ""
    });
  } catch (error) {
    return json({
      ok: true,
      date: civilDate,
      calendar: calendarType,
      sourceConnected: false,
      sourceLabel: "Orthocal.info unavailable",
      sourceError: error.message,
      saints: [],
      saintNames: [],
      message: "Lives of the Saints are unavailable right now. Please try again later."
    });
  }
}

export async function handleLearnBooks(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  const { repository } = auth;
  return json({
    ok: true,
    books: repository.getBooks()
  });
}

export async function handleLearnCommunity(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  const { repository } = auth;
  const communityResources = await listLearnCommunityResources(env);
  return json({
    ok: true,
    community: repository.getCommunity({
      facebookGroupUrl: String(env.AGAPAY_LEARN_FACEBOOK_GROUP_URL || "").trim(),
      communityResources
    })
  });
}

export async function handleLearnCommunitySubmit(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "learn-community-submit", { limit: 10, windowSeconds: 86400 });
  if (limited) return limited;
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ ok: false, error: "Resource submission was invalid." }, { status: 400 });
  const result = await submitLearnCommunityResource(env, identity, body);
  return json(result, { status: result.ok ? 201 : result.status || 500 });
}

export async function handleLearnCommunityFlag(request, env, resourceId = "") {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "learn-community-flag", { limit: 20, windowSeconds: 300 });
  if (limited) return limited;
  const identity = await learnSetupIdentity(request, env);
  if (!identity) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const result = await flagLearnCommunityResource(env, identity, resourceId, body.reason);
  return json(result, { status: result.ok ? 200 : result.status || 500 });
}

export async function handleLearnReports(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  const { repository } = auth;
  return json({
    ok: true,
    reports: repository.getReports()
  });
}

export async function handleLearnTermClose(request, env, termId = "") {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, { status: 405 });

  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  const { repository } = auth;
  const setupSnapshot = repository.seed?.setupSnapshot;
  if (!setupSnapshot) {
    return json({ ok: false, error: "Complete Learn setup before closing a term." }, { status: 400 });
  }

  const result = await closeLearnTerm(env, setupSnapshot, termId);
  if (!result.ok) return json(result, { status: result.status || 500 });
  return json(result);
}

export async function handleLearnCoOp(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  const { repository } = auth;
  return json({
    ok: true,
    coOp: repository.getCoOp({
      enabled: learnCoOpEnabled(env)
    })
  });
}

export async function handleLearnOnboarding(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  const { repository } = auth;
  return json({
    ok: true,
    onboarding: repository.getOnboarding()
  });
}

export async function handleLearnOnboardingSave(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return json({ ok: false, error: "Setup could not be saved because the form payload was invalid." }, { status: 400 });
  }

  const saved = await saveLearnSetup(env, request, payload);
  if (!saved.ok) {
    return json({ ok: false, error: saved.error }, { status: saved.status || 500 });
  }

  const repository = new SeedLearnRepository(saved.onboarding);
  return json({
    ok: true,
    onboarding: repository.getOnboarding(),
    savedAt: saved.setupSnapshot.savedAt
  });
}

export async function handleLearnGraceModeSave(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return json({ ok: false, error: "Grace Mode could not be saved because the payload was invalid." }, { status: 400 });
  }

  const saved = await saveLearnGraceMode(env, request, payload);
  if (!saved.ok) {
    return json({ ok: false, error: saved.error }, { status: saved.status || 500 });
  }

  const repository = new SeedLearnRepository(saved.onboarding);
  const url = new URL(request.url);
  const calendarType = requestedCalendarType(url);
  const civilDate = url.searchParams.get("date") || todayIso(env);
  const dashboard = repository.getDashboard({ calendarType, civilDate });

  return json(await applyReadingsProvider({
    ok: true,
    savedAt: saved.setupSnapshot.savedAt,
    product: {
      slug: LEARN_PRODUCT_SLUG,
      enabled: true
    },
    dashboard
  }, { calendarType, civilDate, env }));
}

export async function handleLearnGoogleCalendarStatus(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  return googleCalendarStatus(request, env);
}

export async function handleLearnGoogleCalendarConnect(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  return googleCalendarConnect(request, env);
}

export async function handleLearnGoogleCalendarCallback(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  return googleCalendarCallback(request, env);
}

export async function handleLearnGoogleCalendarPreview(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  return googleCalendarPreview(auth.repository, request);
}

export async function handleLearnGoogleCalendarSync(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const auth = await requireLearnRepository(request, env);
  if (auth.response) return auth.response;
  return googleCalendarSync(auth.repository, request, env);
}

export async function handleLearnBillingStatus(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  return learnBillingStatus(request, env);
}

export function handleLearnBillingCheckout(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  return learnBillingCheckout(request, env);
}

export function handleLearnBillingCancel(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  return learnBillingCancel(request, env);
}

export function handleLearnReadingsProviderStatus(_request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  return handleLearnReadingsStatus();
}

export function handleLearnHymnsProviderStatus(_request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  return handleLearnHymnsStatus(env);
}
