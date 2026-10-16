// Generated from src/accounting/payables/checks.ts by npm run build:server. Do not edit.
import {
  id,
  now,
  first,
  all,
  run,
  capability,
  parish,
  text,
  hash,
  paymentDto,
  AccountingDatabaseError,
  ValidationError,
  reverseJournalEntry,
} from './service-shared.js';
import { paymentDetail } from './service.js';
import './payment-runs.js';
async function nextCheckNumber(db, { actor, entitlementTier, bankAccountId }) {
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
async function reserveCheckNumbers(db, { actor, entitlementTier, bankAccountId, count }) {
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
async function getCheckSettings(db, { actor, entitlementTier, bankAccountId }) {
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
async function seedCheckPayerIdentity(
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
async function updateCheckSettings(db, { actor, entitlementTier, bankAccountId, expectedVersion, patch }) {
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
async function recordCheckPrint(db, { actor, entitlementTier, paymentId, reason = '' }) {
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
    actor: { ...actor, capabilities: [.../* @__PURE__ */ new Set([...(actor.capabilities || []), 'ap.view'])] },
    entitlementTier,
    paymentId,
  });
}
async function voidPayment(db, { actor, entitlementTier, paymentId, expectedVersion, reason }) {
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
      capabilities: [.../* @__PURE__ */ new Set([...(actor.capabilities || []), 'accounting.journals.reverse'])],
    };
    await reverseJournalEntry(db, {
      actor: elevated,
      journalEntryId: payment.posted_journal_entry_id,
      entryDate: /* @__PURE__ */ new Date().toISOString().slice(0, 10),
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
export {
  getCheckSettings,
  nextCheckNumber,
  recordCheckPrint,
  reserveCheckNumbers,
  seedCheckPayerIdentity,
  updateCheckSettings,
  voidPayment,
};
