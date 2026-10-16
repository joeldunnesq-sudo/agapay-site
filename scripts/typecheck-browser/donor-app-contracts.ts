import type { DonorAppBindings, DonorAppWindowHandlers } from '../../src/browser/donor/app.js';
import type { DonorAppPayload, DonorAppProfile, DonorAppNudge } from '../../src/browser/donor/app-contracts.js';
type IsAny<T> = 0 extends 1 & T ? true : false;
const apiResultIsChecked: IsAny<Awaited<ReturnType<DonorAppBindings['donorApi']>>> = false;
const editingCanChange: DonorAppBindings['donorGiftAmountEdited'] = true;
const currentNotification: DonorAppBindings['_nudgeCurrent'] = {
  id: 'notice',
  fiscalYear: '2026',
  parishId: 'test',
  pledgeCents: 10000,
  givenCents: 2500,
};
const payload: DonorAppPayload = {
  donor: { email: 'member@example.test' },
  notifications: currentNotification ? [currentNotification] : [],
};
void [apiResultIsChecked, editingCanChange, payload];
// @ts-expect-error Contact email is text.
const invalidProfile: DonorAppProfile = { email: 42 };
// @ts-expect-error Giving amounts remain numeric cents.
const invalidPledge: DonorAppNudge = { id: 'n', fiscalYear: '2026', parishId: 'p', pledgeCents: '100', givenCents: 0 };
// @ts-expect-error The retained login handler receives a DOM event.
const invalidLogin: Parameters<DonorAppWindowHandlers['loginFromPage']>[0] = 'click';
void [invalidProfile, invalidPledge, invalidLogin];
