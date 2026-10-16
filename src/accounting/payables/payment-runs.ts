import type { PortabilityDatabase, PayablesOptions } from './service-composition-contracts.js';
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
  paymentDto,
  validatePaymentSelection,
  paymentRunDto,
  AccountingDatabaseError,
  ValidationError,
  printableChecks,
} from './service-shared.js';
import { createPayment, postPayment } from './service.js';
import { reserveCheckNumbers, recordCheckPrint } from './checks.js';

export async function listPaymentRuns(
  db: PortabilityDatabase,
  { actor, entitlementTier }: Pick<PayablesOptions, 'actor' | 'entitlementTier'>
) {
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

export async function paymentRunDetail(
  db: PortabilityDatabase,
  { actor, entitlementTier, paymentRunId }: Pick<PayablesOptions, 'actor' | 'entitlementTier' | 'paymentRunId'>
) {
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

export async function createPaymentRun(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    bankAccountId,
    runDate,
    selections,
    memo = '',
  }: Pick<PayablesOptions, 'actor' | 'entitlementTier' | 'bankAccountId' | 'runDate' | 'selections' | 'memo'>
) {
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
    const payment = (await createPayment(db, {
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
    }))!;
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
export async function postPaymentRun(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    paymentRunId,
    expectedVersion,
  }: Pick<PayablesOptions, 'actor' | 'entitlementTier' | 'paymentRunId' | 'expectedVersion'>
) {
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
          error: (error as Error | undefined)?.message || 'Payment could not be posted.',
        })
      );
    }
  }
  const remaining = (await first(
    db,
    `SELECT COUNT(*) count FROM accounting_payment_run_items i JOIN accounting_payments p ON p.id=i.payment_id
    WHERE i.payment_run_id=? AND p.status NOT IN('posted','cleared')`,
    paymentRunId
  ))!;
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

export async function printPaymentRun(
  db: PortabilityDatabase,
  {
    actor,
    entitlementTier,
    paymentRunId,
    reason = '',
  }: Pick<PayablesOptions, 'actor' | 'entitlementTier' | 'paymentRunId' | 'reason'>
) {
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
