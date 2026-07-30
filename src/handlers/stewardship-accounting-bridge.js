import {
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  unauthorized,
} from "../lib/core.js";
import { accountingEnabledFor, stewardshipToolAccess } from "../lib/entitlements.js";
import { fundActivity, statementOfActivities } from "../accounting/index.js";
import { upsertStewardshipFinancialSnapshot } from "../stewardship/financial-snapshots.js";
import { resolveAccountingDatabaseForParish } from "./accounting-ledger.js";
import { findRegistrationByParishId, verifyParishDashboardBearer } from "./parish.js";

export const STEWARDSHIP_ACCOUNTING_READER = Object.freeze({
  id: "stewardship-financials-bridge",
  type: "system",
  capabilities: Object.freeze(["accounting.reports.view"]),
});

const defaultDependencies = Object.freeze({
  accountingEnabledFor,
  findRegistrationByParishId,
  fundActivity,
  hasProductionStore,
  resolveAccountingDatabaseForParish,
  statementOfActivities,
  stewardshipToolAccess,
  upsertStewardshipFinancialSnapshot,
  verifyParishDashboardBearer,
});

function requestedPeriod(url, body = {}) {
  const currentYear = new Date().getUTCFullYear();
  const year = Number.parseInt(url.searchParams.get("year") || body.fiscalYear || currentYear, 10);
  const startDate = url.searchParams.get("startDate") || body.startDate || `${year}-01-01`;
  const defaultEndDate = year === currentYear ? new Date().toISOString().slice(0, 10) : `${year}-12-31`;
  const endDate = url.searchParams.get("endDate") || body.endDate || defaultEndDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    const error = new Error("Choose a valid accounting date range.");
    error.status = 422;
    throw error;
  }
  return { year, startDate, endDate };
}

export function accountingFinancialSnapshot(statement, funds, { startDate, endDate }) {
  return Object.freeze({
    available: true,
    startDate,
    endDate,
    totalIncomeCents: Number(statement.totals.revenue || 0),
    totalExpenseCents: Number(statement.totals.expenses || 0),
    netCents: Number(statement.totals.changeInNetAssets || 0),
    restrictedFunds: Object.freeze(
      (funds.rows || [])
        .filter((row) => row.restrictionType !== "unrestricted")
        .map((row) => {
          const otherActivity = Number(row.otherActivity || 0);
          // Manual snapshots have only received/disbursed columns. Preserve
          // transfers by folding positive other activity into receipts and
          // negative other activity into disbursements instead of dropping it.
          return Object.freeze({
            fundName: row.name,
            beginningBalanceCents: Number(row.beginningBalance || 0),
            totalReceivedCents: Number(row.revenue || 0) + Math.max(0, otherActivity),
            totalDisbursedCents: Number(row.expenses || 0) + Math.max(0, -otherActivity),
            endingBalanceCents: Number(row.endingBalance || 0),
          });
        }),
    ),
  });
}

async function accountingAvailability(env, parishId, registration, dependencies) {
  if (!dependencies.accountingEnabledFor(registration)) {
    return { available: false, reason: "not_entitled" };
  }
  const resolved = await dependencies.resolveAccountingDatabaseForParish(env, parishId);
  const ready = resolved.entity?.entityStatus === "ready"
    && resolved.registry?.provisioningStatus === "ready"
    && resolved.registry?.healthStatus === "healthy"
    && resolved.db;
  if (!ready) return { available: false, reason: "not_provisioned" };
  return { available: true, db: resolved.db };
}

async function readAccountingSnapshot(env, parishId, registration, period, dependencies) {
  const availability = await accountingAvailability(env, parishId, registration, dependencies);
  if (!availability.available) return availability;
  const [statement, funds] = await Promise.all([
    dependencies.statementOfActivities(availability.db, {
      actor: STEWARDSHIP_ACCOUNTING_READER,
      startDate: period.startDate,
      endDate: period.endDate,
    }),
    dependencies.fundActivity(availability.db, {
      actor: STEWARDSHIP_ACCOUNTING_READER,
      startDate: period.startDate,
      endDate: period.endDate,
    }),
  ]);
  return accountingFinancialSnapshot(statement, funds, period);
}

export async function handleStewardshipAccountingBridge(request, env, parishId, dependencies = {}) {
  const deps = { ...defaultDependencies, ...dependencies };
  if (!deps.hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await deps.findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish not found" }, { status: 404 });
  if (!(await deps.verifyParishDashboardBearer(found.registration, getBearerToken(request)))) return unauthorized();
  if (!deps.stewardshipToolAccess(found.registration)) {
    return json({ error: "Stewardship requires the Stewardship or Parish plan." }, { status: 403 });
  }

  const url = new URL(request.url);
  const importing = url.pathname.endsWith("/financials/import-from-accounting");
  try {
    if (!importing && request.method === "GET") {
      return json(await readAccountingSnapshot(
        env,
        parishId,
        found.registration,
        requestedPeriod(url),
        deps,
      ));
    }
    if (importing && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid JSON" }, { status: 400 });
      const period = requestedPeriod(url, body);
      const snapshot = await readAccountingSnapshot(env, parishId, found.registration, period, deps);
      if (!snapshot.available) {
        const message = snapshot.reason === "not_entitled"
          ? "Accounting is not included in this parish subscription."
          : "Accounting setup is still being finalized.";
        return json({ error: snapshot.reason, message }, { status: 409 });
      }
      const importedAt = new Date().toISOString();
      const saved = await deps.upsertStewardshipFinancialSnapshot(env, {
        parishId,
        annualMeetingId: body.annualMeetingId || null,
        fiscalYear: body.fiscalYear || period.year,
        title: body.title || `${period.year} Financial Snapshot`,
        totalIncomeCents: snapshot.totalIncomeCents,
        totalExpenseCents: snapshot.totalExpenseCents,
        netCents: snapshot.netCents,
        notes: body.notes || "",
        restrictedFunds: snapshot.restrictedFunds,
        importedFromAccountingAt: importedAt,
        replaceRestrictedFunds: true,
        now: importedAt,
      });
      return json({
        ok: true,
        annualMeetingId: saved.annualMeetingId,
        importedFromAccountingAt: importedAt,
        imported: snapshot,
        note: `Pulled from accounting on ${importedAt}. These values can be edited before the meeting packet is finalized.`,
      });
    }
    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: "stewardship_accounting_bridge_failed", message: error?.message || "Unable to read accounting." }, { status: error?.status || 400 });
  }
}
