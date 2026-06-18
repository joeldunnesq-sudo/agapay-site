import { json } from "../lib/core.js";
import { assertLearnEnabled, enabledProductSlugs, LEARN_PRODUCT_SLUG, learnCoOpEnabled } from "./access.js";
import { learnBillingCheckout, learnBillingStatus } from "./billing.js";
import { googleCalendarCallback, googleCalendarConnect, googleCalendarPreview, googleCalendarStatus, googleCalendarSync } from "./google-calendar.js";
import { enrichLiturgicalDayWithPonomar, handleLearnHymnsStatus } from "./hymn-source.js";
import { enrichLiturgicalDayWithOrthocal, handleLearnReadingsStatus } from "./readings-source.js";
import { createLearnRepositoryForRequest, SeedLearnRepository } from "./repository.js";
import { saveLearnGraceMode, saveLearnSetup } from "./setup-persistence.js";

function requestedCalendarType(url) {
  return url.searchParams.get("calendar") || "julian";
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
      { href: "/myagapay/learn/reports", label: "Reports", implemented: true },
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
  const repository = await createLearnRepositoryForRequest(request, env);
  const calendarType = requestedCalendarType(url);
  const civilDate = url.searchParams.get("date") || todayIso(env);
  const dashboard = repository.getDashboard({
    calendarType,
    civilDate
  });

  return json(await applyReadingsProvider({
    ok: true,
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
  const repository = await createLearnRepositoryForRequest(request, env);
  const planner = repository.getPlanner({
    calendarType: requestedCalendarType(url),
    view: url.searchParams.get("view") || "week"
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
  const repository = await createLearnRepositoryForRequest(request, env);
  const printCenter = repository.getPrintCenter({
    calendarType: requestedCalendarType(url)
  });

  return json({
    ok: true,
    product: {
      slug: LEARN_PRODUCT_SLUG,
      enabled: true
    },
    printCenter
  });
}

export async function handleLearnFormation(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const calendarType = requestedCalendarType(url);
  const civilDate = url.searchParams.get("date") || todayIso(env);
  const repository = await createLearnRepositoryForRequest(request, env);
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

export async function handleLearnBooks(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const repository = await createLearnRepositoryForRequest(request, env);
  return json({
    ok: true,
    books: repository.getBooks()
  });
}

export async function handleLearnCommunity(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const repository = await createLearnRepositoryForRequest(request, env);
  return json({
    ok: true,
    community: repository.getCommunity()
  });
}

export async function handleLearnReports(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const repository = await createLearnRepositoryForRequest(request, env);
  return json({
    ok: true,
    reports: repository.getReports()
  });
}

export async function handleLearnCoOp(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const repository = await createLearnRepositoryForRequest(request, env);
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

  const repository = await createLearnRepositoryForRequest(request, env);
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

export function handleLearnGoogleCalendarConnect(request, env) {
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
  return googleCalendarPreview(await createLearnRepositoryForRequest(request, env), request);
}

export async function handleLearnGoogleCalendarSync(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  return googleCalendarSync(await createLearnRepositoryForRequest(request, env), request, env);
}

export function handleLearnBillingStatus(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  return learnBillingStatus(request, env);
}

export function handleLearnBillingCheckout(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;
  return learnBillingCheckout(request, env);
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
