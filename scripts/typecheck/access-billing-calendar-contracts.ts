import { authorize, expandRoleTemplate, ROLE_TEMPLATES } from '../../src/lib/authorization.js';
import { createInvitation, grantCapability } from '../../src/lib/memberships.js';
import { nonprofitThresholdRisk } from '../../src/lib/nonprofit-pricing.js';
import type { SubscriptionCheckoutInput } from '../../src/lib/subscription-checkout.js';
import { createSubscriptionCheckoutForRegistration } from '../../src/lib/subscription-checkout.js';
import { googleCalendarPreview, type CalendarRepository } from '../../src/learn/google-calendar.js';
const env: Partial<Env> = {};
const request = new Request('https://example.test');
void authorize(request, env, { parishId: 'parish', capability: 'parish.view' });
const role: string[] = expandRoleTemplate('treasurer');
void role;
const template: readonly string[] | undefined = ROLE_TEMPLATES.treasurer;
void template;
void createInvitation(env, { parishId: 'parish', email: 'person@example.test', capabilities: ['parish.view'] });
void grantCapability(env, { membershipId: 'member', capability: 'parish.view', request });
nonprofitThresholdRisk({ totalNetCents: 10000, nonDonationNetCents: 1000 });
declare const input: SubscriptionCheckoutInput;
void createSubscriptionCheckoutForRegistration({ ...input, introductoryTrialDays: 30 });
declare const repository: CalendarRepository;
googleCalendarPreview(repository, request);
// @ts-expect-error Authentication requires a native Request.
void authorize('https://example.test', env, {});
// @ts-expect-error Capability identities are textual.
void grantCapability(env, { membershipId: 'member', capability: 42 });
// @ts-expect-error Invitation capability lists cannot contain numeric grants.
void createInvitation(env, { parishId: 'parish', email: 'person@example.test', capabilities: [42] });
// @ts-expect-error Trusted trial days are numeric, not a bypass flag.
void createSubscriptionCheckoutForRegistration({ ...input, introductoryTrialDays: true });
// @ts-expect-error Financial volume cents are numeric.
nonprofitThresholdRisk({ totalNetCents: '10000' });
