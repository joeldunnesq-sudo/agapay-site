import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [evidencePath, expectedBuild, ...extra] = process.argv.slice(2);
if (!evidencePath || !expectedBuild || extra.length) {
  throw new Error('Usage: node scripts/verify-stripe-refund-release.mjs <staging-evidence.json> <expected-build>');
}

const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
assert.equal(evidence.environment, 'staging', 'Evidence must come from staging');
assert.equal(evidence.stripeMode, 'test', 'Evidence must come from Stripe test mode');
assert.equal(evidence.build, expectedBuild, 'Evidence must match the release candidate');
assert.equal(
  evidence.stripeDestinationUrl,
  'https://agapay-site-staging.joeldunnesq.workers.dev/api/stripe/webhook',
  'Stripe must deliver to the dedicated staging webhook'
);
const { fixture, refundUpdate, replay, beforePostingWasEnabled, stagingRecords } = evidence;
assert.match(fixture.refundId, /^re_[A-Za-z0-9]+$/);
assert.ok(Number.isSafeInteger(fixture.amountCents) && fixture.amountCents > 0);
assert.match(refundUpdate.eventId, /^evt_[A-Za-z0-9]+$/);
assert.equal(refundUpdate.stripeDeliveryHttpStatus, 200, 'Stripe must record successful delivery');
assert.ok(
  stagingRecords.stripeEvents.some(
    (event) =>
      event.id === refundUpdate.eventId && event.event_type === 'refund.updated' && event.status === 'processed'
  ),
  'Staging must process the matching refund.updated'
);

const before = beforePostingWasEnabled.accountingSourceEvents.find((event) => event.refund_id === fixture.refundId);
assert.equal(before?.ledger_count, 0, 'The refund must start with zero journal entries');
const posted = refundUpdate.accountingRefund;
assert.equal(posted.refund_id, fixture.refundId);
assert.equal(posted.journal_status, 'posted');
assert.equal(posted.matching_entries, 1, 'The refund update must post exactly one journal entry');
assert.equal(posted.total_debits, fixture.amountCents);
assert.equal(posted.total_credits, fixture.amountCents);
assert.equal(replay.eventId, refundUpdate.eventId, 'The same Stripe event must be replayed');
assert.equal(replay.workerLog, 'stripe.webhook.duplicate');
assert.equal(replay.accounting.refund_sources, 1);
assert.equal(replay.accounting.refund_entries, 1);
assert.equal(replay.accounting.posted_refund_entries, 1);
assert.equal(replay.accounting.journal_entry_id, posted.journal_entry_id);
assert.equal(replay.accounting.debit_cents, fixture.amountCents);
assert.equal(replay.accounting.credit_cents, fixture.amountCents);
assert.equal(replay.idempotency.posting_keys, 1);
console.log(`PASS - ${expectedBuild} received and posted the staging Stripe refund exactly once across replay`);
