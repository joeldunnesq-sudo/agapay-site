// Generated from src/accounting/close/audit.ts by npm run build:server. Do not edit.
import {
  DATE,
  id,
  now,
  text,
  first,
  all,
  run,
  capability,
  entitled,
  elevated,
  digest,
  exportDto,
  rowsCsv,
  retentionDto,
  AccountingDatabaseError,
  ValidationError,
  validateLedgerFoundation,
  fundActivity,
  reportCsv,
  statementOfActivities,
  statementOfFinancialPosition,
  trialBalance,
} from './service-shared.js';
import { closeSessionDetail } from './service.js';
import './adjustments.js';
import './year-end.js';
async function auditReadiness(db, { actor, entitlementTier, fiscalYearId }) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.view');
  const year = await first(db, 'SELECT * FROM accounting_fiscal_years WHERE id=?', fiscalYearId);
  if (!year) throw new ValidationError('Fiscal year was not found.');
  const ledger = await validateLedgerFoundation(db),
    periods = await all(
      db,
      'SELECT status,COUNT(*) count FROM accounting_periods WHERE fiscal_year_id=? GROUP BY status',
      fiscalYearId
    ),
    drafts = await first(
      db,
      "SELECT COUNT(*) count FROM accounting_journal_entries WHERE status IN ('draft','pending') AND entry_date BETWEEN ? AND ?",
      year.start_date,
      year.end_date
    ),
    exceptions = await first(
      db,
      "SELECT COUNT(*) count FROM accounting_integration_source_events WHERE status='exception' AND date(occurred_at) BETWEEN ? AND ?",
      year.start_date,
      year.end_date
    ),
    adjustments = await first(
      db,
      "SELECT COUNT(*) count FROM accounting_adjustments WHERE effective_date BETWEEN ? AND ? AND supporting_memo=''",
      year.start_date,
      year.end_date
    );
  const advanced =
    entitlementTier === 'parish'
      ? {
          payables: Number(
            (
              await first(
                db,
                "SELECT COUNT(*) count FROM accounting_bills WHERE status IN ('draft','submitted','approved','posted','partially_paid')"
              )
            ).count
          ),
          budget: Number(
            (
              await first(
                db,
                "SELECT COUNT(*) count FROM accounting_budgets WHERE fiscal_year_id=? AND status IN ('approved','locked')",
                fiscalYearId
              )
            ).count
          ),
          commerceExceptions: Number(
            (
              await first(
                db,
                "SELECT COUNT(*) count FROM accounting_integration_source_events WHERE source_system='agapay_commerce' AND exception_code IS NOT NULL"
              )
            ).count
          ),
        }
      : null;
  return Object.freeze({
    label: 'Audit readiness checks completed',
    disclaimer:
      'These bookkeeping checks do not constitute an audit opinion or professional accounting, tax, or legal advice.',
    ledgerIntegrity: Object.freeze({ healthy: ledger.ok, reasonCodes: Object.freeze(ledger.issues || []) }),
    periodStatus: Object.freeze(periods.map((row) => ({ status: row.status, count: Number(row.count) }))),
    itemsRequiringReview: Object.freeze({
      journalDrafts: Number(drafts.count),
      integrationExceptions: Number(exceptions.count),
      adjustmentsMissingSupport: Number(adjustments.count),
    }),
    advancedModules: advanced && Object.freeze(advanced),
  });
}
async function generateAccountantExport(db, { actor, entitlementTier, fiscalYearId, closeSessionId = null }) {
  entitled(entitlementTier);
  capability(actor, 'accounting.accountant_exports.generate');
  const year = await first(db, 'SELECT * FROM accounting_fiscal_years WHERE id=?', fiscalYearId);
  if (!year) throw new ValidationError('Fiscal year was not found.');
  const requestHash = await digest({ fiscalYearId, closeSessionId, entitlementTier });
  const prior = await first(
    db,
    'SELECT * FROM accounting_accountant_exports WHERE fiscal_year_id=? AND request_hash=?',
    fiscalYearId,
    requestHash
  );
  if (prior) return exportDto(prior);
  const reports = {
    'trial-balance.csv': reportCsv(
      await trialBalance(db, {
        actor: elevated(actor),
        startDate: year.start_date,
        endDate: year.end_date,
        includeZero: true,
      })
    ),
    'statement-of-financial-position.csv': reportCsv(
      await statementOfFinancialPosition(db, { actor: elevated(actor), asOfDate: year.end_date })
    ),
    'statement-of-activities.csv': reportCsv(
      await statementOfActivities(db, { actor: elevated(actor), startDate: year.start_date, endDate: year.end_date })
    ),
    'fund-activity.csv': reportCsv(
      await fundActivity(db, { actor: elevated(actor), startDate: year.start_date, endDate: year.end_date })
    ),
  };
  const accounts = await all(
      db,
      'SELECT account_number,name,normal_balance,is_active FROM accounting_accounts ORDER BY account_number'
    ),
    funds = await all(db, 'SELECT code,name,restriction_type,is_active FROM accounting_funds ORDER BY code');
  reports['chart-of-accounts.csv'] = rowsCsv(accounts);
  reports['funds.csv'] = rowsCsv(funds);
  const journals = await all(
    db,
    'SELECT entry_number,entry_date,posting_date,description,status,source_type,external_reference,total_debits,total_credits,created_at,posted_at,correlation_id FROM accounting_journal_entries WHERE entry_date BETWEEN ? AND ? ORDER BY entry_date,entry_number',
    year.start_date,
    year.end_date
  );
  const lines = await all(
    db,
    `SELECT e.entry_number,e.entry_date,a.account_number,f.code fund_code,l.line_number,l.description,l.debit_amount,l.credit_amount,l.source_detail_type,l.source_detail_id FROM accounting_journal_lines l JOIN accounting_journal_entries e ON e.id=l.journal_entry_id JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_funds f ON f.id=l.fund_id WHERE e.entry_date BETWEEN ? AND ? ORDER BY e.entry_date,e.entry_number,l.line_number`,
    year.start_date,
    year.end_date
  );
  reports['journal-entries.csv'] = rowsCsv(journals);
  reports['journal-lines.csv'] = rowsCsv(lines);
  reports['general-ledger.csv'] = rowsCsv(lines);
  reports['bank-reconciliations.csv'] = rowsCsv(
    await all(
      db,
      `SELECT b.name bank_name,b.masked_last4,r.statement_start_date,r.statement_end_date,r.statement_beginning_balance,r.statement_ending_balance,r.difference,r.status,r.completed_at FROM accounting_reconciliation_sessions r JOIN accounting_bank_accounts b ON b.id=r.bank_account_id WHERE r.statement_end_date BETWEEN ? AND ? ORDER BY b.name,r.statement_end_date`,
      year.start_date,
      year.end_date
    )
  );
  reports['audit-trail.csv'] = rowsCsv(
    await all(
      db,
      "SELECT created_at,event_type,actor_type,actor_id,reason_code,correlation_id FROM accounting_ledger_events WHERE created_at BETWEEN ? AND datetime(?,'+1 day') ORDER BY created_at,id",
      year.start_date,
      year.end_date
    )
  );
  if (entitlementTier === 'parish') {
    reports['accounts-payable-aging.csv'] = rowsCsv(
      await all(
        db,
        'SELECT v.vendor_number,v.display_name,b.bill_number,b.bill_date,b.due_date,b.total_amount,b.amount_due,b.status FROM accounting_bills b JOIN accounting_vendors v ON v.id=b.vendor_id WHERE b.bill_date<=? ORDER BY v.display_name,b.due_date',
        year.end_date
      )
    );
    reports['vendors.csv'] = rowsCsv(
      await all(
        db,
        'SELECT vendor_number,display_name,vendor_type,status,requires_1099_review FROM accounting_vendors ORDER BY vendor_number'
      )
    );
    reports['budget-vs-actual.csv'] = rowsCsv(
      await all(
        db,
        'SELECT b.budget_name,b.status,a.account_number,f.code fund_code,l.annual_amount FROM accounting_budget_lines l JOIN accounting_budgets b ON b.id=l.budget_id JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_funds f ON f.id=l.fund_id WHERE b.fiscal_year_id=? ORDER BY b.version_number,a.account_number,f.code',
        fiscalYearId
      )
    );
    reports['commerce-sales-summary.csv'] = rowsCsv(
      await all(
        db,
        "SELECT source_type,date(occurred_at) occurred_date,commerce_channel,tender_type,gross_merchandise_amount,discount_amount,sales_tax_amount,fee_amount,refund_amount,status,exception_code FROM accounting_integration_source_events WHERE source_system='agapay_commerce' AND date(occurred_at) BETWEEN ? AND ? ORDER BY occurred_at",
        year.start_date,
        year.end_date
      )
    );
    reports['inventory-summary.csv'] = rowsCsv(
      await all(
        db,
        'SELECT sku,barcode,name,quantity_on_hand,current_unit_cost,costing_method,is_inventory_tracked FROM accounting_commerce_items ORDER BY name'
      )
    );
  }
  const hashes = {};
  for (const [name, body] of Object.entries(reports)) hashes[name] = await digest(body);
  const manifest = {
    fiscalYear: year.name,
    dateRange: { start: year.start_date, end: year.end_date },
    generatedAt: now(),
    accountingBasis: 'posting_date',
    currency: 'USD',
    includedReports: Object.keys(reports),
    includedModules: entitlementTier === 'parish' ? ['core', 'payables', 'budgets', 'commerce'] : ['core'],
    recordCounts: { accounts: accounts.length, funds: funds.length },
    fileHashes: hashes,
    closeStatus: year.status,
    warnings: [
      'CSV package excludes credentials, provider payloads, full bank numbers, tax identifiers, and physical database identity.',
    ],
  };
  const exportId = id('accountantexport');
  await run(
    db,
    `INSERT INTO accounting_accountant_exports(id,fiscal_year_id,close_session_id,status,request_hash,manifest_json,package_json,expires_at,generated_by_actor_type,generated_by_actor_id,completed_at) VALUES(?,?,?,'completed',?,?,?,?,?,?,?)`,
    exportId,
    fiscalYearId,
    closeSessionId,
    requestHash,
    JSON.stringify(manifest),
    JSON.stringify(reports),
    new Date(Date.now() + 7 * 864e5).toISOString(),
    actor.type || 'platform_user',
    actor.id,
    now()
  );
  return exportDto(await first(db, 'SELECT * FROM accounting_accountant_exports WHERE id=?', exportId));
}
async function closePacketHtml(db, { actor, entitlementTier, closeSessionId }) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.view');
  const detail = await closeSessionDetail(db, { actor, entitlementTier, closeSessionId });
  const snapshot = await first(
    db,
    'SELECT * FROM accounting_close_snapshots WHERE close_session_id=? ORDER BY sequence_number DESC LIMIT 1',
    closeSessionId
  );
  if (!snapshot) throw new ValidationError('A completed close snapshot is required before generating a close packet.');
  const data = JSON.parse(snapshot.snapshot_json),
    escape = (value) =>
      String(value ?? '').replace(
        /[&<>\"]/g,
        (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]
      );
  const checks = detail.checks
    .map(
      (check) =>
        `<tr><th scope="row">${escape(check.label)}</th><td>${escape(check.status)}</td><td>${escape(check.resolutionNote)}</td></tr>`
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AGAPAY close packet</title><style>body{font:16px system-ui;color:#102544;max-width:960px;margin:auto;padding:2rem}h1{font-family:Georgia,serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5df;padding:.65rem;text-align:left}@media print{button{display:none}}</style></head><body><button onclick="print()">Print close packet</button><h1>${escape(detail.closeType.replaceAll('_', ' '))} close packet</h1><p>Status: ${escape(detail.status)} · Completed ${escape(detail.completedAt)}</p><p>Snapshot verification: ${escape(snapshot.snapshot_hash)}</p><h2>Checklist</h2><table><thead><tr><th>Check</th><th>Status</th><th>Resolution</th></tr></thead><tbody>${checks}</tbody></table><h2>Trial Balance</h2><p>Ending debits: ${escape(data.trialBalance?.totals?.endingDebits)} · Ending credits: ${escape(data.trialBalance?.totals?.endingCredits)}</p><p><small>Generated from an immutable server-side close snapshot. This packet supports bookkeeping review and is not an audit opinion.</small></p></body></html>`;
}
async function auditTrailCsv(db, { actor, entitlementTier, startDate, endDate, eventType = '', actorId = '' }) {
  entitled(entitlementTier);
  capability(actor, 'accounting.audit_exports.generate');
  if (!DATE.test(startDate || '') || !DATE.test(endDate || '') || startDate > endDate)
    throw new ValidationError('A valid audit export date range is required.');
  const clauses = ['date(created_at) BETWEEN ? AND ?'],
    parameters = [startDate, endDate];
  if (eventType) {
    clauses.push('event_type=?');
    parameters.push(eventType);
  }
  if (actorId) {
    clauses.push('actor_id=?');
    parameters.push(actorId);
  }
  const rows = await all(
    db,
    `SELECT created_at timestamp,event_type,actor_type,actor_id actor_label,'ledger_event' entity_type,COALESCE(journal_entry_id,related_entry_id,'') entity_identifier,reason_code reason,correlation_id,CASE WHEN event_type LIKE '%.failed' THEN 'failure' ELSE 'success' END outcome FROM accounting_ledger_events WHERE ${clauses.join(' AND ')} ORDER BY created_at,id`,
    ...parameters
  );
  return rowsCsv(rows);
}
async function archiveFiscalYear(db, { actor, entitlementTier, fiscalYearId, expectedVersion }) {
  entitled(entitlementTier);
  capability(actor, 'accounting.retention.manage');
  const hold = await first(
    db,
    "SELECT id FROM accounting_legal_holds WHERE entity_type='fiscal_year' AND entity_id=? AND status='active'",
    fiscalYearId
  );
  if (hold) throw new ValidationError('An active legal hold prevents archival.');
  const result = await run(
    db,
    "UPDATE accounting_fiscal_years SET status='archived',is_current=0,version=version+1,updated_at=datetime('now') WHERE id=? AND status='closed' AND version=?",
    fiscalYearId,
    Number(expectedVersion)
  );
  if (!result.meta?.changes)
    throw new AccountingDatabaseError('Closed fiscal year changed or cannot be archived.', {
      details: { conflict: true },
    });
  return Object.freeze({ fiscalYearId, status: 'archived', ledgerHistoryPreserved: true });
}
async function updateRetentionSettings(db, { actor, entitlementTier, expectedVersion, patch }) {
  entitled(entitlementTier);
  capability(actor, 'accounting.retention.manage');
  const current = await first(db, "SELECT * FROM accounting_retention_settings WHERE id='primary'");
  if (Number(current.retention_policy_version) !== Number(expectedVersion))
    throw new AccountingDatabaseError('Retention policy changed.', { details: { conflict: true } });
  const fields = [
    'accountingRecordsRetentionYears',
    'bankStatementRetentionYears',
    'invoiceRetentionYears',
    'auditLogRetentionYears',
    'attachmentRetentionYears',
    'closePacketRetentionYears',
  ];
  const values = fields.map((key, index) => {
    const columns = [
      'accounting_records_retention_years',
      'bank_statement_retention_years',
      'invoice_retention_years',
      'audit_log_retention_years',
      'attachment_retention_years',
      'close_packet_retention_years',
    ];
    const value = Number(patch?.[key] ?? current[columns[index]]);
    if (!Number.isInteger(value) || value < 1 || value > 100)
      throw new ValidationError('Retention classifications must be whole years between 1 and 100.');
    return value;
  });
  await run(
    db,
    "UPDATE accounting_retention_settings SET accounting_records_retention_years=?,bank_statement_retention_years=?,invoice_retention_years=?,audit_log_retention_years=?,attachment_retention_years=?,close_packet_retention_years=?,allow_legal_hold=?,retention_policy_version=retention_policy_version+1,updated_by=?,updated_at=datetime('now') WHERE id='primary' AND retention_policy_version=?",
    ...values,
    Number(patch?.allowLegalHold ?? Boolean(current.allow_legal_hold)),
    actor.id,
    Number(expectedVersion)
  );
  return retentionDto(await first(db, "SELECT * FROM accounting_retention_settings WHERE id='primary'"));
}
async function getRetentionSettings(db, { actor, entitlementTier }) {
  entitled(entitlementTier);
  capability(actor, 'accounting.close.view');
  return retentionDto(await first(db, "SELECT * FROM accounting_retention_settings WHERE id='primary'"));
}
async function createLegalHold(db, { actor, entitlementTier, entityType, entityId, reason }) {
  entitled(entitlementTier);
  capability(actor, 'accounting.legal_hold.manage');
  if (!text(entityType) || !text(entityId) || !text(reason))
    throw new ValidationError('Legal hold entity and reason are required.');
  const holdId = id('legalhold');
  await run(
    db,
    'INSERT INTO accounting_legal_holds(id,entity_type,entity_id,hold_reason,placed_by) VALUES(?,?,?,?,?)',
    holdId,
    text(entityType),
    text(entityId),
    text(reason),
    actor.id
  );
  return Object.freeze({
    id: holdId,
    entityType: text(entityType),
    entityId: text(entityId),
    reason: text(reason),
    status: 'active',
    version: 1,
  });
}
async function releaseLegalHold(db, { actor, entitlementTier, legalHoldId, expectedVersion }) {
  entitled(entitlementTier);
  capability(actor, 'accounting.legal_hold.manage');
  const result = await run(
    db,
    "UPDATE accounting_legal_holds SET status='released',released_by=?,released_at=?,version=version+1 WHERE id=? AND status='active' AND version=?",
    actor.id,
    now(),
    legalHoldId,
    Number(expectedVersion)
  );
  if (!result.meta?.changes)
    throw new AccountingDatabaseError('Legal hold changed or is already released.', { details: { conflict: true } });
  const row = await first(db, 'SELECT * FROM accounting_legal_holds WHERE id=?', legalHoldId);
  return Object.freeze({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    reason: row.hold_reason,
    status: row.status,
    version: Number(row.version),
  });
}
export {
  archiveFiscalYear,
  auditReadiness,
  auditTrailCsv,
  closePacketHtml,
  createLegalHold,
  generateAccountantExport,
  getRetentionSettings,
  releaseLegalHold,
  updateRetentionSettings,
};
