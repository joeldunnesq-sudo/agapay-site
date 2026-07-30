import { json } from "../lib/core.js";
import {
  commitChartOfAccountsImport,
  commitFundMapping,
  commitOpeningBalanceImport,
  commitTransactionHistoryImport,
  commitVendorImport,
  createMigrationSession,
  listMigrationSessions,
  migrationSessionDetail,
  previewChartOfAccountsCsv,
  previewFundMapping,
  previewOpeningBalanceCsv,
  previewTransactionHistoryCsv,
  previewVendorCsv
} from "../accounting/index.js";
import { accountingContext } from "./accounting-ledger.js";
import { findRegistrationByParishId, handleParishDashboard } from "./parish.js";

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", Vary: "Authorization" };
const reply = (payload, status = 200) => json(payload, { status, headers: HEADERS });
const tierForService = (tier) => tier === "advanced_operations" ? "parish" : "mission";

async function dispatchParishDashboardPatch(request, env, parishId, { path, body }) {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const name of ["Authorization", "X-AGAPAY-Accounting-Profile", "X-AGAPAY-Accounting-Token", "X-Request-Id"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await handleParishDashboard(new Request(new URL(path, request.url), {
    method: "PATCH",
    headers,
    body: JSON.stringify(body)
  }), env, parishId);
  const payload = await response.json().catch(() => ({}));
  return { ...payload, ok: response.ok };
}

export async function handleAccountingMigration(request, env, parishId) {
  const url = new URL(request.url);
  const base = `/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting`;
  if (!url.pathname.startsWith(base)) return null;
  const path = url.pathname.slice(base.length);
  if (!path.startsWith("/migration")) return null;
  try {
    const ctx = await accountingContext(request, env, parishId, "accounting.migration.import");
    if (!ctx) return reply({ error: "Unauthorized" }, 401);
    if (ctx.error) return ctx.error;
    const entitlementTier = tierForService(ctx.tier);
    if (request.method === "GET" && path === "/migration/sessions") {
      return reply({ ok: true, sessions: await listMigrationSessions(ctx.db, { actor: ctx.actor, entitlementTier }) });
    }
    const sessionMatch = path.match(/^\/migration\/sessions\/([^/]+)$/);
    if (request.method === "GET" && sessionMatch) {
      return reply({ ok: true, session: await migrationSessionDetail(ctx.db, {
        actor: ctx.actor, entitlementTier, migrationSessionId: decodeURIComponent(sessionMatch[1])
      }) });
    }
    const body = await request.json().catch(() => ({}));
    if (request.method === "POST" && path === "/migration/sessions") {
      return reply({ ok: true, session: await createMigrationSession(ctx.db, {
        actor: ctx.actor, entitlementTier, sourceSystem: body.sourceSystem
      }) }, 201);
    }
    const commonPreview = {
      actor: ctx.actor, entitlementTier, filename: body.filename, csv: body.csv,
      columnMap: body.columnMap || {}, delimiter: body.delimiter || ","
    };
    const commonCommit = {
      actor: ctx.actor, entitlementTier, migrationSessionId: body.migrationSessionId,
      preview: body.preview, acknowledgeExistingActivity: body.acknowledgeExistingActivity === true
    };
    if (request.method === "POST" && path === "/migration/chart-of-accounts/preview") {
      return reply({ ok: true, preview: await previewChartOfAccountsCsv(ctx.db, commonPreview) });
    }
    if (request.method === "POST" && path === "/migration/chart-of-accounts/commit") {
      return reply({ ok: true, result: await commitChartOfAccountsImport(ctx.db, { ...commonCommit, typeMap: body.typeMap || {} }) });
    }
    if (request.method === "POST" && path === "/migration/vendors/preview") {
      return reply({ ok: true, preview: await previewVendorCsv(ctx.db, commonPreview) });
    }
    if (request.method === "POST" && path === "/migration/vendors/commit") {
      return reply({ ok: true, result: await commitVendorImport(ctx.db, commonCommit) });
    }
    if (request.method === "POST" && path === "/migration/funds/preview") {
      return reply({ ok: true, preview: await previewFundMapping(ctx.db, commonPreview) });
    }
    if (request.method === "POST" && path === "/migration/funds/commit") {
      return reply({ ok: true, result: await commitFundMapping(ctx.db, {
        ...commonCommit,
        parishId,
        mappings: body.mappings || [],
        newFunds: body.newFunds || [],
        loadCurrentRegistration: async () => (await findRegistrationByParishId(env, parishId))?.registration || null,
        patchParishDashboard: (operation) => dispatchParishDashboardPatch(request, env, parishId, operation)
      }) });
    }
    if (request.method === "POST" && path === "/migration/opening-balance/preview") {
      return reply({ ok: true, preview: await previewOpeningBalanceCsv(ctx.db, {
        ...commonPreview, migrationSessionId: body.migrationSessionId
      }) });
    }
    if (request.method === "POST" && path === "/migration/opening-balance/commit") {
      return reply({ ok: true, entry: await commitOpeningBalanceImport(ctx.db, {
        ...commonCommit, effectiveDate: body.effectiveDate
      }) });
    }
    if (request.method === "POST" && path === "/migration/transaction-history/preview") {
      return reply({ ok: true, preview: await previewTransactionHistoryCsv(ctx.db, {
        ...commonPreview, migrationSessionId: body.migrationSessionId
      }) });
    }
    if (request.method === "POST" && path === "/migration/transaction-history/commit") {
      return reply({ ok: true, progress: await commitTransactionHistoryImport(ctx.db, {
        ...commonCommit, batchSize: body.batchSize, advancedOptIn: body.advancedOptIn === true
      }) });
    }
    return reply({ error: "Not found" }, 404);
  } catch (error) {
    const conflict = Boolean(error?.details?.conflict);
    return reply({
      error: conflict ? "conflict" : "accounting_migration_failed",
      message: error?.message || "Accounting migration request failed.",
      details: error?.details || undefined
    }, conflict ? 409 : 400);
  }
}
