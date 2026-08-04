import { AccountingDatabaseError, ValidationError } from "../errors.js";
import { cents, columnIndexes, csvTable, digest, normalize, text } from "../csv-utils.js";
import { createJournalDraft, postJournalEntry, postOpeningBalanceBatch } from "../ledger/service.js";
import { createVendor } from "../payables/service.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_CATEGORIES = new Set(["asset", "liability", "net_asset", "revenue", "expense"]);
const RESTRICTIONS = new Set(["unrestricted", "board_designated", "donor_restricted_temporary", "donor_restricted_permanent"]);
const SESSION_SOURCES = new Set(["quickbooks", "aplos", "other"]);
const AP_LIMITATION = "General-ledger history reconstructs balances only. It does not recreate the accounts-payable subledger, bill aging, or linked bill/payment history. Enter open unpaid bills through Payables after cutover.";
const STEP_COLUMNS = Object.freeze({
  chartOfAccounts: "chart_of_accounts_status",
  vendors: "vendors_status",
  funds: "fund_mapping_status",
  openingBalance: "opening_balance_status",
  transactionHistory: "transaction_history_status"
});
const TYPE_SUGGESTIONS = Object.freeze({
  bank: "asset", "accounts receivable": "asset", "other current asset": "asset", "fixed asset": "asset",
  "accounts payable": "liability", "credit card": "liability", "other current liability": "liability", "long term liability": "liability",
  equity: "net_asset", income: "revenue", revenue: "revenue", "cost of goods sold": "expense", expense: "expense", "other expense": "expense"
});

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const first = async (db, sql, ...params) => db.prepare(sql).bind(...params).first();
const all = async (db, sql, ...params) => (await db.prepare(sql).bind(...params).all()).results || [];
const run = async (db, sql, ...params) => db.prepare(sql).bind(...params).run();
const withCapabilities = (actor, ...capabilities) => ({
  ...actor,
  capabilities: [...new Set([...(actor?.capabilities || []), ...capabilities])]
});

