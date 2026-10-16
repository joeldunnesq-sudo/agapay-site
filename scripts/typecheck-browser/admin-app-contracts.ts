import type { AdminAppBindings } from '../../src/browser/admin/app.js';
import type { AdminAppRegistration, AdminAppPayload, AdminAppOptions } from '../../src/browser/admin/app-contracts.js';
type IsAny<T> = 0 extends 1 & T ? true : false;
const checkedPayload: IsAny<AdminAppPayload> = false;
const registration: AdminAppRegistration = {
  reference: 'fixture',
  parishId: 'fixture',
  subscriptionMonthlyCents: 12900,
  sacramentsEnabled: true,
};
const options: AdminAppOptions = { sendDashboardInvite: false, preserveSelection: true };
let inFlight: AdminAppBindings['registrationAutosaveInFlight'] = false;
inFlight = true;
// @ts-expect-error Amounts remain numeric cents in the Admin contract.
const invalidAmount: AdminAppRegistration = { subscriptionMonthlyCents: '12900' };
// @ts-expect-error Review options cannot enable an invite using arbitrary text.
const invalidInvite: AdminAppOptions = { sendDashboardInvite: 'yes' };
// @ts-expect-error The API error is textual, never a raw object.
const invalidError: AdminAppPayload = { error: { message: 'bad' } };
void [checkedPayload, registration, options, inFlight, invalidAmount, invalidInvite, invalidError];
