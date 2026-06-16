import { json } from "../lib/core.js";
import { assertLearnEnabled, enabledProductSlugs, LEARN_PRODUCT_SLUG, learnCoOpEnabled } from "./access.js";
import { createSeedLearnRepository } from "./repository.js";

function requestedCalendarType(url) {
  return url.searchParams.get("calendar") || "julian";
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
      { href: "/learn/planner", label: "Planner", implemented: true },
      { href: "/learn/formation", label: "Formation", implemented: true },
      { href: "/learn/books", label: "Books", implemented: true },
      { href: "/learn/reports", label: "Reports", implemented: true },
      { href: "/learn/print-center", label: "Print Center", implemented: true },
      { href: "/learn/onboarding", label: "Setup", implemented: true },
      { href: "/learn/co-op", label: "Co-op", implemented: learnCoOpEnabled(env), featureFlag: "learn-coop" }
    ]
  });
}

export function handleLearnDashboard(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const repository = createSeedLearnRepository();
  const dashboard = repository.getDashboard({
    calendarType: requestedCalendarType(url),
    civilDate: url.searchParams.get("date") || "2025-05-07"
  });

  return json({
    ok: true,
    product: {
      slug: LEARN_PRODUCT_SLUG,
      enabled: true
    },
    dashboard
  });
}

export function handleLearnPlanner(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const repository = createSeedLearnRepository();
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

export function handleLearnPrintCenter(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const repository = createSeedLearnRepository();
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

export function handleLearnFormation(request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const repository = createSeedLearnRepository();
  return json({
    ok: true,
    formation: repository.getFormation({
      calendarType: requestedCalendarType(url)
    })
  });
}

export function handleLearnBooks(_request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const repository = createSeedLearnRepository();
  return json({
    ok: true,
    books: repository.getBooks()
  });
}

export function handleLearnReports(_request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const repository = createSeedLearnRepository();
  return json({
    ok: true,
    reports: repository.getReports()
  });
}

export function handleLearnCoOp(_request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const repository = createSeedLearnRepository();
  return json({
    ok: true,
    coOp: repository.getCoOp({
      enabled: learnCoOpEnabled(env)
    })
  });
}

export function handleLearnOnboarding(_request, env) {
  const blocked = assertLearnEnabled(env);
  if (blocked) return blocked;

  const repository = createSeedLearnRepository();
  return json({
    ok: true,
    onboarding: repository.getOnboarding()
  });
}