function columnIndexWithAliases(normalizedHeaders, configuredHeader, aliases) {
  const configuredIndex = normalizedHeaders.indexOf(normalize(configuredHeader));
  if (configuredIndex >= 0) return configuredIndex;
  for (const alias of aliases) {
    const index = normalizedHeaders.indexOf(normalize(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function requireMigration(actor, entitlementTier) {
  if (!actor?.id || !actor.capabilities?.includes("accounting.migration.import")) {
    throw new AccountingDatabaseError("Accounting migration import capability is required.", { details: { capability: "accounting.migration.import" } });
  }
  if (!["mission", "parish"].includes(entitlementTier)) throw new AccountingDatabaseError("Accounting migration is not included for this parish.");
}

function sessionDto(row) {
  return row && Object.freeze({
    id: row.id,
    sourceSystem: row.source_system,
    status: row.status,
    chartOfAccountsStatus: row.chart_of_accounts_status,
    vendorsStatus: row.vendors_status,
    fundMappingStatus: row.fund_mapping_status,
    openingBalanceStatus: row.opening_balance_status,
    transactionHistoryStatus: row.transaction_history_status,
    createdAt: row.created_at,
    completedAt: row.completed_at || "",
    version: Number(row.version)
  });
}

async function migrationSession(db, migrationSessionId, { allowCompleted = false } = {}) {
  const session = await first(db, "SELECT * FROM accounting_migration_sessions WHERE id=?", migrationSessionId);
  if (!session || (session.status !== "in_progress" && !(allowCompleted && session.status === "completed"))) {
    throw new ValidationError("An active migration session is required.");
  }
  return session;
}

async function updateStep(db, migrationSessionId, step, status) {
  const column = STEP_COLUMNS[step];
  if (!column || !["not_started", "in_progress", "completed", "skipped"].includes(status)) throw new ValidationError("Migration step status is invalid.");
  await run(db, `UPDATE accounting_migration_sessions SET ${column}=?,version=version+1 WHERE id=? AND status='in_progress'`, status, migrationSessionId);
}

async function completeSessionIfReady(db, migrationSessionId) {
  await run(db, `UPDATE accounting_migration_sessions
    SET status='completed',completed_at=datetime('now'),version=version+1
    WHERE id=? AND status='in_progress'
      AND chart_of_accounts_status='completed'
      AND vendors_status IN('completed','skipped')
      AND fund_mapping_status IN('completed','skipped')
      AND (opening_balance_status='completed' OR transaction_history_status='completed')`, migrationSessionId);
}

async function assertMigrationCommitSafe(db, { acknowledgeExistingActivity = false, migrationSessionId = "" } = {}) {
  const activity = await first(db, `SELECT COUNT(*) count FROM accounting_journal_entries
    WHERE status='posted'
      AND source_type NOT IN('initialization','ledger_initialization','system_seed','seed')
      AND NOT(source_type='migration_import' AND correlation_id=?)`, migrationSessionId || "");
  if (Number(activity?.count || 0) > 0 && acknowledgeExistingActivity !== true) {
    throw new ValidationError("This ledger already contains posted activity. Importing may double-count balances. Review the ledger and explicitly acknowledge existing activity to continue.", { details: { requiresExistingActivityAcknowledgement: true } });
  }
  return true;
}

export async function createMigrationSession(db, { actor, entitlementTier, sourceSystem }) {
  requireMigration(actor, entitlementTier);
  if (!SESSION_SOURCES.has(sourceSystem)) throw new ValidationError("Choose QuickBooks, Aplos, or Other.");
  const existing = await first(db, "SELECT * FROM accounting_migration_sessions WHERE status='in_progress' ORDER BY created_at DESC LIMIT 1");
  if (existing) return sessionDto(existing);
  const sessionId = id("migration");
  await run(db, `INSERT INTO accounting_migration_sessions(id,source_system,created_by_actor_type,created_by_actor_id)
    VALUES(?,?,?,?)`, sessionId, sourceSystem, actor.type || "platform_user", actor.id);
  return sessionDto(await first(db, "SELECT * FROM accounting_migration_sessions WHERE id=?", sessionId));
}

export async function listMigrationSessions(db, { actor, entitlementTier }) {
  requireMigration(actor, entitlementTier);
  return Object.freeze((await all(db, "SELECT * FROM accounting_migration_sessions ORDER BY created_at DESC")).map(sessionDto));
}

export async function migrationSessionDetail(db, { actor, entitlementTier, migrationSessionId }) {
  requireMigration(actor, entitlementTier);
  const row = await first(db, "SELECT * FROM accounting_migration_sessions WHERE id=?", migrationSessionId);
  if (!row) throw new ValidationError("Migration session was not found.");
  return sessionDto(row);
}

function chartColumns(table, columnMap) {
  return columnIndexes(table.normalizedHeaders, columnMap, {
    sourceRef: "account id", accountNumber: "account number", name: "account name", type: "account type", description: "description"
  });
}

export async function previewChartOfAccountsCsv(db, { actor, entitlementTier, filename, csv, columnMap = {}, delimiter = "," }) {
  requireMigration(actor, entitlementTier);
  const table = csvTable({ filename, csv, delimiter }), indexes = chartColumns(table, columnMap);
  const existing = await all(db, "SELECT id,account_number,name FROM accounting_accounts");
  const rows = [], errors = [], sourceTypes = new Set();
  for (let index = 0; index < table.rows.length; index++) {
    const raw = table.rows[index], rowNumber = index + 2;
    const accountNumber = indexes.accountNumber >= 0 ? text(raw[indexes.accountNumber]) : "";
    const name = indexes.name >= 0 ? text(raw[indexes.name]) : "";
    const sourceType = indexes.type >= 0 ? text(raw[indexes.type]) : "";
    const sourceAccountRef = indexes.sourceRef >= 0 ? text(raw[indexes.sourceRef]) : (accountNumber || name);
    if (!sourceAccountRef || !name || !sourceType) {
      errors.push({ rowNumber, code: "missing_required_account_fields", message: "Account reference, name, and source type are required." });
      continue;
    }
    sourceTypes.add(sourceType);
    const match = existing.find((item) => (accountNumber && item.account_number === accountNumber) || normalize(item.name) === normalize(name));
    rows.push({
      rowNumber, sourceAccountRef, accountNumber, name, sourceType,
      description: indexes.description >= 0 ? text(raw[indexes.description]) : "",
      action: match ? "willLink" : "willCreate",
      agapayAccountId: match?.id || ""
    });
  }
  const distinctSourceTypes = [...sourceTypes].sort();
  return Object.freeze({
    filename, fileHash: await digest(csv), rowCount: table.rows.length,
    validRows: rows.length, invalidRows: errors.length, rows: Object.freeze(rows), errors: Object.freeze(errors),
    distinctSourceTypes: Object.freeze(distinctSourceTypes),
    suggestedTypeMap: Object.freeze(Object.fromEntries(distinctSourceTypes.map((label) => [label, TYPE_SUGGESTIONS[normalize(label)] || ""]))),
    typeMappingRequiresConfirmation: true
  });
}

export async function commitChartOfAccountsImport(db, { actor, entitlementTier, migrationSessionId, preview, typeMap = {}, acknowledgeExistingActivity = false }) {
  requireMigration(actor, entitlementTier);
  await migrationSession(db, migrationSessionId);
  await assertMigrationCommitSafe(db, { acknowledgeExistingActivity, migrationSessionId });
  if (!preview?.rows?.length || Number(preview.invalidRows || 0) > 0) throw new ValidationError("Resolve every chart-of-accounts CSV error before committing.");
  const missing = [...new Set(preview.rows.map((row) => row.sourceType))].filter((label) => !ACCOUNT_CATEGORIES.has(typeMap[label]));
  if (missing.length) throw new ValidationError(`Confirm an AGAPAY account category for: ${missing.join(", ")}. Unrecognized source types are never classified automatically.`);
  await updateStep(db, migrationSessionId, "chartOfAccounts", "in_progress");
  let created = 0, linked = 0;
  for (const item of preview.rows) {
    const accounts = await all(db, "SELECT id,account_number,name FROM accounting_accounts");
    let account = accounts.find((candidate) => (item.accountNumber && candidate.account_number === item.accountNumber) || normalize(candidate.name) === normalize(item.name));
    if (!account) {
      const type = await first(db, "SELECT id,normal_balance FROM accounting_account_types WHERE category=?", typeMap[item.sourceType]);
      if (!type) throw new ValidationError(`AGAPAY account category ${typeMap[item.sourceType]} is unavailable.`);
      const accountNumber = item.accountNumber || `MIG-${(await digest(item.sourceAccountRef)).slice(0, 10).toUpperCase()}`;
      const accountId = id("acct");
      await run(db, `INSERT INTO accounting_accounts(id,account_number,name,description,account_type_id,normal_balance,is_posting_account,is_system,is_active,requires_fund,cash_flow_classification)
        VALUES(?,?,?,?,?,?,1,0,1,1,'operating')`, accountId, accountNumber, item.name, item.description || null, type.id, type.normal_balance);
      account = { id: accountId };
      created++;
    } else {
      linked++;
    }
    await run(db, `INSERT INTO accounting_migration_account_map(migration_session_id,source_account_ref,agapay_account_id)
      VALUES(?,?,?) ON CONFLICT(migration_session_id,source_account_ref) DO UPDATE SET agapay_account_id=excluded.agapay_account_id`,
    migrationSessionId, item.sourceAccountRef, account.id);
  }
  await updateStep(db, migrationSessionId, "chartOfAccounts", "completed");
  return Object.freeze({ created, linked, mapped: created + linked });
}

export async function previewVendorCsv(db, { actor, entitlementTier, filename, csv, columnMap = {}, delimiter = "," }) {
  requireMigration(actor, entitlementTier);
  const table = csvTable({ filename, csv, delimiter });
  const indexes = columnIndexes(table.normalizedHeaders, columnMap, {
    displayName: "vendor name", legalName: "legal name", email: "email", phone: "phone",
    taxIdLast4: "tax id last 4", taxClassification: "tax classification"
  });
  indexes.displayName = columnIndexWithAliases(
    table.normalizedHeaders,
    columnMap?.displayName || "vendor name",
    ["vendor name", "vendor"]
  );
  const existing = await all(db, "SELECT id,display_name FROM accounting_vendors");
  const rows = [], errors = [], importedVendorNames = new Set();
  for (let index = 0; index < table.rows.length; index++) {
    const raw = table.rows[index], rowNumber = index + 2;
    const displayName = indexes.displayName >= 0 ? text(raw[indexes.displayName]) : "";
    const taxIdLast4 = indexes.taxIdLast4 >= 0 ? text(raw[indexes.taxIdLast4]) : "";
    if (!displayName || (taxIdLast4 && !/^\d{1,4}$/.test(taxIdLast4))) {
      errors.push({ rowNumber, code: !displayName ? "missing_vendor_name" : "invalid_tax_id_last_four" });
      continue;
    }
    const normalizedDisplayName = normalize(displayName);
    const duplicate = existing.find((vendor) => normalize(vendor.display_name) === normalizedDisplayName);
    const duplicateInFile = importedVendorNames.has(normalizedDisplayName);
    rows.push({
      rowNumber, displayName,
      legalName: indexes.legalName >= 0 ? text(raw[indexes.legalName]) : "",
      email: indexes.email >= 0 ? text(raw[indexes.email]) : "",
      phone: indexes.phone >= 0 ? text(raw[indexes.phone]) : "",
      taxIdLast4,
      taxClassification: indexes.taxClassification >= 0 ? text(raw[indexes.taxClassification]) : "",
      action: duplicate || duplicateInFile ? "willSkip" : "willCreate",
      existingVendorId: duplicate?.id || ""
    });
    importedVendorNames.add(normalizedDisplayName);
  }
  return Object.freeze({ filename, fileHash: await digest(csv), rowCount: table.rows.length, validRows: rows.length, invalidRows: errors.length, rows: Object.freeze(rows), errors: Object.freeze(errors) });
}

export async function commitVendorImport(db, { actor, entitlementTier, migrationSessionId, preview, acknowledgeExistingActivity = false }) {
  requireMigration(actor, entitlementTier);
  await migrationSession(db, migrationSessionId);
  await assertMigrationCommitSafe(db, { acknowledgeExistingActivity, migrationSessionId });
  if (!preview?.rows || Number(preview.invalidRows || 0) > 0) throw new ValidationError("Resolve every vendor CSV error before committing.");
  await updateStep(db, migrationSessionId, "vendors", "in_progress");
  let created = 0, skipped = 0;
  for (const item of preview.rows) {
    const duplicate = await all(db, "SELECT id,display_name FROM accounting_vendors");
    if (item.action === "willSkip" || duplicate.some((vendor) => normalize(vendor.display_name) === normalize(item.displayName))) {
      skipped++;
      continue;
    }
    await createVendor(db, {
      actor: withCapabilities(actor, "ap.enter"), entitlementTier: "parish",
      input: {
        displayName: item.displayName, legalName: item.legalName, email: item.email, phone: item.phone,
        taxIdLast4: item.taxIdLast4, taxClassification: item.taxClassification,
        requires1099Review: Boolean(item.taxIdLast4 || item.taxClassification)
      }
    });
    created++;
  }
  await updateStep(db, migrationSessionId, "vendors", "completed");
  return Object.freeze({ created, skipped });
}

export async function previewFundMapping(db, { actor, entitlementTier, filename, csv, columnMap = {}, delimiter = "," }) {
  requireMigration(actor, entitlementTier);
  const table = csvTable({ filename, csv, delimiter });
  const indexes = columnIndexes(table.normalizedHeaders, columnMap, { sourceRef: "fund id", name: "fund name" });
  const existing = await all(db, "SELECT id,name,restriction_type FROM accounting_funds WHERE is_active=1 AND archived_at IS NULL");
  const rows = [], errors = [];
  for (let index = 0; index < table.rows.length; index++) {
    const raw = table.rows[index], rowNumber = index + 2;
    const name = indexes.name >= 0 ? text(raw[indexes.name]) : "";
    const sourceFundRef = indexes.sourceRef >= 0 ? text(raw[indexes.sourceRef]) : name;
    if (!name || !sourceFundRef) {
      errors.push({ rowNumber, code: "missing_fund_fields" });
      continue;
    }
    const match = existing.find((fund) => normalize(fund.name) === normalize(name));
    rows.push({ rowNumber, sourceFundRef, name, status: match ? "matched" : "unmatched", agapayFundId: match?.id || "", restrictionType: match?.restriction_type || "" });
  }
  return Object.freeze({
    filename, fileHash: await digest(csv), rowCount: table.rows.length, validRows: rows.length, invalidRows: errors.length,
    rows: Object.freeze(rows), errors: Object.freeze(errors),
    restrictionDecisionRequiredForUnmatched: true
  });
}

export async function commitFundMapping(db, {
  actor, entitlementTier, migrationSessionId, parishId, mappings = [], newFunds = [],
  acknowledgeExistingActivity = false, loadCurrentRegistration, patchParishDashboard
}) {
  requireMigration(actor, entitlementTier);
  await migrationSession(db, migrationSessionId);
  await assertMigrationCommitSafe(db, { acknowledgeExistingActivity, migrationSessionId });
  if (typeof loadCurrentRegistration !== "function" || typeof patchParishDashboard !== "function") throw new ValidationError("Funds & Alms synchronization is unavailable.");
  await updateStep(db, migrationSessionId, "funds", "in_progress");
  const current = await loadCurrentRegistration();
  if (!current) throw new ValidationError("The current parish registration could not be loaded.");
  const additions = [];
  for (const item of newFunds) {
    if (!item.sourceFundRef || !text(item.displayName) || !RESTRICTIONS.has(item.restrictionType)) {
      throw new ValidationError("Every new fund requires a source reference, display name, and confirmed restriction type.");
    }
    additions.push({
      id: `migration-${(await digest(`${migrationSessionId}:${item.sourceFundRef}`)).slice(0, 20)}`,
      name: text(item.displayName),
      restrictionType: item.restrictionType,
      donorRestricted: Boolean(item.donorRestricted),
      accountNumber: text(item.accountNumber)
    });
  }
  const currentFunds = Array.isArray(current.funds) ? current.funds : [];
  const funds = [...currentFunds];
  for (const addition of additions) if (!funds.some((fund) => normalize(fund.name) === normalize(addition.name))) funds.push(addition);
  const path = `/api/parish/dashboard/${encodeURIComponent(parishId)}`;
  const response = await patchParishDashboard({
    method: "PATCH", path,
    body: {
      funds,
      campaigns: Array.isArray(current.campaigns) ? current.campaigns : [],
      feastCampaigns: Array.isArray(current.feastCampaigns) ? current.feastCampaigns : []
    }
  });
  if (!response?.ok || response.accountingCatalogConnected === false || response.accountingCatalog?.available === false) {
    throw new ValidationError("Funds & Alms could not synchronize with Accounting. No migration fund mappings were recorded.");
  }
  const finalFunds = await all(db, "SELECT id,name FROM accounting_funds WHERE is_active=1 AND archived_at IS NULL");
  const complete = [...mappings.filter((item) => item.agapayFundId), ...newFunds.map((item) => {
    const match = finalFunds.find((fund) => normalize(fund.name) === normalize(item.displayName));
    return { sourceFundRef: item.sourceFundRef, agapayFundId: match?.id || "" };
  })];
  if (complete.some((item) => !item.sourceFundRef || !item.agapayFundId)) throw new ValidationError("A synchronized fund could not be resolved. No migration fund mappings were recorded.");
  for (const item of complete) {
    await run(db, `INSERT INTO accounting_migration_fund_map(migration_session_id,source_fund_ref,agapay_fund_id)
      VALUES(?,?,?) ON CONFLICT(migration_session_id,source_fund_ref) DO UPDATE SET agapay_fund_id=excluded.agapay_fund_id`,
    migrationSessionId, item.sourceFundRef, item.agapayFundId);
  }
  await updateStep(db, migrationSessionId, "funds", "completed");
  return Object.freeze({ mapped: complete.length, existingFundCount: currentFunds.length, addedFundCount: additions.length });
}

async function accountAndFundMaps(db, migrationSessionId) {
  const accounts = await all(db, "SELECT source_account_ref,agapay_account_id FROM accounting_migration_account_map WHERE migration_session_id=?", migrationSessionId);
  const funds = await all(db, "SELECT source_fund_ref,agapay_fund_id FROM accounting_migration_fund_map WHERE migration_session_id=?", migrationSessionId);
  return {
    accounts: new Map(accounts.map((item) => [item.source_account_ref, item.agapay_account_id])),
    funds: new Map(funds.map((item) => [item.source_fund_ref, item.agapay_fund_id]))
  };
}

export async function previewOpeningBalanceCsv(db, { actor, entitlementTier, filename, csv, columnMap = {}, migrationSessionId, delimiter = "," }) {
  requireMigration(actor, entitlementTier);
  await migrationSession(db, migrationSessionId);
  const table = csvTable({ filename, csv, delimiter });
  const indexes = columnIndexes(table.normalizedHeaders, columnMap, { accountRef: "account", debit: "debit", credit: "credit", fundRef: "fund" });
  const maps = await accountAndFundMaps(db, migrationSessionId), rows = [], errors = [];
  let totalDebits = 0, totalCredits = 0;
  for (let index = 0; index < table.rows.length; index++) {
    const raw = table.rows[index], rowNumber = index + 2, accountRef = indexes.accountRef >= 0 ? text(raw[indexes.accountRef]) : "";
    const accountId = maps.accounts.get(accountRef);
    const fundRef = indexes.fundRef >= 0 ? text(raw[indexes.fundRef]) : "";
    const fundId = fundRef ? maps.funds.get(fundRef) : "fund_general";
    try {
      const debit = indexes.debit >= 0 && text(raw[indexes.debit]) ? Math.abs(cents(raw[indexes.debit], "Debit")) : 0;
      const credit = indexes.credit >= 0 && text(raw[indexes.credit]) ? Math.abs(cents(raw[indexes.credit], "Credit")) : 0;
      if (!accountId) throw new Error("unmapped_account");
      if (!fundId) throw new Error("unmapped_fund");
      if ((debit > 0) === (credit > 0)) throw new Error("invalid_amount");
      rows.push({ rowNumber, accountRef, accountId, fundRef, fundId, debitAmount: debit, creditAmount: credit });
      totalDebits += debit;
      totalCredits += credit;
    } catch (error) {
      errors.push({ rowNumber, code: error.message || "invalid_row" });
    }
  }
  return Object.freeze({
    filename, fileHash: await digest(csv), rowCount: table.rows.length, rows: Object.freeze(rows), errors: Object.freeze(errors),
    validRows: rows.length, invalidRows: errors.length, totalDebits, totalCredits,
    balanced: rows.length >= 2 && totalDebits > 0 && totalDebits === totalCredits,
    eligibleToCommit: errors.length === 0 && rows.length >= 2 && totalDebits > 0 && totalDebits === totalCredits
  });
}

export async function commitOpeningBalanceImport(db, {
  actor, entitlementTier, migrationSessionId, preview, effectiveDate, acknowledgeExistingActivity = false
}) {
  requireMigration(actor, entitlementTier);
  const session = await migrationSession(db, migrationSessionId, { allowCompleted: true });
  await assertMigrationCommitSafe(db, { acknowledgeExistingActivity, migrationSessionId });
  if (!DATE.test(effectiveDate || "")) throw new ValidationError("A valid opening-balance effective date is required.");
  if (!preview?.eligibleToCommit || preview.errors?.length || preview.totalDebits !== preview.totalCredits) {
    throw new ValidationError("The opening-balance CSV must be error-free and balanced before commit.");
  }
  await updateStep(db, migrationSessionId, "openingBalance", "in_progress");
  const key = `migration-opening:${migrationSessionId}:${preview.fileHash}`;
  const entry = await postOpeningBalanceBatch(db, {
    actor: withCapabilities(actor, "accounting.opening_balances.manage"),
    effectiveDate,
    description: `${session.source_system === "quickbooks" ? "QuickBooks" : session.source_system === "aplos" ? "Aplos" : "Legacy system"} opening balances`,
    lines: preview.rows.map((row) => ({
      accountId: row.accountId, fundId: row.fundId,
      debitAmount: row.debitAmount, creditAmount: row.creditAmount,
      description: `Migration row ${row.rowNumber}`
    })),
    idempotencyKey: key,
    requestHash: await digest(preview),
    sourceSystem: session.source_system,
    correlationId: migrationSessionId
  });
  await updateStep(db, migrationSessionId, "openingBalance", "completed");
  await completeSessionIfReady(db, migrationSessionId);
  return entry;
}

export async function previewTransactionHistoryCsv(db, {
  actor, entitlementTier, filename, csv, columnMap = {}, migrationSessionId, delimiter = ","
}) {
  requireMigration(actor, entitlementTier);
  await migrationSession(db, migrationSessionId);
  const table = csvTable({ filename, csv, delimiter, maxRows: 25_000, maxBytes: 5_000_000 });
  const indexes = columnIndexes(table.normalizedHeaders, columnMap, {
    date: "date", accountRef: "account", debit: "debit", credit: "credit",
    memo: "memo", description: "description", fundRef: "fund", groupRef: "transaction id"
  });
  const groupingMethod = indexes.groupRef >= 0 ? "explicit_id" : "date_and_memo_heuristic";
  const maps = await accountAndFundMaps(db, migrationSessionId), valid = [], errors = [];
  for (let index = 0; index < table.rows.length; index++) {
    const raw = table.rows[index], rowNumber = index + 2;
    try {
      const date = indexes.date >= 0 ? text(raw[indexes.date]) : "";
      const accountRef = indexes.accountRef >= 0 ? text(raw[indexes.accountRef]) : "";
      const accountId = maps.accounts.get(accountRef);
      const fundRef = indexes.fundRef >= 0 ? text(raw[indexes.fundRef]) : "";
      const fundId = fundRef ? maps.funds.get(fundRef) : "fund_general";
      const debit = indexes.debit >= 0 && text(raw[indexes.debit]) ? Math.abs(cents(raw[indexes.debit], "Debit")) : 0;
      const credit = indexes.credit >= 0 && text(raw[indexes.credit]) ? Math.abs(cents(raw[indexes.credit], "Credit")) : 0;
      const memo = indexes.memo >= 0 ? text(raw[indexes.memo]) : "";
      const description = indexes.description >= 0 ? text(raw[indexes.description]) : memo;
      const explicitGroup = indexes.groupRef >= 0 ? text(raw[indexes.groupRef]) : "";
      if (!DATE.test(date)) throw new Error("invalid_date");
      if (!accountId) throw new Error("unmapped_account");
      if (!fundId) throw new Error("unmapped_fund");
      if ((debit > 0) === (credit > 0)) throw new Error("invalid_amount");
      if (groupingMethod === "explicit_id" && !explicitGroup) throw new Error("missing_transaction_group");
      if (groupingMethod !== "explicit_id" && !memo) throw new Error("missing_grouping_memo");
      valid.push({ rowNumber, date, accountRef, accountId, fundRef, fundId, debitAmount: debit, creditAmount: credit, memo, description, explicitGroup, raw });
    } catch (error) {
      errors.push({ rowNumber, code: error.message || "invalid_row" });
    }
  }
  const groups = [];
  for (const item of valid) {
    const key = groupingMethod === "explicit_id" ? item.explicitGroup : `${item.date}|${item.memo}`;
    let group = groupingMethod === "explicit_id" ? groups.find((candidate) => candidate.groupRef === key) : groups.at(-1);
    if (!group || (groupingMethod !== "explicit_id" && group.groupRef !== key)) {
      group = { groupRef: key, date: item.date, memo: item.memo || item.description || "Imported transaction", rows: [] };
      groups.push(group);
    }
    group.rows.push(item);
  }
  for (const group of groups) {
    group.totalDebits = group.rows.reduce((sum, row) => sum + row.debitAmount, 0);
    group.totalCredits = group.rows.reduce((sum, row) => sum + row.creditAmount, 0);
    group.balanced = group.rows.length >= 2 && group.totalDebits > 0 && group.totalDebits === group.totalCredits;
    group.sourceHash = await digest(group.rows.map((row) => row.raw));
    if (!group.balanced) errors.push({ groupRef: group.groupRef, code: "unbalanced_transaction_group" });
    delete group.rows[0]?.raw;
    for (const row of group.rows) delete row.raw;
  }
  return Object.freeze({
    filename, fileHash: await digest(csv), rowCount: table.rows.length, validRows: valid.length, invalidRows: errors.filter((error) => error.rowNumber).length,
    groupingMethod,
    groupingExplanation: groupingMethod === "explicit_id"
      ? "Rows are grouped by the mapped transaction identifier."
      : "No transaction identifier was mapped, so consecutive rows with the same date and non-empty memo are grouped together.",
    accountsPayableLimitation: AP_LIMITATION,
    advancedOptInRequired: true,
    groups: Object.freeze(groups), errors: Object.freeze(errors),
    eligibleGroups: groups.filter((group) => group.balanced).length
  });
}

export async function commitTransactionHistoryImport(db, {
  actor, entitlementTier, migrationSessionId, preview, batchSize = 200,
  acknowledgeExistingActivity = false, advancedOptIn = false
}) {
  requireMigration(actor, entitlementTier);
  await migrationSession(db, migrationSessionId, { allowCompleted: true });
  await assertMigrationCommitSafe(db, { acknowledgeExistingActivity, migrationSessionId });
  if (advancedOptIn !== true) throw new ValidationError(`Full transaction history is advanced and requires explicit opt-in. ${AP_LIMITATION}`);
  const limit = Math.max(1, Math.min(500, Number(batchSize) || 200));
  const eligible = (preview?.groups || []).filter((group) => group.balanced);
  if (!eligible.length) throw new ValidationError("No balanced transaction groups are eligible to import.");
  await updateStep(db, migrationSessionId, "transactionHistory", "in_progress");
  const errors = [], elevated = withCapabilities(actor, "accounting.journals.create", "accounting.journals.post");
  let attempted = 0;
  for (const group of eligible) {
    const existing = await first(db, "SELECT id,status,version FROM accounting_journal_entries WHERE source_type='migration_import' AND source_id=?", group.sourceHash);
    if (existing?.status === "posted") continue;
    if (attempted >= limit) break;
    attempted++;
    try {
      const draft = existing || await createJournalDraft(db, {
          actor: elevated, entryDate: group.date, description: group.memo || "Imported transaction",
          sourceType: "migration_import", sourceId: group.sourceHash, correlationId: migrationSessionId,
          lines: group.rows.map((row) => ({
            accountId: row.accountId, fundId: row.fundId, debitAmount: row.debitAmount,
            creditAmount: row.creditAmount, description: row.description || group.memo
          }))
        });
      await postJournalEntry(db, {
        actor: elevated, journalEntryId: draft.id,
        idempotencyKey: `migration:${migrationSessionId}:${group.sourceHash}`,
        requestHash: await digest(group), expectedVersion: Number(draft.version || 1), correlationId: migrationSessionId
      });
    } catch (error) {
      errors.push({ groupRef: group.groupRef, message: error?.message || "Transaction group failed." });
    }
  }
  let processed = 0;
  for (const group of eligible) {
    if (await first(db, "SELECT id FROM accounting_journal_entries WHERE source_type='migration_import' AND source_id=? AND status='posted'", group.sourceHash)) processed++;
  }
  if (processed === eligible.length && errors.length === 0) {
    await updateStep(db, migrationSessionId, "transactionHistory", "completed");
    await completeSessionIfReady(db, migrationSessionId);
  }
  return Object.freeze({
    processed, total: eligible.length, remaining: Math.max(0, eligible.length - processed), errors: Object.freeze(errors),
    complete: processed === eligible.length && errors.length === 0,
    accountsPayableLimitation: AP_LIMITATION
  });
}
