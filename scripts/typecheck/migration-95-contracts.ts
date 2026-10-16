// Compile-only callers for batch 89. These functions are never invoked by the fixture.
import worker from '../../src/worker.js';
import { createBillDraft, createVendor } from '../../src/accounting/payables/service.js';
import { createPasswordRecord, loadDonor } from '../../src/lib/core.js';
import { findRegistrationByParishId, normalizeBookstoreBody } from '../../src/handlers/parish.js';
import { storeGroupMessageAttachment } from '../../src/handlers/donor-groups.js';
import { loadLearnBillingRecord } from '../../src/learn/billing.js';
import type { PortabilityDatabase } from '../../src/portability/contracts.js';
import type { LedgerServiceActor } from '../../src/accounting/ledger/service.js';
import type { PasswordRecord } from '../../src/lib/core.js';

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
export type Batch89CheckedResults = [
  Assert<IsAny<Awaited<ReturnType<typeof createBillDraft>>> extends false ? true : false>,
  Assert<IsAny<Awaited<ReturnType<typeof loadDonor>>> extends false ? true : false>,
  Assert<IsAny<Awaited<ReturnType<typeof findRegistrationByParishId>>> extends false ? true : false>,
  Assert<IsAny<Awaited<ReturnType<typeof loadLearnBillingRecord>>> extends false ? true : false>,
];
export async function batch89Callers(
  db: PortabilityDatabase,
  env: Env,
  request: Request,
  ctx: ExecutionContext,
  actor: LedgerServiceActor,
  bucket: R2Bucket,
  source: ReadableStream<Uint8Array>
) {
  const response: Response = await worker.fetch(request, env, ctx);
  const password: PasswordRecord = await createPasswordRecord('compile-only fixture');
  const product = normalizeBookstoreBody({ name: 'Book', priceCents: '1200' });
  const price: number = product.priceCents;
  await createVendor(db, { actor, entitlementTier: 'parish', input: { displayName: 'Vendor' } });
  const bill = await createBillDraft(db, {
    actor,
    entitlementTier: 'parish',
    input: {
      vendorId: 'vendor',
      billDate: '2026-10-15',
      lines: [{ accountId: 'expense', fundId: 'general', quantity: 1, unitAmount: 1200 }],
    },
  });
  const billId: string = bill.id;
  await storeGroupMessageAttachment(bucket, {
    parishId: 'parish',
    key: 'fixture',
    source,
    contentType: 'audio/mpeg',
    contentLength: 1,
  });
  // @ts-expect-error Bill dates use date strings; runtime validation checks their content.
  await createBillDraft(db, { actor, entitlementTier: 'parish', input: { billDate: 123 } });
  await storeGroupMessageAttachment(bucket, {
    parishId: 'parish',
    key: 'fixture',
    // @ts-expect-error Private attachments require a stream, not arbitrary text.
    source: 'not a stream',
    contentType: 'audio/mpeg',
    contentLength: 1,
  });
  // @ts-expect-error The normalized bookstore price is a number.
  const invalidPrice: string = product.priceCents;
  return { response, password, price, billId, invalidPrice };
}
