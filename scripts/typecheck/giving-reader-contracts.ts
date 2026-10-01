import { parseJsonRow } from '../../src/lib/json-rows.js';
import { listKvKeys } from '../../src/lib/kv-reads.js';
import { visibleDonationRecords } from '../../src/payments/donation-visibility.js';
import { loadParishPaidOfferings, loadParishRecurringOfferings } from '../../src/handlers/parish-giving-read-models.js';
import { summarizeParishRecurringHealth } from '../../src/lib/recurring-health.js';
const parsed = parseJsonRow({ data: '{}' });
// @ts-expect-error Stored JSON needs validation before property access.
void parsed.id;
// @ts-expect-error Serialized rows contain strings, not objects.
parseJsonRow({ data: {} });
// @ts-expect-error Page limits must be numeric.
void listKvKeys({}, { limit: '1' });
// @ts-expect-error Parish identifiers must be strings.
void loadParishPaidOfferings({}, 42);
const kept = visibleDonationRecords([{ stripeSubscriptionId: 'sub', metadata: 42 }]);
const metadata: number = kept[0]!.metadata;
void metadata;
async function useReader() {
  const records = await loadParishRecurringOfferings({}, 'p');
  return summarizeParishRecurringHealth(records);
}
void useReader;
