import { exportMonthlyGiving, type GivingExportRegistration } from '../../src/lib/monthly-giving-export.js';
declare const env: Env;
declare const request: Request;
const registration: GivingExportRegistration = { timezone: 'UTC', funds: [{ id: 'general', name: 'General' }] };
const result: Promise<Response> = exportMonthlyGiving(request, env, 'parish', registration);
void result;
// @ts-expect-error: the service requires an HTTP request.
exportMonthlyGiving('https://example.test', env, 'parish');
// @ts-expect-error: parish IDs are strings.
exportMonthlyGiving(request, env, 1);
// @ts-expect-error: the database must provide the D1 contract.
exportMonthlyGiving(request, { AGAPAY_DB: {} }, 'parish');
// @ts-expect-error: timezone is a nullable string, not a number.
exportMonthlyGiving(request, env, 'parish', { timezone: 1 });
// @ts-expect-error: registration is a read-only input.
registration.timezone = 'America/Chicago';
