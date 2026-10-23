// Generated from src/accounting/payables/service.ts by npm run build:server. Do not edit.
import { validateAccountingDate } from '../validation.js';
import {
  DATE,
  id,
  now,
  first,
  all,
  run,
  capability,
  parish,
  text,
  hash,
  vendorDto,
  billDto,
  paymentDto,
  eligibleAccount,
  transition,
  validatePaymentSelection,
  AccountingDatabaseError,
  ValidationError,
  createJournalDraft,
  postJournalEntry,
} from './service-shared.js';
import './checks.js';
import './payment-runs.js';
import {
  nextCheckNumber,
  reserveCheckNumbers,
  getCheckSettings,
  seedCheckPayerIdentity,
  updateCheckSettings,
  recordCheckPrint,
  voidPayment,
} from './checks.js';
import {
  listPaymentRuns,
  paymentRunDetail,
  createPaymentRun,
  postPaymentRun,
  printPaymentRun,
} from './payment-runs.js';
async function createVendor(db, { actor, entitlementTier, input }) {
  capability(actor, 'ap.enter');
  parish(entitlementTier);
  if (!text(input?.displayName)) throw new ValidationError('Vendor name is required.');
  if (/\d{5,}/.test(text(input.taxIdLast4))) throw new ValidationError('Only the tax ID last four may be stored.');
  if (input.defaultExpenseAccountId && !(await eligibleAccount(db, input.defaultExpenseAccountId)))
    throw new ValidationError('Default expense account must be an active expense or asset posting account.');
  if (
    input.defaultFundId &&
    !(await first(
      db,
      'SELECT id FROM accounting_funds WHERE id=? AND is_active=1 AND archived_at IS NULL',
      input.defaultFundId
    ))
  )
    throw new ValidationError('Default fund is invalid.');
  const vendorId = id('vendor'),
    number = input.vendorNumber || `V-${vendorId.slice(-8).toUpperCase()}`;
  await run(
    db,
    `INSERT INTO accounting_vendors(id,vendor_number,display_name,legal_name,vendor_type,email,phone,payment_terms_id,default_expense_account_id,default_fund_id,default_payment_method,tax_classification,tax_id_last4,requires_1099_review,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    vendorId,
    number,
    text(input.displayName),
    text(input.legalName) || null,
    input.vendorType || 'business',
    text(input.email) || null,
    text(input.phone) || null,
    input.paymentTermsId || 'terms_net30',
    input.defaultExpenseAccountId || null,
    input.defaultFundId || null,
    input.defaultPaymentMethod || null,
    input.taxClassification || null,
    text(input.taxIdLast4) || null,
    Number(Boolean(input.requires1099Review)),
    text(input.notes) || null
  );
  return vendorDto(await first(db, 'SELECT * FROM accounting_vendors WHERE id=?', vendorId));
}
async function updateVendor(db, { actor, entitlementTier, vendorId, expectedVersion, patch = {} }) {
  capability(actor, 'ap.enter');
  parish(entitlementTier);
  const current = await first(db, 'SELECT * FROM accounting_vendors WHERE id=?', vendorId);
  if (!current || Number(current.version) !== Number(expectedVersion))
    throw new AccountingDatabaseError('Vendor changed. Reload and try again.', { details: { conflict: true } });
  const next = {
    vendorNumber: text(patch.vendorNumber ?? current.vendor_number),
    displayName: text(patch.displayName ?? current.display_name),
    legalName: text(patch.legalName ?? current.legal_name),
    vendorType: patch.vendorType ?? current.vendor_type,
    email: text(patch.email ?? current.email),
    phone: text(patch.phone ?? current.phone),
    paymentTermsId: patch.paymentTermsId ?? current.payment_terms_id,
    defaultExpenseAccountId: patch.defaultExpenseAccountId ?? current.default_expense_account_id,
    defaultFundId: patch.defaultFundId ?? current.default_fund_id,
    defaultPaymentMethod: patch.defaultPaymentMethod ?? current.default_payment_method,
    taxClassification: patch.taxClassification ?? current.tax_classification,
    taxIdLast4: text(patch.taxIdLast4 ?? current.tax_id_last4),
    requires1099Review:
      patch.requires1099Review === void 0 ? Boolean(current.requires_1099_review) : Boolean(patch.requires1099Review),
    notes: text(patch.notes ?? current.notes),
  };
  if (!next.displayName) throw new ValidationError('Vendor name is required.');
  if (/\d{5,}/.test(next.taxIdLast4)) throw new ValidationError('Only the tax ID last four may be stored.');
  if (next.defaultExpenseAccountId && !(await eligibleAccount(db, next.defaultExpenseAccountId)))
    throw new ValidationError('Default expense account must be an active expense or asset posting account.');
  if (
    next.defaultFundId &&
    !(await first(
      db,
      'SELECT id FROM accounting_funds WHERE id=? AND is_active=1 AND archived_at IS NULL',
      next.defaultFundId
    ))
  )
    throw new ValidationError('Default fund is invalid.');
  const result = await run(
    db,
    `UPDATE accounting_vendors SET vendor_number=?,display_name=?,legal_name=?,vendor_type=?,email=?,phone=?,payment_terms_id=?,default_expense_account_id=?,default_fund_id=?,default_payment_method=?,tax_classification=?,tax_id_last4=?,requires_1099_review=?,notes=?,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?`,
    next.vendorNumber,
    next.displayName,
    next.legalName || null,
    next.vendorType,
    next.email || null,
    next.phone || null,
    next.paymentTermsId || null,
    next.defaultExpenseAccountId || null,
    next.defaultFundId || null,
    next.defaultPaymentMethod || null,
    next.taxClassification || null,
    next.taxIdLast4 || null,
    Number(next.requires1099Review),
    next.notes || null,
    vendorId,
    Number(expectedVersion)
  );
  if (!result.meta?.changes)
    throw new AccountingDatabaseError('Vendor changed. Reload and try again.', { details: { conflict: true } });
  return vendorDto(await first(db, 'SELECT * FROM accounting_vendors WHERE id=?', vendorId));
}
async function archiveVendor(db, { actor, entitlementTier, vendorId, expectedVersion }) {
  capability(actor, 'ap.enter');
  parish(entitlementTier);
  const current = await first(db, 'SELECT * FROM accounting_vendors WHERE id=?', vendorId);
  if (!current || current.status === 'archived' || Number(current.version) !== Number(expectedVersion))
    throw new AccountingDatabaseError('Vendor changed. Reload and try again.', { details: { conflict: true } });
  if (
    await first(
      db,
      "SELECT id FROM accounting_bills WHERE vendor_id=? AND status NOT IN('paid','voided','rejected') LIMIT 1",
      vendorId
    )
  )
    throw new ValidationError('This vendor has an open bill and cannot be archived.');
  const result = await run(
    db,
    "UPDATE accounting_vendors SET status='archived',archived_at=datetime('now'),version=version+1,updated_at=datetime('now') WHERE id=? AND version=?",
    vendorId,
    Number(expectedVersion)
  );
  if (!result.meta?.changes)
    throw new AccountingDatabaseError('Vendor changed. Reload and try again.', { details: { conflict: true } });
  return vendorDto(await first(db, 'SELECT * FROM accounting_vendors WHERE id=?', vendorId));
}
async function unarchiveVendor(db, { actor, entitlementTier, vendorId, expectedVersion }) {
  capability(actor, 'ap.enter');
  parish(entitlementTier);
  const current = await first(db, 'SELECT * FROM accounting_vendors WHERE id=?', vendorId);
  if (!current || current.status !== 'archived' || Number(current.version) !== Number(expectedVersion))
    throw new AccountingDatabaseError('Vendor changed. Reload and try again.', { details: { conflict: true } });
  const result = await run(
    db,
    "UPDATE accounting_vendors SET status='active',archived_at=NULL,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?",
    vendorId,
    Number(expectedVersion)
  );
  if (!result.meta?.changes)
    throw new AccountingDatabaseError('Vendor changed. Reload and try again.', { details: { conflict: true } });
  return vendorDto(await first(db, 'SELECT * FROM accounting_vendors WHERE id=?', vendorId));
}
async function listVendors(db, { actor, entitlementTier }) {
  capability(actor, 'ap.view');
  parish(entitlementTier);
  return Object.freeze((await all(db, 'SELECT * FROM accounting_vendors ORDER BY display_name')).map(vendorDto));
}
async function createBillDraft(db, { actor, entitlementTier, input }) {
  capability(actor, 'ap.enter');
  parish(entitlementTier);
  const vendor = await first(db, "SELECT * FROM accounting_vendors WHERE id=? AND status='active'", input?.vendorId);
  if (!vendor) throw new ValidationError('An active vendor is required.');
  if (!DATE.test(input.billDate || '') || !Array.isArray(input.lines) || !input.lines.length)
    throw new ValidationError('Bill date and lines are required.');
  validateAccountingDate(input.billDate);
  if (input.receivedDate) validateAccountingDate(input.receivedDate);
  const terms = await first(
      db,
      'SELECT due_days FROM accounting_payment_terms WHERE id=? AND is_active=1',
      input.paymentTermsId || vendor.payment_terms_id || 'terms_net30'
    ),
    due =
      input.dueDate ||
      new Date(Date.parse(`${input.billDate}T00:00:00Z`) + Number(terms?.due_days || 0) * 864e5)
        .toISOString()
        .slice(0, 10);
  validateAccountingDate(due);
  let subtotal = 0,
    tax = 0;
  for (const line of input.lines) {
    if (
      !(await eligibleAccount(db, line.accountId)) ||
      !(await first(db, 'SELECT id FROM accounting_funds WHERE id=? AND is_active=1', line.fundId))
    )
      throw new ValidationError('Every bill line requires an active expense/asset account and fund.');
    const quantity = Number(line.quantity ?? 1),
      unit = Number(line.unitAmount),
      lineTax = Number(line.taxAmount || 0);
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      !Number.isSafeInteger(unit) ||
      unit < 0 ||
      !Number.isSafeInteger(lineTax) ||
      lineTax < 0
    )
      throw new ValidationError('Bill line amounts must use integer minor units.');
    subtotal += quantity * unit;
    tax += lineTax;
    if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(tax) || !Number.isSafeInteger(subtotal + tax))
      throw new ValidationError('Bill totals exceed the supported whole-cent range.');
  }
  const billId = id('bill'),
    number = input.billNumber || `B-${billId.slice(-8).toUpperCase()}`;
  const statements = [
    db
      .prepare(
        `INSERT INTO accounting_bills(id,bill_number,vendor_id,vendor_invoice_number,bill_date,received_date,due_date,description,memo,currency,subtotal_amount,tax_amount,total_amount,amount_due,accounts_payable_account_id,created_by_actor_type,created_by_actor_id,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        billId,
        number,
        vendor.id,
        text(input.vendorInvoiceNumber) || null,
        input.billDate,
        input.receivedDate || null,
        due,
        text(input.description) || `Bill from ${vendor.display_name}`,
        text(input.memo) || null,
        text(input.currency || 'USD').toUpperCase(),
        subtotal,
        tax,
        subtotal + tax,
        subtotal + tax,
        input.accountsPayableAccountId || 'acct_2000',
        actor.type || 'platform_user',
        actor.id,
        input.correlationId || null
      ),
  ];
  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i],
      amount = Number(l.quantity || 1) * Number(l.unitAmount);
    statements.push(
      db
        .prepare(
          `INSERT INTO accounting_bill_lines(id,bill_id,line_number,description,account_id,fund_id,quantity,unit_amount,line_amount,tax_amount) VALUES(?,?,?,?,?,?,?,?,?,?)`
        )
        .bind(
          id('billline'),
          billId,
          i + 1,
          text(l.description),
          l.accountId,
          l.fundId,
          Number(l.quantity || 1),
          Number(l.unitAmount),
          amount,
          Number(l.taxAmount || 0)
        )
    );
  }
  await db.batch(statements);
  return billDto(await first(db, 'SELECT * FROM accounting_bills WHERE id=?', billId));
}
async function submitBill(db, { actor, entitlementTier, billId, expectedVersion }) {
  capability(actor, 'ap.enter');
  parish(entitlementTier);
  return transition(
    db,
    billId,
    expectedVersion,
    'draft',
    "status='submitted',approval_status='pending',submitted_by_actor_type=?,submitted_by_actor_id=?,submitted_at=?",
    [actor.type || 'platform_user', actor.id, now()]
  );
}
async function approveBill(db, { actor, entitlementTier, billId, expectedVersion }) {
  capability(actor, 'ap.approve');
  parish(entitlementTier);
  const bill = await first(db, 'SELECT * FROM accounting_bills WHERE id=?', billId);
  if (!bill || bill.created_by_actor_id === actor.id)
    throw new ValidationError('Bill creator cannot be the sole approver.');
  await run(
    db,
    "INSERT INTO accounting_bill_approvals(id,bill_id,sequence_number,actor_type,actor_id,decision) VALUES(?,?,?,?,?,'approved')",
    id('approval'),
    billId,
    1,
    actor.type || 'platform_user',
    actor.id
  );
  return transition(
    db,
    billId,
    expectedVersion,
    'submitted',
    "status='approved',approval_status='approved',approved_by_actor_type=?,approved_by_actor_id=?,approved_at=?",
    [actor.type || 'platform_user', actor.id, now()]
  );
}
async function rejectBill(db, { actor, entitlementTier, billId, expectedVersion, reason }) {
  capability(actor, 'ap.approve');
  parish(entitlementTier);
  if (!text(reason)) throw new ValidationError('Rejection reason is required.');
  await run(
    db,
    "INSERT INTO accounting_bill_approvals(id,bill_id,sequence_number,actor_type,actor_id,decision,reason) VALUES(?,?,?,?,?,'rejected',?)",
    id('approval'),
    billId,
    1,
    actor.type || 'platform_user',
    actor.id,
    text(reason)
  );
  return transition(db, billId, expectedVersion, 'submitted', "status='rejected',approval_status='rejected'", []);
}
async function postBill(db, { actor, entitlementTier, billId, expectedVersion, idempotencyKey }) {
  capability(actor, 'ap.approve');
  parish(entitlementTier);
  const bill = await first(db, 'SELECT * FROM accounting_bills WHERE id=?', billId);
  if (!bill || bill.status !== 'approved' || Number(bill.version) !== Number(expectedVersion))
    throw new ValidationError('Only the current approved bill can be posted.');
  const lines = await all(db, 'SELECT * FROM accounting_bill_lines WHERE bill_id=? ORDER BY line_number', billId),
    journalLines = lines.map((l) => ({
      accountId: l.account_id,
      fundId: l.fund_id,
      description: l.description,
      debitAmount: Number(l.line_amount) + Number(l.tax_amount),
    }));
  const fund = lines[0].fund_id;
  journalLines.push({
    accountId: bill.accounts_payable_account_id,
    fundId: fund,
    description: `AP · ${bill.vendor_invoice_number || bill.bill_number}`,
    creditAmount: Number(bill.total_amount),
  });
  const elevated = {
      ...actor,
      capabilities: [
        .../* @__PURE__ */ new Set([...actor.capabilities, 'accounting.journals.create', 'accounting.journals.post']),
      ],
    },
    draft =
      (await first(
        db,
        "SELECT * FROM accounting_journal_entries WHERE source_type='accounts_payable_bill' AND source_id=? AND status='draft'",
        bill.id
      )) ||
      (await createJournalDraft(db, {
        actor: elevated,
        entryDate: bill.bill_date,
        description: bill.description,
        sourceType: 'accounts_payable_bill',
        sourceId: bill.id,
        lines: journalLines,
        correlationId: bill.correlation_id || '',
      }));
  const additionalStatements = [
    db
      .prepare(
        "UPDATE accounting_bills SET version=CASE WHEN status='approved' AND version=? THEN version ELSE NULL END WHERE id=?"
      )
      .bind(Number(expectedVersion), bill.id),
    db
      .prepare(
        'INSERT OR IGNORE INTO accounting_entry_links(id,journal_entry_id,source_type,source_id,relationship_type) VALUES(?,?,?,?,?)'
      )
      .bind(id('link'), draft.id, 'bill', bill.id, 'accounts_payable'),
    db
      .prepare(
        "UPDATE accounting_bills SET status='posted',posting_date=bill_date,posted_journal_entry_id=?,posted_at=?,version=version+1,updated_at=? WHERE id=? AND status='approved'"
      )
      .bind(draft.id, now(), now(), bill.id),
  ];
  await postJournalEntry(db, {
    actor: elevated,
    journalEntryId: draft.id,
    additionalStatements,
    idempotencyKey: `ap:bill:${bill.id}:${idempotencyKey}`,
    requestHash: await hash({ billId, total: bill.total_amount, lines: journalLines }),
    expectedVersion: 1,
    correlationId: bill.correlation_id || '',
  });
  return billDto(await first(db, 'SELECT * FROM accounting_bills WHERE id=?', bill.id));
}
async function createPayment(db, { actor, entitlementTier, input }) {
  capability(actor, 'ap.pay');
  parish(entitlementTier);
  const { vendor, bank, total, paymentMethod } = await validatePaymentSelection(db, input);
  const paymentId = id('payment'),
    number = input.paymentNumber || `P-${paymentId.slice(-8).toUpperCase()}`;
  const statements = [
    db
      .prepare(
        `INSERT INTO accounting_payments(id,payment_number,vendor_id,payment_date,payment_method,bank_account_id,status,currency,total_amount,reference_number,check_number,memo,created_by_actor_type,created_by_actor_id,correlation_id) VALUES(?,?,?,?,?,?,'approved',?,?,?,?,?,?,?,?)`
      )
      .bind(
        paymentId,
        number,
        vendor.id,
        input.paymentDate,
        paymentMethod,
        bank.id,
        text(input.currency || bank.currency).toUpperCase(),
        total,
        text(input.referenceNumber) || null,
        paymentMethod === 'check' ? text(input.checkNumber) || null : null,
        text(input.memo) || null,
        actor.type || 'platform_user',
        actor.id,
        input.correlationId || null
      ),
  ];
  for (const app of input.applications)
    statements.push(
      db
        .prepare('INSERT INTO accounting_payment_applications(id,payment_id,bill_id,amount_applied) VALUES(?,?,?,?)')
        .bind(id('application'), paymentId, app.billId, Number(app.amountApplied))
    );
  await db.batch(statements);
  return paymentDto(await first(db, 'SELECT * FROM accounting_payments WHERE id=?', paymentId));
}
async function postPayment(db, { actor, entitlementTier, paymentId, expectedVersion, idempotencyKey }) {
  capability(actor, 'ap.pay');
  parish(entitlementTier);
  const payment = await first(
    db,
    'SELECT p.*,b.account_id FROM accounting_payments p JOIN accounting_bank_accounts b ON b.id=p.bank_account_id WHERE p.id=?',
    paymentId
  );
  if (!payment || payment.status !== 'approved' || Number(payment.version) !== Number(expectedVersion))
    throw new ValidationError('Only the current approved payment can be posted.');
  const apps = await all(
    db,
    'SELECT a.*,b.accounts_payable_account_id,b.vendor_id,b.amount_due FROM accounting_payment_applications a JOIN accounting_bills b ON b.id=a.bill_id WHERE a.payment_id=?',
    payment.id
  );
  if (
    !apps.length ||
    apps.some((a) => a.vendor_id !== payment.vendor_id || Number(a.amount_applied) > Number(a.amount_due)) ||
    apps.reduce((sum, a) => sum + Number(a.amount_applied), 0) !== Number(payment.total_amount)
  )
    throw new ValidationError('Payment applications are no longer valid.');
  const fund = (
      await first(
        db,
        'SELECT l.fund_id FROM accounting_bill_lines l WHERE l.bill_id=? ORDER BY line_number LIMIT 1',
        apps[0].bill_id
      )
    ).fund_id,
    lines = [
      {
        accountId: apps[0].accounts_payable_account_id,
        fundId: fund,
        debitAmount: Number(payment.total_amount),
        description: `AP payment ${payment.payment_number}`,
      },
      {
        accountId: payment.account_id,
        fundId: fund,
        creditAmount: Number(payment.total_amount),
        description: payment.check_number
          ? `Check ${payment.check_number}`
          : payment.reference_number || payment.payment_number,
      },
    ],
    elevated = {
      ...actor,
      capabilities: [
        .../* @__PURE__ */ new Set([...actor.capabilities, 'accounting.journals.create', 'accounting.journals.post']),
      ],
    },
    draft =
      (await first(
        db,
        "SELECT * FROM accounting_journal_entries WHERE source_type='accounts_payable_payment' AND source_id=? AND status='draft'",
        payment.id
      )) ||
      (await createJournalDraft(db, {
        actor: elevated,
        entryDate: payment.payment_date,
        description: `Payment ${payment.payment_number}`,
        sourceType: 'accounts_payable_payment',
        sourceId: payment.id,
        lines,
        correlationId: payment.correlation_id || '',
      }));
  const additionalStatements = apps.map((app) =>
    db
      .prepare(
        `UPDATE accounting_bills SET amount_paid=amount_paid+?,amount_due=amount_due-?,payment_status=CASE WHEN amount_due-?=0 THEN 'paid' ELSE 'partially_paid' END,status=CASE WHEN amount_due-?=0 THEN 'paid' ELSE 'partially_paid' END,version=CASE WHEN status IN ('posted','partially_paid') THEN version+1 ELSE NULL END,updated_at=datetime('now') WHERE id=?`
      )
      .bind(
        Number(app.amount_applied),
        Number(app.amount_applied),
        Number(app.amount_applied),
        Number(app.amount_applied),
        app.bill_id
      )
  );
  additionalStatements.unshift(
    db
      .prepare(
        "UPDATE accounting_payments SET version=CASE WHEN status='approved' AND version=? THEN version ELSE NULL END WHERE id=?"
      )
      .bind(Number(expectedVersion), payment.id)
  );
  additionalStatements.push(
    db
      .prepare(
        "UPDATE accounting_payments SET status='posted',posted_journal_entry_id=?,processed_at=?,version=version+1,updated_at=? WHERE id=?"
      )
      .bind(draft.id, now(), now(), payment.id)
  );
  additionalStatements.push(
    db
      .prepare(
        'INSERT OR IGNORE INTO accounting_entry_links(id,journal_entry_id,source_type,source_id,relationship_type) VALUES(?,?,?,?,?)'
      )
      .bind(id('link'), draft.id, 'payment', payment.id, 'accounts_payable')
  );
  await postJournalEntry(db, {
    actor: elevated,
    journalEntryId: draft.id,
    additionalStatements,
    idempotencyKey: `ap:payment:${payment.id}:${idempotencyKey}`,
    requestHash: await hash({
      paymentId,
      total: payment.total_amount,
      apps: apps.map((a) => [a.bill_id, a.amount_applied]),
    }),
    expectedVersion: 1,
    correlationId: payment.correlation_id || '',
  });
  return paymentDto(await first(db, 'SELECT * FROM accounting_payments WHERE id=?', payment.id));
}
async function accountsPayableAging(db, { actor, entitlementTier, asOfDate }) {
  capability(actor, 'ap.view');
  parish(entitlementTier);
  if (!DATE.test(asOfDate)) throw new ValidationError('A valid aging date is required.');
  const rows = await all(
      db,
      `SELECT v.id vendor_id,v.display_name,b.id bill_id,b.bill_number,b.due_date,b.amount_due,CAST(julianday(?)-julianday(b.due_date) AS INTEGER) days_past_due FROM accounting_bills b JOIN accounting_vendors v ON v.id=b.vendor_id WHERE b.status IN('posted','partially_paid') AND b.amount_due>0 AND b.bill_date<=? ORDER BY v.display_name,b.due_date`,
      asOfDate,
      asOfDate
    ),
    vendors = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const v = vendors.get(r.vendor_id) || {
      vendorId: r.vendor_id,
      vendor: r.display_name,
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      over90: 0,
      totalDue: 0,
    };
    const amount = Number(r.amount_due),
      days = Number(r.days_past_due);
    if (days <= 0) v.current += amount;
    else if (days <= 30) v.days1to30 += amount;
    else if (days <= 60) v.days31to60 += amount;
    else if (days <= 90) v.days61to90 += amount;
    else v.over90 += amount;
    v.totalDue += amount;
    vendors.set(r.vendor_id, v);
  }
  return Object.freeze({
    asOfDate,
    rows: Object.freeze([...vendors.values()]),
    totalDue: [...vendors.values()].reduce((s, v) => s + v.totalDue, 0),
  });
}
async function payablesOverview(
  db,
  { actor, entitlementTier, asOfDate = /* @__PURE__ */ new Date().toISOString().slice(0, 10) }
) {
  capability(actor, 'ap.view');
  parish(entitlementTier);
  const x = await first(
    db,
    `SELECT COALESCE(SUM(CASE WHEN status IN('posted','partially_paid') THEN amount_due ELSE 0 END),0) open_payables,SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) awaiting_approval,SUM(CASE WHEN amount_due>0 AND due_date<? THEN 1 ELSE 0 END) overdue,SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) paid FROM accounting_bills`,
    asOfDate
  );
  return Object.freeze({
    tier: 'parish',
    openPayables: Number(x.open_payables),
    awaitingApproval: Number(x.awaiting_approval),
    overdue: Number(x.overdue),
    paidBills: Number(x.paid),
  });
}
async function listPayments(db, { actor, entitlementTier }) {
  capability(actor, 'ap.view');
  parish(entitlementTier);
  return Object.freeze(
    await all(
      db,
      `SELECT p.id,p.payment_number paymentNumber,p.payment_date paymentDate,p.payment_method paymentMethod,p.status,p.total_amount totalAmount,p.check_number checkNumber,p.reference_number referenceNumber,p.version,v.id vendorId,v.display_name vendorName,b.name bankAccountName,(SELECT COUNT(*) FROM accounting_check_print_events e WHERE e.payment_id=p.id) printCount FROM accounting_payments p JOIN accounting_vendors v ON v.id=p.vendor_id JOIN accounting_bank_accounts b ON b.id=p.bank_account_id ORDER BY p.payment_date DESC,p.created_at DESC`
    )
  );
}
async function paymentDetail(db, { actor, entitlementTier, paymentId }) {
  capability(actor, 'ap.view');
  parish(entitlementTier);
  const payment = await first(
    db,
    `SELECT p.*,v.display_name vendor_name,v.legal_name vendor_legal_name,v.email vendor_email,b.name bank_name FROM accounting_payments p JOIN accounting_vendors v ON v.id=p.vendor_id JOIN accounting_bank_accounts b ON b.id=p.bank_account_id WHERE p.id=?`,
    paymentId
  );
  if (!payment) throw new ValidationError('Payment was not found.');
  const applications = await all(
      db,
      `SELECT a.bill_id billId,a.amount_applied amountApplied,b.bill_number billNumber,b.vendor_invoice_number vendorInvoiceNumber,b.bill_date billDate,b.description FROM accounting_payment_applications a JOIN accounting_bills b ON b.id=a.bill_id WHERE a.payment_id=? ORDER BY b.bill_date,b.bill_number`,
      paymentId
    ),
    settings = await first(
      db,
      'SELECT * FROM accounting_check_settings WHERE bank_account_id=?',
      payment.bank_account_id
    ),
    prints = await all(
      db,
      'SELECT print_sequence printSequence,print_type printType,printed_at printedAt,reason FROM accounting_check_print_events WHERE payment_id=? ORDER BY print_sequence',
      paymentId
    );
  return Object.freeze({
    payment: paymentDto(payment),
    vendor: Object.freeze({
      displayName: payment.vendor_name,
      legalName: payment.vendor_legal_name || '',
      email: payment.vendor_email || '',
    }),
    bankAccount: Object.freeze({ id: payment.bank_account_id, name: payment.bank_name }),
    applications: Object.freeze(applications),
    settings: Object.freeze({
      payerName: settings?.payer_name || '',
      payerAddress: settings?.payer_address || '',
      signatureLine1: settings?.signature_line_1 || '',
      signatureLine2: settings?.signature_line_2 || '',
      checkStyle: settings?.check_style || 'top_check_two_stubs',
      version: Number(settings?.version || 0),
    }),
    prints: Object.freeze(prints),
  });
}
export {
  accountsPayableAging,
  approveBill,
  archiveVendor,
  createBillDraft,
  createPayment,
  createPaymentRun,
  createVendor,
  getCheckSettings,
  listPaymentRuns,
  listPayments,
  listVendors,
  nextCheckNumber,
  payablesOverview,
  paymentDetail,
  paymentRunDetail,
  postBill,
  postPayment,
  postPaymentRun,
  printPaymentRun,
  recordCheckPrint,
  rejectBill,
  reserveCheckNumbers,
  seedCheckPayerIdentity,
  submitBill,
  unarchiveVendor,
  updateCheckSettings,
  updateVendor,
  voidPayment,
};
