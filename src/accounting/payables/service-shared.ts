import { validateAccountingDate } from '../validation.js';
import type {
  PortabilityDatabase,
  LedgerServiceActor,
  PayablesSqlRow,
  PayablesInput,
} from './service-composition-contracts.js';

import { AccountingDatabaseError, ValidationError } from '../errors.js';

import { createJournalDraft, postJournalEntry, reverseJournalEntry } from '../ledger/service.js';

import { printableChecks } from './check-printing.js';
export {
  AccountingDatabaseError,
  ValidationError,
  createJournalDraft,
  postJournalEntry,
  reverseJournalEntry,
  printableChecks,
};

export const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function id(p: string) {
  return `${p}_${crypto.randomUUID()}`;
}

export function now() {
  return new Date().toISOString();
}

export async function first(db: PortabilityDatabase, q: string, ...p: unknown[]) {
  return db
    .prepare(q)
    .bind(...p)
    .first<PayablesSqlRow>();
}

export async function all(db: PortabilityDatabase, q: string, ...p: unknown[]) {
  return (
    (
      await db
        .prepare(q)
        .bind(...p)
        .all<PayablesSqlRow>()
    ).results || []
  );
}

export async function run(db: PortabilityDatabase, q: string, ...p: unknown[]) {
  return db
    .prepare(q)
    .bind(...p)
    .run();
}

export function capability(actor: LedgerServiceActor, c: string) {
  if (!actor?.id || !actor.capabilities?.includes(c))
    throw new AccountingDatabaseError('Accounts Payable capability is required.', { details: { capability: c } });
}

export function parish(tier: unknown) {
  if (tier !== 'parish') throw new AccountingDatabaseError('Accounts Payable is available with Parish Accounting.');
}

export function text(v: unknown) {
  return String(v ?? '').trim();
}

export async function hash(v: unknown) {
  const b = new TextEncoder().encode(JSON.stringify(v));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

export function vendorDto(r: PayablesSqlRow | null) {
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

export function billDto(r: PayablesSqlRow | null) {
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

export function paymentDto(r: PayablesSqlRow | null) {
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

export async function eligibleAccount(db: PortabilityDatabase, accountId: string | undefined) {
  return (
    accountId &&
    first(
      db,
      `SELECT a.id,t.category FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id WHERE a.id=? AND a.is_active=1 AND a.archived_at IS NULL AND a.is_posting_account=1 AND t.category IN('expense','asset')`,
      accountId
    )
  );
}

export async function transition(
  db: PortabilityDatabase,
  billId: string,
  expectedVersion: unknown,
  from: string,
  set: string,
  params: unknown[] = []
) {
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
  return billDto((await first(db, 'SELECT * FROM accounting_bills WHERE id=?', billId))!)!;
}

export async function validatePaymentSelection(db: PortabilityDatabase, input: PayablesInput) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input?.paymentDate || '') ||
    !Array.isArray(input.applications) ||
    !input.applications.length
  )
    throw new ValidationError('Payment date and bill applications are required.');
  validateAccountingDate(input.paymentDate);
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
  const billIds = new Set();
  for (const app of input.applications) {
    if (!app || billIds.has(app.billId)) throw new ValidationError('Each bill can appear only once in a payment.');
    billIds.add(app.billId);
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
    if (!Number.isSafeInteger(total))
      throw new ValidationError('Payment total exceeds the supported whole-cent range.');
  }
  if (input.totalAmount !== undefined && Number(input.totalAmount) !== total)
    throw new ValidationError('Payment total must equal its bill applications.');
  return { vendor, bank, total, paymentMethod };
}

export function paymentRunDto(row: PayablesSqlRow | null) {
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
