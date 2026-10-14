import type { AccountingActions } from '../../src/routes/accounting.js';
import type { DonorActions } from '../../src/routes/donor.js';
import type { OrganizationActions } from '../../src/routes/organization.js';
import type { PublicActions } from '../../src/routes/public.js';
import type { RegistrationRecord } from '../../src/organizations/types.js';
import { dispatchRouteRegistries } from '../../src/routes/registry.js';
import { provisionAccountingDatabase, type ProvisioningAdapter } from '../../src/accounting/provisioning/service.js';
import { printableCheck } from '../../src/accounting/payables/check-printing.js';
import { invoicePaymentIntentId } from '../../src/payments/donation-events.js';
import { observeScheduledTask } from '../../src/operations/scheduled-task-observer.js';

declare const request: Request;
declare const environment: { tenant: string };
declare const accounting: AccountingActions<typeof environment>;
declare const donor: DonorActions<typeof environment, ExecutionContext>;
declare const publicActions: PublicActions<typeof environment>;
declare const organization: OrganizationActions<typeof environment, RegistrationRecord>;
declare const execution: ExecutionContext;
declare const adapter: ProvisioningAdapter;
accounting.handleAccountingLedger(request, environment, 'parish');
donor.handleDonorGroups(request, environment, execution);
publicActions.handleHealth(environment);
organization.verifyParishDashboardBearer({ parishId: 'parish' }, 'token');
const result: Promise<0 | null> = dispatchRouteRegistries([() => 0 as const], { tenant: 'parish' });
void result;
const observed: Promise<{ processed: number }> = observeScheduledTask('job', Promise.resolve({ processed: 1 }));
void observed;
void provisionAccountingDatabase({ adapter, parishId: 'parish', environment: 'staging' });
void invoicePaymentIntentId({ payments: { data: [{ status: 'paid', payment: { payment_intent: { id: 'pi_1' } } }] } });
// @ts-expect-error Accounting handlers require a tenant identifier.
accounting.handleAccountingLedger(request, environment);
// @ts-expect-error Execution context cannot be replaced with a resource identifier.
donor.handleDonorGroups(request, environment, 'parish');
// @ts-expect-error Public health accepts the environment, not a Request.
publicActions.handleHealth(request);
// @ts-expect-error Provisioning identifiers are strings.
void provisionAccountingDatabase({ adapter, parishId: 42, environment: 'staging' });
// @ts-expect-error Stripe references must be identifiers or objects with an id.
void invoicePaymentIntentId({ payment_intent: 42 });
// @ts-expect-error Check rendering requires payment, vendor, applications and settings.
void printableCheck({ payment: { checkNumber: '1' } });
