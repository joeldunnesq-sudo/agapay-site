import { AccountingDatabaseError, ValidationError } from "../errors.js";
import { initializeLedger, ledgerInitializationStatus, validateLedgerFoundation } from "../ledger/service.js";

function requireCapability(actor, capability) {
  if (!actor?.id || !Array.isArray(actor.capabilities) || !actor.capabilities.includes(capability)) throw new AccountingDatabaseError("Accounting capability is required.", { details: { capability } });
}
async function first(db, sql, ...params) { return db.prepare(sql).bind(...params).first(); }
async function all(db, sql, ...params) { return (await db.prepare(sql).bind(...params).all()).results || []; }
async function run(db, sql, ...params) { return db.prepare(sql).bind(...params).run(); }
function boolean(value) { return Boolean(Number(value)); }
function flag(value, fallback) { return (value === undefined ? fallback : Boolean(value)) ? 1 : 0; }

function settingsDto(row) {
  if (!row) return null;
  return Object.freeze({ baseCurrency: row.base_currency, fiscalYearStartMonth: Number(row.fiscal_year_start_month), defaultFundId: row.default_fund_id || "", openingBalancesRequired: boolean(row.opening_balances_required), openingBalancesDisposition: row.opening_balances_disposition, accountNumbersRequired: boolean(row.account_numbers_required), allowCustomAccountNumbers: boolean(row.allow_custom_account_numbers), softCloseOverrideEnabled: boolean(row.soft_close_override_enabled), setupCompleted: Boolean(row.setup_completed_at), setupCompletedAt: row.setup_completed_at || "", version: Number(row.settings_version) });
}

export async function getAccountingSettings(db, { actor } = {}) {
  requireCapability(actor, "accounting.view");
  return settingsDto(await first(db, "SELECT * FROM accounting_settings WHERE id='primary'"));
}

export async function initializeAccountingSetup(db, { actor, date = new Date(), correlationId = "" } = {}) {
  requireCapability(actor, "accounting.configure");
  const initialization = await initializeLedger(db, { actor, date, correlationId });
  await run(db, `INSERT OR IGNORE INTO accounting_settings(id,default_fund_id) SELECT 'primary',id FROM accounting_funds WHERE is_default=1 LIMIT 1`);
  return Object.freeze({ initialization, settings: settingsDto(await first(db, "SELECT * FROM accounting_settings WHERE id='primary'")) });
}

export async function updateAccountingSettings(db, { actor, expectedVersion, patch = {} } = {}) {
  requireCapability(actor, "accounting.configure");
  if (!Number.isInteger(Number(expectedVersion))) throw new ValidationError("expectedVersion is required.");
  const current = await first(db, "SELECT * FROM accounting_settings WHERE id='primary'");
  if (!current || Number(current.settings_version) !== Number(expectedVersion)) throw new AccountingDatabaseError("Accounting settings changed. Reload and try again.", { details: { conflict: true } });
  const currency = String(patch.baseCurrency ?? current.base_currency).trim().toUpperCase();
  const month = Number(patch.fiscalYearStartMonth ?? current.fiscal_year_start_month);
  const disposition = String(patch.openingBalancesDisposition ?? current.opening_balances_disposition);
  if (!/^[A-Z]{3}$/.test(currency) || !Number.isInteger(month) || month < 1 || month > 12) throw new ValidationError("Currency or fiscal-year start month is invalid.");
  if (!['pending','required','deferred','not_applicable','posted'].includes(disposition)) throw new ValidationError("Opening-balance disposition is invalid.");
  const result = await run(db, `UPDATE accounting_settings SET base_currency=?,fiscal_year_start_month=?,opening_balances_required=?,opening_balances_disposition=?,account_numbers_required=?,allow_custom_account_numbers=?,soft_close_override_enabled=?,settings_version=settings_version+1,updated_at=datetime('now') WHERE id='primary' AND settings_version=?`, currency,month,flag(patch.openingBalancesRequired,boolean(current.opening_balances_required)),disposition,flag(patch.accountNumbersRequired,boolean(current.account_numbers_required)),flag(patch.allowCustomAccountNumbers,boolean(current.allow_custom_account_numbers)),flag(patch.softCloseOverrideEnabled,boolean(current.soft_close_override_enabled)),Number(expectedVersion));
  if (!result.meta?.changes) throw new AccountingDatabaseError("Accounting settings changed. Reload and try again.", { details: { conflict: true } });
  return settingsDto(await first(db, "SELECT * FROM accounting_settings WHERE id='primary'"));
}

