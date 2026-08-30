import { AccountingDatabaseError, ValidationError } from '../errors.js';
import { createJournalDraft, postJournalEntry, reverseJournalEntry } from '../ledger/service.js';
import { printableChecks } from './check-printing.js';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function id(p) {
  return `${p}_${crypto.randomUUID()}`;
}
function now() {
  return new Date().toISOString();
}
async function first(db, q, ...p) {
  return db
    .prepare(q)
    .bind(...p)
    .first();
}
async function all(db, q, ...p) {
  return (
    (
      await db
        .prepare(q)
        .bind(...p)
        .all()
    ).results || []
  );
}
async function run(db, q, ...p) {
  return db
    .prepare(q)
    .bind(...p)
    .run();
}
function capability(actor, c) {
  if (!actor?.id || !actor.capabilities?.includes(c))
    throw new AccountingDatabaseError('Accounts Payable capability is required.', { details: { capability: c } });
}
function parish(tier) {
  if (tier !== 'parish') throw new AccountingDatabaseError('Accounts Payable is available with Parish Accounting.');
}
function text(v) {
  return String(v ?? '').trim();
}
async function hash(v) {
  const b = new TextEncoder().encode(JSON.stringify(v));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
function vendorDto(r) {
  return (
    r &&
    Object.freeze({
      id: r.id,
      vendorNumber: r.vendor_number,
      displayName: r.display_name,
      legalName: r.legal_name || '',
      vendorType: r.vendor_type,
      status: r.status,
      email: r.email || '',
      phone: r.phone || '',
      paymentTermsId: r.payment_terms_id || '',
      defaultExpenseAccountId: r.default_expense_account_id || '',
      defaultFundId: r.default_fund_id || '',
      defaultPaymentMethod: r.default_payment_method || '',
      taxClassification: r.tax_classification || '',
      taxIdLast4: r.tax_id_last4 || '',
      requires1099Review: Boolean(r.requires_1099_review),
      notes: r.notes || '',
      archivedAt: r.archived_at || '',
      version: Number(r.version),
    })
  );
}
function billDto(r) {
  return (
    r &&
    Object.freeze({
      id: r.id,
      billNumber: r.bill_number,
      vendorId: r.vendor_id,
      vendorInvoiceNumber: r.vendor_invoice_number || '',
      billDate: r.bill_date,
      dueDate: r.due_date,
      postingDate: r.posting_date || '',
      description: r.description,
      status: r.status,
      approvalStatus: r.approval_status,
      paymentStatus: r.payment_status,
      subtotalAmount: Number(r.subtotal_amount),
      taxAmount: Number(r.tax_amount),
      totalAmount: Number(r.total_amount),
      amountPaid: Number(r.amount_paid),
      amountDue: Number(r.amount_due),
      journalEntryId: r.posted_journal_entry_id || '',
      version: Number(r.version),
    })
  );
}
function paymentDto(r) {
  return (
    r &&
    Object.freeze({
      id: r.id,
      paymentNumber: r.payment_number,
      vendorId: r.vendor_id,
      paymentDate: r.payment_date,
      paymentMethod: r.payment_method,
      bankAccountId: r.bank_account_id,
      status: r.status,
      totalAmount: Number(r.total_amount),
      referenceNumber: r.reference_number || '',
      checkNumber: r.check_number || '',
      journalEntryId: r.posted_journal_entry_id || '',
      version: Number(r.version),
    })
  );
}
async function eligibleAccount(db, accountId) {
  return (
    accountId &&
    first(
      db,
      `SELECT a.id,t.category FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id WHERE a.id=? AND a.is_active=1 AND a.archived_at IS NULL AND a.is_posting_account=1 AND t.category IN('expense','asset')`,
      accountId
    )
  );
}
export async function createVendor(db, { actor, entitlementTier, input }) {
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
export async function updateVendor(db, { actor, entitlementTier, vendorId, expectedVersion, patch = {} }) {
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
      patch.requires1099Review === undefined
        ? Boolean(current.requires_1099_review)
        : Boolean(patch.requires1099Review),
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
export async function archiveVendor(db, { actor, entitlementTier, vendorId, expectedVersion }) {
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
export async function unarchiveVendor(db, { actor, entitlementTier, vendorId, expectedVersion }) {
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
export async function listVendors(db, { actor, entitlementTier }) {
  capability(actor, 'ap.view');
  parish(entitlementTier);
  return Object.freeze((await all(db, 'SELECT * FROM accounting_vendors ORDER BY display_name')).map(vendorDto));
}
export async function createBillDraft(db, { actor, entitlementTier, input }) {
  capability(actor, 'ap.enter');
  parish(entitlementTier);
  const vendor = await first(db, "SELECT * FROM accounting_vendors WHERE id=? AND status='active'", input?.vendorId);
  if (!vendor) throw new ValidationError('An active vendor is required.');
  if (!DATE.test(input.billDate) || !Array.isArray(input.lines) || !input.lines.length)
    throw new ValidationError('Bill date and lines are required.');
  const terms = await first(
      db,
      'SELECT due_days FROM accounting_payment_terms WHERE id=? AND is_active=1',
      input.paymentTermsId || vendor.payment_terms_id || 'terms_net30'
    ),
    due =
      input.dueDate ||
      new Date(Date.parse(`${input.billDate}T00:00:00Z`) + Number(terms?.due_days || 0) * 86400000)
        .toISOString()
        .slice(0, 10);
  let subtotal = 0,
    tax = 0;
  for (const line of input.lines) {
    if (
      !(await eligibleAccount(db, line.accountId)) ||
      !(await first(db, 'SELECT id FROM accounting_funds WHERE id=? AND is_active=1', line.fundId))
    )
      throw new ValidationError('Every bill line requires an active expense/asset account and fund.');
    const quantity = Number(line.quantity || 1),
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
  }
  const billId = id('bill'),
    number = input.billNumber || `B-${billId.slice(-8).toUpperCase()}`;
  await run(
    db,
    `INSERT INTO accounting_bills(id,bill_number,vendor_id,vendor_invoice_number,bill_date,received_date,due_date,description,memo,currency,subtotal_amount,tax_amount,total_amount,amount_due,accounts_payable_account_id,created_by_actor_type,created_by_actor_id,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
  );
  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i],
      amount = Number(l.quantity || 1) * Number(l.unitAmount);
    await run(
      db,
      `INSERT INTO accounting_bill_lines(id,bill_id,line_number,description,account_id,fund_id,quantity,unit_amount,line_amount,tax_amount) VALUES(?,?,?,?,?,?,?,?,?,?)`,
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
    );
  }
  return billDto(await first(db, 'SELECT * FROM accounting_bills WHERE id=?', billId));
}
async function transition(db, billId, expectedVersion, from, set, params = []) {
  const result = await run(
    db,
    `UPDATE accounting_bills SET ${set},version=version+1,updated_at=datetime('now') WHERE id=? AND status=? AND version=?`,
    ...params,
    billId,
    from,
    Number(expectedVersion)
  );
  if (!result.meta?.changes)
    throw new AccountingDatabaseError('Bill changed or cannot make this transition.', { details: { conflict: true } });
  return billDto(await first(db, 'SELECT * FROM accounting_bills WHERE id=?', billId));
}
export async function submitBill(db, { actor, entitlementTier, billId, expectedVersion }) {
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
export async function approveBill(db, { actor, entitlementTier, billId, expectedVersion }) {
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
export async function rejectBill(db, { actor, entitlementTier, billId, expectedVersion, reason }) {
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
export async function postBill(db, { actor, entitlementTier, billId, expectedVersion, idempotencyKey }) {
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
      capabilities: [...new Set([...actor.capabilities, 'accounting.journals.create', 'accounting.journals.post'])],
    },
    draft = await createJournalDraft(db, {
      actor: elevated,
      entryDate: bill.bill_date,
      description: bill.description,
      sourceType: 'accounts_payable_bill',
      sourceId: bill.id,
      lines: journalLines,
      correlationId: bill.correlation_id || '',
    }),
    posted = await postJournalEntry(db, {
      actor: elevated,
      journalEntryId: draft.id,
      idempotencyKey: `ap:bill:${bill.id}:${idempotencyKey}`,
      requestHash: await hash({ billId, total: bill.total_amount, lines: journalLines }),
      expectedVersion: 1,
      correlationId: bill.correlation_id || '',
    });
  await run(
    db,
    'INSERT OR IGNORE INTO accounting_entry_links(id,journal_entry_id,source_type,source_id,relationship_type) VALUES(?,?,?,?,?)',
    id('link'),
    posted.id,
    'bill',
    bill.id,
    'accounts_payable'
  );
  await run(
    db,
    "UPDATE accounting_bills SET status='posted',posting_date=bill_date,posted_journal_entry_id=?,posted_at=?,version=version+1,updated_at=? WHERE id=? AND status='approved'",
    posted.id,
    now(),
    now(),
    bill.id
  );
  return billDto(await first(db, 'SELECT * FROM accounting_bills WHERE id=?', bill.id));
}
async function validatePaymentSelection(db, input) {
  if (!DATE.test(input?.paymentDate) || !Array.isArray(input.applications) || !input.applications.length)
    throw new ValidationError('Payment date and bill applications are required.');
  const paymentMethod = text(input.paymentMethod || 'external');
  if (!['check', 'ach', 'wire', 'debit_card', 'credit_card', 'cash', 'external', 'other'].includes(paymentMethod))
    throw new ValidationError('Payment method is not supported.');
  if (paymentMethod === 'check' && !text(input.checkNumber))
    throw new ValidationError('Check number is required for a check payment.');
  if (paymentMethod !== 'check' && !text(input.referenceNumber))
    throw new ValidationError('A confirmation or reference number is required for a non-check payment.');
  const vendor = await first(db, 'SELECT id,status FROM accounting_vendors WHERE id=?', input.vendorId);
  const bank = await first(
    db,
    "SELECT * FROM accounting_bank_accounts WHERE id=? AND is_active=1 AND status='active'",
    input.bankAccountId
  );
  if (!vendor || vendor.status !== 'active' || !bank)
    throw new ValidationError('Active vendor and bank account are required.');
  let total = 0;
  for (const app of input.applications) {
    const bill = await first(
        db,
        "SELECT * FROM accounting_bills WHERE id=? AND vendor_id=? AND status IN('posted','partially_paid')",
        app.billId,
        vendor.id
      ),
      amount = Number(app.amountApplied);
    if (!bill || !Number.isSafeInteger(amount) || amount <= 0 || amount > Number(bill.amount_due))
      throw new ValidationError('Payment application exceeds the bill amount due.');
    total += amount;
  }
  if (input.totalAmount !== undefined && Number(input.totalAmount) !== total)
    throw new ValidationError('Payment total must equal its bill applications.');
  return { vendor, bank, total, paymentMethod };
}
export async function createPayment(db, { actor, entitlementTier, input }) {
  capability(actor, 'ap.pay');
  parish(entitlementTier);
  const { vendor, bank, total, paymentMethod } = await validatePaymentSelection(db, input);
  const paymentId = id('payment'),
    number = input.paymentNumber || `P-${paymentId.slice(-8).toUpperCase()}`;
  await run(
    db,
    `INSERT INTO accounting_payments(id,payment_number,vendor_id,payment_date,payment_method,bank_account_id,status,currency,total_amount,reference_number,check_number,memo,created_by_actor_type,created_by_actor_id,correlation_id) VALUES(?,?,?,?,?,?,'approved',?,?,?,?,?,?,?,?)`,
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
  );
  for (const app of input.applications)
    await run(
      db,
      'INSERT INTO accounting_payment_applications(id,payment_id,bill_id,amount_applied) VALUES(?,?,?,?)',
      id('application'),
      paymentId,
      app.billId,
      Number(app.amountApplied)
    );
  return paymentDto(await first(db, 'SELECT * FROM accounting_payments WHERE id=?', paymentId));
}
export async function postPayment(db, { actor, entitlementTier, paymentId, expectedVersion, idempotencyKey }) {
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
  if (apps.some((a) => a.vendor_id !== payment.vendor_id || Number(a.amount_applied) > Number(a.amount_due)))
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
      capabilities: [...new Set([...actor.capabilities, 'accounting.journals.create', 'accounting.journals.post'])],
    },
    draft = await createJournalDraft(db, {
      actor: elevated,
      entryDate: payment.payment_date,
      description: `Payment ${payment.payment_number}`,
      sourceType: 'accounts_payable_payment',
      sourceId: payment.id,
      lines,
      correlationId: payment.correlation_id || '',
    }),
    posted = await postJournalEntry(db, {
      actor: elevated,
      journalEntryId: draft.id,
      idempotencyKey: `ap:payment:${payment.id}:${idempotencyKey}`,
      requestHash: await hash({
        paymentId,
        total: payment.total_amount,
        apps: apps.map((a) => [a.bill_id, a.amount_applied]),
      }),
      expectedVersion: 1,
      correlationId: payment.correlation_id || '',
    });
  for (const app of apps)
    await run(
      db,
      `UPDATE accounting_bills SET amount_paid=amount_paid+?,amount_due=amount_due-?,payment_status=CASE WHEN amount_due-?=0 THEN 'paid' ELSE 'partially_paid' END,status=CASE WHEN amount_due-?=0 THEN 'paid' ELSE 'partially_paid' END,version=version+1,updated_at=datetime('now') WHERE id=?`,
      Number(app.amount_applied),
      Number(app.amount_applied),
      Number(app.amount_applied),
      Number(app.amount_applied),
      app.bill_id
    );
  await run(
    db,
    "UPDATE accounting_payments SET status='posted',posted_journal_entry_id=?,processed_at=?,version=version+1,updated_at=? WHERE id=?",
    posted.id,
    now(),
    now(),
    payment.id
  );
  await run(
    db,
    'INSERT OR IGNORE INTO accounting_entry_links(id,journal_entry_id,source_type,source_id,relationship_type) VALUES(?,?,?,?,?)',
    id('link'),
    posted.id,
    'payment',
    payment.id,
    'accounts_payable'
  );
  return paymentDto(await first(db, 'SELECT * FROM accounting_payments WHERE id=?', payment.id));
}
export async function accountsPayableAging(db, { actor, entitlementTier, asOfDate }) {
  capability(actor, 'ap.view');
  parish(entitlementTier);
  if (!DATE.test(asOfDate)) throw new ValidationError('A valid aging date is required.');
  const rows = await all(
      db,
      `SELECT v.id vendor_id,v.display_name,b.id bill_id,b.bill_number,b.due_date,b.amount_due,CAST(julianday(?)-julianday(b.due_date) AS INTEGER) days_past_due FROM accounting_bills b JOIN accounting_vendors v ON v.id=b.vendor_id WHERE b.status IN('posted','partially_paid') AND b.amount_due>0 AND b.bill_date<=? ORDER BY v.display_name,b.due_date`,
      asOfDate,
      asOfDate
    ),
    vendors = new Map();
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
export async function payablesOverview(
  db,
  { actor, entitlementTier, asOfDate = new Date().toISOString().slice(0, 10) }
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

export async function listPayments(db, { actor, entitlementTier }) {
  capability(actor, 'ap.view');
  parish(entitlementTier);
  return Object.freeze(
    await all(
      db,
      `SELECT p.id,p.payment_number paymentNumber,p.payment_date paymentDate,p.payment_method paymentMethod,p.status,p.total_amount totalAmount,p.check_number checkNumber,p.reference_number referenceNumber,p.version,v.id vendorId,v.display_name vendorName,b.name bankAccountName,(SELECT COUNT(*) FROM accounting_check_print_events e WHERE e.payment_id=p.id) printCount FROM accounting_payments p JOIN accounting_vendors v ON v.id=p.vendor_id JOIN accounting_bank_accounts b ON b.id=p.bank_account_id ORDER BY p.payment_date DESC,p.created_at DESC`
    )
  );
}
export async function paymentDetail(db, { actor, entitlementTier, paymentId }) {
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
export async function nextCheckNumber(db, { actor, entitlementTier, bankAccountId }) {
  capability(actor, 'ap.pay');
  parish(entitlementTier);
  const bank = await first(db, 'SELECT id FROM accounting_bank_accounts WHERE id=? AND is_active=1', bankAccountId);
  if (!bank) throw new ValidationError('Active bank account is required.');
  await run(db, 'INSERT OR IGNORE INTO accounting_check_settings(bank_account_id) VALUES(?)', bankAccountId);
  const row = await first(
    db,
    'SELECT next_check_number FROM accounting_check_settings WHERE bank_account_id=?',
    bankAccountId
  );
  return Number(row.next_check_number);
}
export async function reserveCheckNumbers(db, { actor, entitlementTier, bankAccountId, count }) {
  capability(actor, 'ap.pay');
  parish(entitlementTier);
  const requested = Number(count),
    bank = await first(
      db,
      "SELECT id FROM accounting_bank_accounts WHERE id=? AND is_active=1 AND status='active'",
      bankAccountId
    );
  if (!bank) throw new ValidationError('Active bank account is required.');
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > 100)
    throw new ValidationError('Check reservation count must be between 1 and 100.');
  await run(db, 'INSERT OR IGNORE INTO accounting_check_settings(bank_account_id) VALUES(?)', bankAccountId);
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await first(
        db,
        'SELECT next_check_number FROM accounting_check_settings WHERE bank_account_id=?',
        bankAccountId
      ),
      start = Number(current?.next_check_number);
    if (!Number.isSafeInteger(start) || start < 1) throw new AccountingDatabaseError('Check settings are invalid.');
    const result = await run(
      db,
      "UPDATE accounting_check_settings SET next_check_number=?,version=version+1,updated_at=datetime('now') WHERE bank_account_id=? AND next_check_number=?",
      start + requested,
      bankAccountId,
      start
    );
    if (result.meta?.changes) return start;
  }
  throw new AccountingDatabaseError('Check numbers are being reserved by another request. Try again.', {
    details: { conflict: true },
  });
}
export async function getCheckSettings(db, { actor, entitlementTier, bankAccountId }) {
  capability(actor, 'ap.pay');
  parish(entitlementTier);
  await nextCheckNumber(db, { actor, entitlementTier, bankAccountId });
  const r = await first(db, 'SELECT * FROM accounting_check_settings WHERE bank_account_id=?', bankAccountId);
  return Object.freeze({
    bankAccountId: r.bank_account_id,
    nextCheckNumber: Number(r.next_check_number),
    checkStyle: r.check_style,
    payerName: r.payer_name,
    payerAddress: r.payer_address,
    signatureLine1: r.signature_line_1,
    signatureLine2: r.signature_line_2,
    version: Number(r.version),
  });
}
export async function seedCheckPayerIdentity(
  db,
  { actor, entitlementTier, bankAccountId, payerName = '', payerAddress = '' }
) {
  capability(actor, 'ap.pay');
  parish(entitlementTier);
  const current = await getCheckSettings(db, { actor, entitlementTier, bankAccountId }),
    name = text(payerName),
    address = text(payerAddress),
    nextName = text(current.payerName) || name,
    nextAddress = text(current.payerAddress) || address;
  if (nextName === text(current.payerName) && nextAddress === text(current.payerAddress)) return current;
  const result = await run(
    db,
    "UPDATE accounting_check_settings SET payer_name=?,payer_address=?,version=version+1,updated_at=datetime('now') WHERE bank_account_id=? AND version=?",
    nextName,
    nextAddress,
    bankAccountId,
    Number(current.version)
  );
  if (!result.meta?.changes) return getCheckSettings(db, { actor, entitlementTier, bankAccountId });
  return getCheckSettings(db, { actor, entitlementTier, bankAccountId });
}
export async function updateCheckSettings(db, { actor, entitlementTier, bankAccountId, expectedVersion, patch }) {
  capability(actor, 'ap.pay');
  parish(entitlementTier);
  await run(db, 'INSERT OR IGNORE INTO accounting_check_settings(bank_account_id) VALUES(?)', bankAccountId);
  const current = await first(db, 'SELECT * FROM accounting_check_settings WHERE bank_account_id=?', bankAccountId);
  if (Number(current.version) !== Number(expectedVersion || current.version))
    throw new AccountingDatabaseError('Check settings changed.', { details: { conflict: true } });
  const next = Number(patch.nextCheckNumber ?? current.next_check_number),
    style = text(patch.checkStyle ?? current.check_style);
  if (!Number.isSafeInteger(next) || next < 1)
    throw new ValidationError('Next check number must be a positive whole number.');
  if (!['top_check_two_stubs', 'bottom_check_two_stubs', 'check_only'].includes(style))
    throw new ValidationError('Check stock style is not supported.');
  await run(
    db,
    `UPDATE accounting_check_settings SET next_check_number=?,check_style=?,payer_name=?,payer_address=?,signature_line_1=?,signature_line_2=?,version=version+1,updated_at=datetime('now') WHERE bank_account_id=? AND version=?`,
    next,
    style,
    text(patch.payerName ?? current.payer_name),
    text(patch.payerAddress ?? current.payer_address),
    text(patch.signatureLine1 ?? current.signature_line_1),
    text(patch.signatureLine2 ?? current.signature_line_2),
    bankAccountId,
    Number(current.version)
  );
  return getCheckSettings(db, { actor, entitlementTier, bankAccountId });
}
export async function recordCheckPrint(db, { actor, entitlementTier, paymentId, reason = '' }) {
  capability(actor, 'ap.pay');
  parish(entitlementTier);
  const payment = await first(
    db,
    "SELECT * FROM accounting_payments WHERE id=? AND payment_method='check' AND status IN('approved','posted','cleared')",
    paymentId
  );
  if (!payment) throw new ValidationError('Only an active check payment can be printed.');
  const prior = await first(
      db,
      'SELECT COUNT(*) count FROM accounting_check_print_events WHERE payment_id=?',
      paymentId
    ),
    sequence = Number(prior.count) + 1;
  if (sequence > 1 && !text(reason)) throw new ValidationError('A reason is required when reprinting a check.');
  await run(
    db,
    'INSERT INTO accounting_check_print_events(id,payment_id,print_sequence,print_type,printed_by_actor_id,reason) VALUES(?,?,?,?,?,?)',
    id('checkprint'),
    paymentId,
    sequence,
    sequence === 1 ? 'original' : 'reprint',
    actor.id,
    text(reason) || null
  );
  if (sequence === 1)
    await run(
      db,
      "UPDATE accounting_check_settings SET next_check_number=MAX(next_check_number,?+1),version=version+1,updated_at=datetime('now') WHERE bank_account_id=?",
      Number(payment.check_number),
      payment.bank_account_id
    );
  return paymentDetail(db, {
    actor: { ...actor, capabilities: [...new Set([...(actor.capabilities || []), 'ap.view'])] },
    entitlementTier,
    paymentId,
  });
}
export async function voidPayment(db, { actor, entitlementTier, paymentId, expectedVersion, reason }) {
  capability(actor, 'ap.void');
  parish(entitlementTier);
  if (!text(reason)) throw new ValidationError('A void reason is required.');
  const payment = await first(db, 'SELECT * FROM accounting_payments WHERE id=?', paymentId);
  if (
    !payment ||
    Number(payment.version) !== Number(expectedVersion) ||
    !['approved', 'posted'].includes(payment.status)
  )
    throw new AccountingDatabaseError('Payment changed or cannot be voided.', { details: { conflict: true } });
  if (payment.status === 'posted') {
    const elevated = {
      ...actor,
      capabilities: [...new Set([...(actor.capabilities || []), 'accounting.journals.reverse'])],
    };
    await reverseJournalEntry(db, {
      actor: elevated,
      journalEntryId: payment.posted_journal_entry_id,
      entryDate: new Date().toISOString().slice(0, 10),
      reason: text(reason),
      idempotencyKey: `ap:void:${payment.id}`,
      requestHash: await hash({ paymentId, reason: text(reason) }),
    });
    const apps = await all(db, 'SELECT * FROM accounting_payment_applications WHERE payment_id=?', payment.id);
    for (const app of apps)
      await run(
        db,
        `UPDATE accounting_bills SET amount_paid=MAX(0,amount_paid-?),amount_due=amount_due+?,payment_status=CASE WHEN amount_paid-?<=0 THEN 'unpaid' ELSE 'partially_paid' END,status=CASE WHEN amount_paid-?<=0 THEN 'posted' ELSE 'partially_paid' END,version=version+1,updated_at=datetime('now') WHERE id=?`,
        Number(app.amount_applied),
        Number(app.amount_applied),
        Number(app.amount_applied),
        Number(app.amount_applied),
        app.bill_id
      );
  }
  await run(
    db,
    "UPDATE accounting_payments SET status='voided',voided_at=?,memo=trim(COALESCE(memo,'')||' · VOID: '||?),version=version+1,updated_at=datetime('now') WHERE id=? AND version=?",
    now(),
    text(reason),
    payment.id,
    Number(expectedVersion)
  );
  return paymentDto(await first(db, 'SELECT * FROM accounting_payments WHERE id=?', payment.id));
}

function paymentRunDto(row) {
  return (
    row &&
    Object.freeze({
      id: row.id,
      bankAccountId: row.bank_account_id,
      bankAccountName: row.bank_account_name || '',
      runDate: row.run_date,
      status: row.status,
      memo: row.memo || '',
      paymentCount: Number(row.payment_count || 0),
      totalAmount: Number(row.total_amount || 0),
      createdAt: row.created_at,
      postedAt: row.posted_at || '',
      version: Number(row.version),
    })
  );
}

export async function listPaymentRuns(db, { actor, entitlementTier }) {
  capability(actor, 'ap.view');
  parish(entitlementTier);
  const rows = await all(
    db,
    `SELECT r.*,b.name bank_account_name,COUNT(i.id) payment_count,COALESCE(SUM(p.total_amount),0) total_amount
    FROM accounting_payment_runs r JOIN accounting_bank_accounts b ON b.id=r.bank_account_id
    LEFT JOIN accounting_payment_run_items i ON i.payment_run_id=r.id LEFT JOIN accounting_payments p ON p.id=i.payment_id
    GROUP BY r.id ORDER BY r.run_date DESC,r.created_at DESC`
  );
  return Object.freeze(rows.map(paymentRunDto));
}

export async function paymentRunDetail(db, { actor, entitlementTier, paymentRunId }) {
  capability(actor, 'ap.view');
  parish(entitlementTier);
  const row = await first(
    db,
    `SELECT r.*,b.name bank_account_name FROM accounting_payment_runs r
    JOIN accounting_bank_accounts b ON b.id=r.bank_account_id WHERE r.id=?`,
    paymentRunId
  );
  if (!row) throw new ValidationError('Payment run was not found.');
  const payments = await all(
    db,
    `SELECT i.sequence,p.*,v.display_name vendor_name
    FROM accounting_payment_run_items i JOIN accounting_payments p ON p.id=i.payment_id
    JOIN accounting_vendors v ON v.id=p.vendor_id WHERE i.payment_run_id=? ORDER BY i.sequence`,
    paymentRunId
  );
  return Object.freeze({
    run: paymentRunDto({
      ...row,
      payment_count: payments.length,
      total_amount: payments.reduce((sum, payment) => sum + Number(payment.total_amount), 0),
    }),
    payments: Object.freeze(
      payments.map((payment) =>
        Object.freeze({ ...paymentDto(payment), sequence: Number(payment.sequence), vendorName: payment.vendor_name })
      )
    ),
  });
}

export async function createPaymentRun(db, { actor, entitlementTier, bankAccountId, runDate, selections, memo = '' }) {
  capability(actor, 'ap.pay');
  parish(entitlementTier);
  if (!DATE.test(runDate) || !Array.isArray(selections) || !selections.length || selections.length > 100)
    throw new ValidationError('Run date and 1–100 vendor selections are required.');
  const vendorIds = new Set();
  for (const selection of selections) {
    if (vendorIds.has(selection.vendorId))
      throw new ValidationError('Each vendor may appear only once in a payment run.');
    vendorIds.add(selection.vendorId);
    await validatePaymentSelection(db, {
      vendorId: selection.vendorId,
      bankAccountId,
      paymentDate: runDate,
      applications: selection.applications,
    });
  }
  const startingCheckNumber = await reserveCheckNumbers(db, {
    actor,
    entitlementTier,
    bankAccountId,
    count: selections.length,
  });
  const paymentRunId = id('paymentrun');
  await run(
    db,
    `INSERT INTO accounting_payment_runs(id,bank_account_id,run_date,memo,created_by_actor_type,created_by_actor_id)
    VALUES(?,?,?,?,?,?)`,
    paymentRunId,
    bankAccountId,
    runDate,
    text(memo) || null,
    actor.type || 'platform_user',
    actor.id
  );
  for (let index = 0; index < selections.length; index++) {
    const selection = selections[index];
    const payment = await createPayment(db, {
      actor,
      entitlementTier,
      input: {
        vendorId: selection.vendorId,
        bankAccountId,
        paymentDate: runDate,
        paymentMethod: 'check',
        checkNumber: String(startingCheckNumber + index),
        memo,
        applications: selection.applications,
      },
    });
    await run(
      db,
      'INSERT INTO accounting_payment_run_items(id,payment_run_id,payment_id,sequence) VALUES(?,?,?,?)',
      id('paymentrunitem'),
      paymentRunId,
      payment.id,
      index + 1
    );
  }
  return paymentRunDetail(db, {
    actor: { ...actor, capabilities: [...new Set([...(actor.capabilities || []), 'ap.view'])] },
    entitlementTier,
    paymentRunId,
  });
}

/**
 * Posts payments sequentially. Posted journal entries are immutable, so a
 * failure does not roll back earlier items. The run remains draft and the
 * per-item results let callers retry only approved payments.
 */
export async function postPaymentRun(db, { actor, entitlementTier, paymentRunId, expectedVersion }) {
  capability(actor, 'ap.pay');
  parish(entitlementTier);
  const current = await first(db, 'SELECT * FROM accounting_payment_runs WHERE id=?', paymentRunId);
  if (!current || current.status !== 'draft' || Number(current.version) !== Number(expectedVersion))
    throw new AccountingDatabaseError('Payment run changed or cannot be posted.', { details: { conflict: true } });
  const items = await all(
    db,
    `SELECT i.sequence,p.id,p.status,p.version FROM accounting_payment_run_items i
    JOIN accounting_payments p ON p.id=i.payment_id WHERE i.payment_run_id=? ORDER BY i.sequence`,
    paymentRunId
  );
  const results = [];
  for (const item of items) {
    if (item.status === 'posted' || item.status === 'cleared') {
      results.push(
        Object.freeze({
          paymentId: item.id,
          sequence: Number(item.sequence),
          status: item.status,
          ok: true,
          alreadyPosted: true,
        })
      );
      continue;
    }
    try {
      const payment = await postPayment(db, {
        actor,
        entitlementTier,
        paymentId: item.id,
        expectedVersion: Number(item.version),
        idempotencyKey: `payment-run:${paymentRunId}:${item.id}`,
      });
      results.push(
        Object.freeze({ paymentId: item.id, sequence: Number(item.sequence), status: payment.status, ok: true })
      );
    } catch (error) {
      results.push(
        Object.freeze({
          paymentId: item.id,
          sequence: Number(item.sequence),
          status: item.status,
          ok: false,
          error: error?.message || 'Payment could not be posted.',
        })
      );
    }
  }
  const remaining = await first(
    db,
    `SELECT COUNT(*) count FROM accounting_payment_run_items i JOIN accounting_payments p ON p.id=i.payment_id
    WHERE i.payment_run_id=? AND p.status NOT IN('posted','cleared')`,
    paymentRunId
  );
  if (Number(remaining?.count) === 0)
    await run(
      db,
      "UPDATE accounting_payment_runs SET status='posted',posted_at=?,version=version+1 WHERE id=? AND status='draft' AND version=?",
      now(),
      paymentRunId,
      Number(expectedVersion)
    );
  const detail = await paymentRunDetail(db, {
    actor: { ...actor, capabilities: [...new Set([...(actor.capabilities || []), 'ap.view'])] },
    entitlementTier,
    paymentRunId,
  });
  return Object.freeze({ ...detail, results: Object.freeze(results), complete: Number(remaining?.count) === 0 });
}

export async function printPaymentRun(db, { actor, entitlementTier, paymentRunId, reason = '' }) {
  capability(actor, 'ap.pay');
  parish(entitlementTier);
  const runRow = await first(
    db,
    "SELECT * FROM accounting_payment_runs WHERE id=? AND status IN('draft','posted')",
    paymentRunId
  );
  if (!runRow) throw new ValidationError('Payment run cannot be printed.');
  const items = await all(
    db,
    `SELECT i.sequence,p.id,(SELECT COUNT(*) FROM accounting_check_print_events e WHERE e.payment_id=p.id) print_count
    FROM accounting_payment_run_items i JOIN accounting_payments p ON p.id=i.payment_id WHERE i.payment_run_id=? ORDER BY i.sequence`,
    paymentRunId
  );
  if (items.some((item) => Number(item.print_count) > 0) && !text(reason))
    throw new ValidationError('A reason is required when reprinting any check in a payment run.');
  const details = [];
  for (const item of items)
    details.push(await recordCheckPrint(db, { actor, entitlementTier, paymentId: item.id, reason }));
  return Object.freeze({ paymentRunId, checkCount: details.length, html: printableChecks(details) });
}

const FORM_1099_THRESHOLD_CENTS = 60000;
const FORM_1099_DISCLAIMER =
  'Data-preparation aid only; this export is not a filed or filing-ready Form 1099-NEC or Form 1096.';

export async function vendor1099Summary(db, { actor, entitlementTier, calendarYear }) {
  capability(actor, 'ap.view');
  parish(entitlementTier);
  const year = String(calendarYear || '');
  if (!/^\d{4}$/.test(year)) throw new ValidationError('A four-digit calendar year is required.');
  const rows = await all(
    db,
    `SELECT v.id vendor_id,v.display_name,v.legal_name,v.tax_id_last4,v.tax_classification,
    COALESCE(SUM(CASE WHEN p.status IN('posted','cleared') AND strftime('%Y',p.payment_date)=?
      AND p.payment_method NOT IN ('debit_card','credit_card') THEN p.total_amount ELSE 0 END),0) total_paid
    FROM accounting_vendors v LEFT JOIN accounting_payments p ON p.vendor_id=v.id
    WHERE v.requires_1099_review=1 GROUP BY v.id ORDER BY v.display_name`,
    year
  );
  return Object.freeze({
    calendarYear: year,
    threshold: FORM_1099_THRESHOLD_CENTS,
    disclaimer: FORM_1099_DISCLAIMER,
    vendors: Object.freeze(
      rows.map((row) =>
        Object.freeze({
          vendorId: row.vendor_id,
          displayName: row.display_name,
          legalName: row.legal_name || '',
          taxIdLast4: row.tax_id_last4 || '',
          taxClassification: row.tax_classification || '',
          totalPaid: Number(row.total_paid),
          meetsThreshold: Number(row.total_paid) >= FORM_1099_THRESHOLD_CENTS,
        })
      )
    ),
  });
}

function csvCell(value) {
  const raw = String(value ?? '');
  const rendered = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(rendered) ? `"${rendered.replaceAll('"', '""')}"` : rendered;
}

export function vendor1099SummaryCsv(report) {
  const lines = [
    ['Disclaimer', report.disclaimer],
    ['Calendar year', report.calendarYear],
    [],
    [
      'Vendor ID',
      'Display name',
      'Legal name',
      'Tax ID last 4',
      'Tax classification',
      'Eligible non-card payments',
      'Meets $600 threshold',
    ],
  ];
  for (const vendor of report.vendors || [])
    lines.push([
      vendor.vendorId,
      vendor.displayName,
      vendor.legalName,
      vendor.taxIdLast4,
      vendor.taxClassification,
      vendor.totalPaid,
      vendor.meetsThreshold ? 'Yes' : 'No',
    ]);
  return `${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
