import { json } from "../lib/core.js";
import { fundActivity, getAccountingSettings, getAccountingSetupOverview, initializeAccountingSetup, reportCsv, statementOfActivities, statementOfFinancialPosition, trialBalance, updateAccountingSettings } from "../accounting/index.js";
import { accountingContext } from "./accounting-ledger.js";

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", Vary: "Authorization" };
const reply = (payload, status = 200) => json(payload, { status, headers: HEADERS });
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getUTCFullYear()}-01-01`;

function reportRequest(path, url, db, actor) {
  const startDate = url.searchParams.get("from") || yearStart();
  const endDate = url.searchParams.get("to") || today();
  const fundId = url.searchParams.get("fundId") || "";
  if (path === "/reports/trial-balance") return trialBalance(db, { actor, startDate, endDate, fundId, includeZero: url.searchParams.get("includeZero") === "true" });
  if (path === "/reports/statement-of-activities") return statementOfActivities(db, { actor, startDate, endDate, fundId });
  if (path === "/reports/statement-of-financial-position") return statementOfFinancialPosition(db, { actor, asOfDate: url.searchParams.get("asOf") || endDate, fundId });
  if (path === "/reports/fund-activity") return fundActivity(db, { actor, startDate, endDate });
  return null;
}

export async function handleAccountingSetupReports(request, env, parishId) {
  const url = new URL(request.url);
  const base = `/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting`;
  if (!url.pathname.startsWith(base)) return null;
  let path = url.pathname.slice(base.length);
  const csv = path.endsWith(".csv");
  if (csv) path = path.slice(0, -4);
  const supported = path === "/setup" || path === "/setup/initialize" || path === "/settings" || path.startsWith("/reports/");
  if (!supported) return null;
  const capability = request.method === "GET" ? "accounting.view" : "accounting.configure";
  try {
    const ctx = await accountingContext(request, env, parishId, capability);
    if (!ctx) return reply({ error: "Unauthorized" }, 401);
    if (ctx.error) return ctx.error;
    if (request.method === "GET" && path === "/setup") return reply({ ok: true, tier: ctx.tier, overview: await getAccountingSetupOverview(ctx.db, { actor: ctx.actor, entitlementTier: ctx.tier, databaseStatus: ctx.databaseStatus, databaseHealth: ctx.databaseHealth }) });
    if (request.method === "POST" && path === "/setup/initialize") return reply({ ok: true, setup: await initializeAccountingSetup(ctx.db, { actor: ctx.actor }) }, 201);
    if (request.method === "GET" && path === "/settings") return reply({ ok: true, settings: await getAccountingSettings(ctx.db, { actor: ctx.actor }) });
    if (request.method === "PATCH" && path === "/settings") {
      const body = await request.json().catch(() => ({}));
      return reply({ ok: true, settings: await updateAccountingSettings(ctx.db, { actor: ctx.actor, expectedVersion: body.expectedVersion, patch: body.patch || {} }) });
    }
    if (request.method === "GET" && path.startsWith("/reports/")) {
      const report = await reportRequest(path, url, ctx.db, ctx.actor);
      if (!report) return reply({ error: "Not found" }, 404);
      if (csv) return new Response(reportCsv(report), { headers: { ...HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=agapay-${report.code}.csv` } });
      return reply({ ok: true, report });
    }
    return reply({ error: "Not found" }, 404);
  } catch (error) {
    return reply({ error: error?.details?.conflict ? "conflict" : "accounting_request_failed", message: error?.message || "Accounting request failed." }, error?.details?.conflict ? 409 : 400);
  }
}
