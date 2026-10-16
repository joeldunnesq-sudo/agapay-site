// Generated from src/accounting/close/service-shared.ts by npm run build:server. Do not edit.
import { AccountingDatabaseError, ValidationError } from '../errors.js';
import {
  createJournalDraft,
  postJournalEntry,
  reverseJournalEntry,
  validateLedgerFoundation,
} from '../ledger/service.js';
import {
  fundActivity,
  reportCsv,
  statementOfActivities,
  statementOfFinancialPosition,
  trialBalance,
} from '../reports/service.js';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ADJUSTMENT_TYPES = /* @__PURE__ */ new Set([
  'accrual',
  'deferral',
  'prepaid_expense',
  'accrued_expense',
  'accrued_revenue',
  'reclassification',
  'correction',
  'fund_reclassification',
  'bank_adjustment',
  'inventory_adjustment',
  'accounts_payable_adjustment',
  'other',
]);
const CORE_CHECKS = Object.freeze([
  ['ledger.trial_balance', 'Ledger', 'Trial Balance balances', 'critical', 1],
  ['ledger.integrity', 'Ledger', 'Ledger integrity is healthy', 'critical', 1],
  ['journals.open_drafts', 'Journals', 'Open journal drafts reviewed', 'warning', 0],
  ['bank.required_reconciliations', 'Bank', 'Required bank accounts reconciled', 'error', 1],
  ['integrations.exceptions', 'Integrations', 'Integration exceptions reviewed', 'warning', 0],
  ['reports.validation', 'Reports', 'Core financial reports validate', 'critical', 1],
]);
const ADVANCED_CHECKS = Object.freeze([
  ['payables.review', 'Payables', 'Open and overdue payables reviewed', 'warning', 0],
  ['budgets.review', 'Budgets', 'Budget-to-actual reviewed', 'warning', 0],
  ['commerce.review', 'Commerce', 'Commerce, tax, and inventory exceptions reviewed', 'warning', 0],
]);
function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}
function now() {
  return /* @__PURE__ */ new Date().toISOString();
}
function text(value) {
  return String(value ?? '').trim();
}
async function first(db, sql, ...params) {
  return db
    .prepare(sql)
    .bind(...params)
    .first();
}
async function all(db, sql, ...params) {
  return (
    (
      await db
        .prepare(sql)
        .bind(...params)
        .all()
    ).results || []
  );
}
async function run(db, sql, ...params) {
  return db
    .prepare(sql)
    .bind(...params)
    .run();
}
function capability(actor, name) {
  if (!actor?.id || !actor.capabilities?.includes(name))
    throw new AccountingDatabaseError('Accounting close capability is required.', { details: { capability: name } });
}
function entitled(tier) {
  if (!['mission', 'parish'].includes(tier))
    throw new AccountingDatabaseError('Mission or Parish Accounting is required.');
}
function elevated(actor) {
  return {
    ...actor,
    capabilities: [
      .../* @__PURE__ */ new Set([
        ...(actor.capabilities || []),
        'accounting.journals.create',
        'accounting.journals.post',
        'accounting.journals.reverse',
        'accounting.view',
      ]),
    ],
  };
}
async function digest(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
}
function closeDto(row) {
  return Object.freeze({
    id: row.id,
    closeType: row.close_type,
    fiscalYearId: row.fiscal_year_id,
    accountingPeriodId: row.accounting_period_id || '',
    status: row.status,
    initiatedBy: row.initiated_by_actor_id,
    reviewedBy: row.reviewed_by_actor_id || '',
    approvedBy: row.approved_by_actor_id || '',
    startedAt: row.started_at,
    lastValidatedAt: row.last_validated_at || '',
    completedAt: row.completed_at || '',
    reopenedAt: row.reopened_at || '',
    version: Number(row.version),
    correlationId: row.correlation_id || '',
  });
}
function checkDto(row) {
  return Object.freeze({
    id: row.id,
    code: row.check_code,
    category: row.category,
    label: row.label,
    description: row.description || '',
    origin: row.check_origin,
    status: row.status,
    severity: row.severity,
    blocking: Boolean(row.blocking),
    details: row.details_json ? JSON.parse(row.details_json) : {},
    resolutionNote: row.resolution_note || '',
    version: Number(row.version),
  });
}
async function evaluateChecks(db, session, tier, actor) {
  const year = await first(db, 'SELECT * FROM accounting_fiscal_years WHERE id=?', session.fiscal_year_id);
  const period = session.accounting_period_id
    ? await first(db, 'SELECT * FROM accounting_periods WHERE id=?', session.accounting_period_id)
    : null;
  const startDate = period?.start_date || year.start_date,
    endDate = period?.end_date || year.end_date;
  const tb = await trialBalance(db, { actor: elevated(actor), startDate, endDate, includeZero: true });
  const ledger = await validateLedgerFoundation(db);
  const drafts = await first(
    db,
    "SELECT COUNT(*) count FROM accounting_journal_entries WHERE status IN ('draft','pending') AND entry_date BETWEEN ? AND ?",
    startDate,
    endDate
  );
  const exceptions = await first(
    db,
    "SELECT COUNT(*) count FROM accounting_integration_source_events WHERE status='exception' AND date(occurred_at) BETWEEN ? AND ?",
    startDate,
    endDate
  );
  const requiredRecon = await first(
    db,
    `SELECT COUNT(*) count FROM accounting_bank_accounts b WHERE b.is_active=1 AND NOT EXISTS(SELECT 1 FROM accounting_reconciliation_sessions r WHERE r.bank_account_id=b.id AND r.status='completed' AND r.statement_end_date>=?)`,
    endDate
  );
  const position = await statementOfFinancialPosition(db, { actor: elevated(actor), asOfDate: endDate });
  const activities = await statementOfActivities(db, { actor: elevated(actor), startDate, endDate });
  const results = /* @__PURE__ */ new Map([
    [
      'ledger.trial_balance',
      tb.validation.status === 'validated' ? ['passed', {}] : ['failed', { difference: tb.totals.difference }],
    ],
    ['ledger.integrity', ledger.ok ? ['passed', {}] : ['failed', { reasonCodes: ledger.issues }]],
    [
      'journals.open_drafts',
      Number(drafts.count) ? ['warning', { count: Number(drafts.count) }] : ['passed', { count: 0 }],
    ],
    [
      'bank.required_reconciliations',
      Number(requiredRecon.count) ? ['failed', { count: Number(requiredRecon.count) }] : ['passed', { count: 0 }],
    ],
    [
      'integrations.exceptions',
      Number(exceptions.count) ? ['warning', { count: Number(exceptions.count) }] : ['passed', { count: 0 }],
    ],
    [
      'reports.validation',
      position.validation.status === 'validated' && activities.validation.status === 'validated'
        ? ['passed', {}]
        : ['failed', { position: position.validation.status, activities: activities.validation.status }],
    ],
  ]);
  if (tier === 'parish') {
    const ap = await first(
      db,
      "SELECT COUNT(*) count FROM accounting_bills WHERE status IN ('draft','submitted','approved','posted','partially_paid') AND bill_date<=?",
      endDate
    );
    const budgets = await first(
      db,
      "SELECT COUNT(*) count FROM accounting_budgets WHERE fiscal_year_id=? AND status IN ('approved','locked')",
      session.fiscal_year_id
    );
    const commerce = await first(
      db,
      "SELECT COUNT(*) count FROM accounting_integration_source_events WHERE source_system='agapay_commerce' AND (status NOT IN ('posted','ignored') OR exception_code IS NOT NULL) AND date(occurred_at)<=?",
      endDate
    );
    results.set(
      'payables.review',
      Number(ap.count) ? ['warning', { openItems: Number(ap.count) }] : ['passed', { openItems: 0 }]
    );
    results.set(
      'budgets.review',
      Number(budgets.count)
        ? ['passed', { officialBudgets: Number(budgets.count) }]
        : ['warning', { officialBudgets: 0 }]
    );
    results.set(
      'commerce.review',
      Number(commerce.count) ? ['warning', { exceptions: Number(commerce.count) }] : ['passed', { exceptions: 0 }]
    );
  }
  return { startDate, endDate, tb, position, activities, results };
}
function adjustmentDto(row) {
  return Object.freeze({
    id: row.id,
    closeSessionId: row.close_session_id || '',
    journalEntryId: row.journal_entry_id,
    type: row.adjustment_type,
    effectiveDate: row.effective_date,
    reason: row.reason,
    supportingMemo: row.supporting_memo,
    status: row.status,
    autoReverse: Boolean(row.auto_reverse),
    reversalDate: row.reversal_date || '',
    reversalStatus: row.reversal_status || '',
    reversalJournalEntryId: row.reversal_journal_entry_id || '',
    version: Number(row.version),
  });
}
function yearCloseDto(row) {
  return Object.freeze({
    id: row.id,
    fiscalYearId: row.fiscal_year_id,
    closeSessionId: row.close_session_id,
    closingDate: row.closing_date,
    closingEntryId: row.closing_entry_id || '',
    status: row.status,
    revenueTotal: Number(row.revenue_total),
    expenseTotal: Number(row.expense_total),
    changeInNetAssets: Number(row.change_in_net_assets),
    restrictedChange: Number(row.restricted_change),
    unrestrictedChange: Number(row.unrestricted_change),
    completedAt: row.completed_at || '',
    version: Number(row.version),
  });
}
function exportDto(row) {
  const manifest = row.manifest_json ? JSON.parse(row.manifest_json) : null;
  return Object.freeze({
    id: row.id,
    fiscalYearId: row.fiscal_year_id,
    closeSessionId: row.close_session_id || '',
    status: row.status,
    format: row.format,
    manifest,
    requestedAt: row.requested_at,
    completedAt: row.completed_at || '',
    expiresAt: row.expires_at || '',
    version: Number(row.version),
  });
}
function rowsCsv(rows) {
  const keys = Object.keys(rows[0] || {}),
    safe = (value) => {
      let result = String(value ?? '');
      if (/^[=+\-@]/.test(result)) result = `'${result}`;
      return `"${result.replaceAll('"', '""')}"`;
    };
  return [keys, ...rows.map((row) => keys.map((key) => row[key]))].map((row) => row.map(safe).join(',')).join('\r\n');
}
function retentionDto(row) {
  return Object.freeze({
    accountingRecordsRetentionYears: Number(row.accounting_records_retention_years),
    bankStatementRetentionYears: Number(row.bank_statement_retention_years),
    invoiceRetentionYears: Number(row.invoice_retention_years),
    auditLogRetentionYears: Number(row.audit_log_retention_years),
    attachmentRetentionYears: Number(row.attachment_retention_years),
    closePacketRetentionYears: Number(row.close_packet_retention_years),
    allowLegalHold: Boolean(row.allow_legal_hold),
    version: Number(row.retention_policy_version),
    disclaimer:
      'Retention classifications require jurisdiction-specific professional review; Phase 3D does not automatically purge ledger records.',
  });
}
export {
  ADJUSTMENT_TYPES,
  ADVANCED_CHECKS,
  AccountingDatabaseError,
  CORE_CHECKS,
  DATE,
  ValidationError,
  adjustmentDto,
  all,
  capability,
  checkDto,
  closeDto,
  createJournalDraft,
  digest,
  elevated,
  entitled,
  evaluateChecks,
  exportDto,
  first,
  fundActivity,
  id,
  now,
  postJournalEntry,
  reportCsv,
  retentionDto,
  reverseJournalEntry,
  rowsCsv,
  run,
  statementOfActivities,
  statementOfFinancialPosition,
  text,
  trialBalance,
  validateLedgerFoundation,
  yearCloseDto,
};