export async function getAccountingSetupOverview(db, { actor, entitlementTier = "core", databaseStatus = "ready", databaseHealth = "healthy" } = {}) {
  requireCapability(actor, "accounting.view");
  const initialization = await ledgerInitializationStatus(db);
  const settings = settingsDto(await first(db, "SELECT * FROM accounting_settings WHERE id='primary'"));
  const fiscalYear = await first(db, "SELECT id,name,start_date,end_date,status FROM accounting_fiscal_years WHERE is_current=1 LIMIT 1");
  const period = await first(db, "SELECT id,name,start_date,end_date,status FROM accounting_periods WHERE status='open' ORDER BY start_date LIMIT 1");
  const counts = await first(db, `SELECT (SELECT COUNT(*) FROM accounting_accounts WHERE is_active=1) active_accounts,(SELECT COUNT(*) FROM accounting_funds WHERE is_active=1) active_funds,(SELECT COUNT(*) FROM accounting_opening_balance_batches WHERE status='posted') posted_opening_batches`);
  const validation = initialization.operational ? await validateLedgerFoundation(db) : { ok: false, reasonCodes: ["ledger_not_initialized"] };
  const checklist = [
    { id: "database", label: "Secure accounting database ready", complete: databaseStatus === "ready" && databaseHealth === "healthy" },
    { id: "ledger", label: "Ledger initialized", complete: initialization.operational },
    { id: "fiscal_year", label: "Fiscal year confirmed", complete: Boolean(fiscalYear) },
    { id: "accounts", label: "Chart of Accounts reviewed", complete: Number(counts?.active_accounts || 0) > 0 },
    { id: "funds", label: "Funds reviewed", complete: Number(counts?.active_funds || 0) > 0 },
    { id: "opening_balances", label: "Opening balances addressed", complete: ['deferred','not_applicable','posted'].includes(settings?.openingBalancesDisposition) || Number(counts?.posted_opening_batches || 0) > 0 },
    { id: "complete", label: "Accounting setup complete", complete: Boolean(settings?.setupCompleted) }
  ];
  const warnings = [];
  if (databaseStatus !== "ready") warnings.push("database_not_ready");
  if (databaseHealth !== "healthy") warnings.push("database_unhealthy");
  if (!initialization.operational) warnings.push("ledger_not_initialized");
  if (!fiscalYear) warnings.push("current_fiscal_year_missing");
  if (!period) warnings.push("open_period_missing");
  if (!validation.ok) warnings.push(...validation.reasonCodes);
  return Object.freeze({ entitlement: Object.freeze({ included: true, tier: entitlementTier, coreAccountingIncluded: true, advancedOperationsIncluded: entitlementTier === "advanced_operations" }), database: Object.freeze({ status: databaseStatus, health: databaseHealth }), initialization, settings, currentFiscalYear: fiscalYear ? Object.freeze({ name:fiscalYear.name,startDate:fiscalYear.start_date,endDate:fiscalYear.end_date,status:fiscalYear.status }) : null, currentPeriod: period ? Object.freeze({ name:period.name,startDate:period.start_date,endDate:period.end_date,status:period.status }) : null, activeAccountCount:Number(counts?.active_accounts||0), activeFundCount:Number(counts?.active_funds||0), checklist:Object.freeze(checklist), warnings:Object.freeze([...new Set(warnings)]), validation:Object.freeze({ ok:validation.ok, reasonCodes:Object.freeze(validation.reasonCodes || []) }) });
}
