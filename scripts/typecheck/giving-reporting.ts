import { givingContribution, type GivingContribution } from '../../src/lib/giving-contributions.js';
import { manualIncomeTotalCents } from '../../src/lib/stewardship-income.js';
import { readStewardshipGivingMix, type StewardshipGivingMix } from '../../src/lib/stewardship-giving.js';

declare const env: Env;
declare const externalAmount: unknown;
const contribution: GivingContribution = givingContribution({ amountCents: externalAmount });
const income: Promise<number> = manualIncomeTotalCents(env, 'parish', '2026-01-01', '2026-12-31');
const mix: Promise<StewardshipGivingMix | null> = readStewardshipGivingMix(env, 'parish', 2026);
void [contribution, income, mix];
// @ts-expect-error: an offering must be a record, not a nullable external payload.
givingContribution(null);
// @ts-expect-error: misspelled amount properties should be caught for typed callers.
givingContribution({ amoutCents: 100 });
// @ts-expect-error: computed contribution values are numbers.
const text: string = contribution.contributionCents;
void text;
// @ts-expect-error: reporting requires a database binding.
manualIncomeTotalCents({}, 'parish', '2026-01-01', '2026-12-31');
// @ts-expect-error: a year must be numeric before date bounds are constructed.
readStewardshipGivingMix(env, 'parish', '2026');
// @ts-expect-error: parish IDs are required strings.
readStewardshipGivingMix(env, undefined, 2026);
declare const row: StewardshipGivingMix;
// @ts-expect-error: database aggregate values require validation or conversion.
const total: number = row.total_cents;
void total;
