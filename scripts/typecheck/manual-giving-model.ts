import { manualAccountingGifts, type ManualGivingRow } from '../../src/lib/manual-giving-model.js';
import { subtractLinkedOutsideGifts } from '../../src/lib/outside-gift-composition.js';
import { summarizeStoredParishGifts } from '../../src/lib/stored-giving-summary.js';
declare const rows: readonly ManualGivingRow[];
const gifts = manualAccountingGifts(rows);
const source: 'manual_accounting' = gifts[0].source;
const amount: number = gifts[0].parishNetCents;
const recurring: false = gifts[0].recurring;
void [source, amount, recurring];
summarizeStoredParishGifts(subtractLinkedOutsideGifts(gifts, []));
// @ts-expect-error: result rows require the selected aliases.
manualAccountingGifts([{ entry_id: 'e' }]);
// @ts-expect-error: selected dates are strings.
const row: ManualGivingRow = { ...rows[0], gift_date: 1 };
void row;
// @ts-expect-error: input records are read-only.
rows[0].credit_amount = 1;
// @ts-expect-error: projected amounts are numbers.
const invalid: string = gifts[0].amountCents;
void invalid;
