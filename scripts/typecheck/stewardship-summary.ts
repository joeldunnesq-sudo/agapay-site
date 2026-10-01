import { stewardshipGivingSummary, type StewardshipGivingSummary } from '../../src/lib/stewardship-summary.js';
import { manualIncomeTotalCents } from '../../src/lib/stewardship-income.js';
declare const env: Env;
const pending: Promise<StewardshipGivingSummary> = stewardshipGivingSummary(env, 'a', 2026, manualIncomeTotalCents);
void pending;
declare const result: StewardshipGivingSummary;
const total: number = result.total_actual_cents;
const fulfillment: number | null = result.fulfillment_rate_pct;
void [total, fulfillment];
// @ts-expect-error: no pledge target leaves fulfillment null.
const requiredFulfillment: number = result.fulfillment_rate_pct;
void requiredFulfillment;
// @ts-expect-error: the report requires a configured database.
stewardshipGivingSummary({}, 'a', 2026, manualIncomeTotalCents);
// @ts-expect-error: reporting years must be numeric.
stewardshipGivingSummary(env, 'a', '2026', manualIncomeTotalCents);
// @ts-expect-error: the injected manual-income reader must return an asynchronous numeric total.
stewardshipGivingSummary(env, 'a', 2026, async () => '0');
// @ts-expect-error: synchronous dependency results do not satisfy the reader contract.
stewardshipGivingSummary(env, 'a', 2026, () => 0);
// @ts-expect-error: misspelled report properties are not allowed.
void result.total_actaul_cents;
