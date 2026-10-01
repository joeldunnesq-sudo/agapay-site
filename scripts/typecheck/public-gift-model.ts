import {
  publicParishGiftFromOffering,
  giftDisplayName,
  type PublicGiftInput,
} from '../../src/lib/public-gift-model.js';
import { summarizeStoredParishGifts } from '../../src/lib/stored-giving-summary.js';
const input: PublicGiftInput = { amountCents: '100', living: [null, 'name'], createdAt: new Date() };
const gift = publicParishGiftFromOffering(input);
const amount: number = gift.amountCents;
const kind: 'recurring' | 'one_time' = gift.type;
const names: unknown[] = gift.commemorationNames;
void [amount, kind, names];
summarizeStoredParishGifts([gift]);
// @ts-expect-error: dates must be supported Date inputs.
publicParishGiftFromOffering({ paidAt: {} });
// @ts-expect-error: legacy display output is not validated as a string.
const name: string = giftDisplayName(input);
void name;
// @ts-expect-error: array elements retain unvalidated legacy values.
const person: string = gift.commemorationNames[0];
void person;
// @ts-expect-error: input fields are read-only.
input.amountCents = 200;
