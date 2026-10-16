import { handleDonorLogin } from '../../src/handlers/donor.js';
import { handleStripeWebhook } from '../../src/handlers/stripe.js';
import { handleAdminRegistrations } from '../../src/handlers/admin.js';
import { assignDirectoryReviewItem } from '../../src/directory/admin.js';
import { getSelfServiceProfile } from '../../src/directory/self-service.js';
import type { DirectoryReviewContext } from '../../src/directory/admin-operation-contracts.js';
import type { SelfServiceContext } from '../../src/directory/self-service-operation-contracts.js';
declare const request: Request;
declare const env: Env;
declare const review: DirectoryReviewContext;
declare const member: SelfServiceContext;
const authenticated: Promise<Response> = handleDonorLogin(request, env);
const webhook: Promise<Response> = handleStripeWebhook(request, env);
const registrations: Promise<Response> = handleAdminRegistrations(request, env);
assignDirectoryReviewItem(env, { context: review, sourceType: 'change_request', sourceId: 'request-1' });
getSelfServiceProfile(env, { context: member });
const canViewAudit: boolean = review.permissions.canViewAudit;
if (member.claimed) {
  const personId: string = member.currentPerson.id;
  void personId;
}
void [authenticated, webhook, registrations, canViewAudit];
// @ts-expect-error Authentication requires a real HTTP Request, not an unparsed URL.
handleDonorLogin('/api/donor/login', env);
// @ts-expect-error Webhook secrets are strings; a numeric binding cannot verify Stripe signatures.
handleStripeWebhook(request, { STRIPE_WEBHOOK_SECRET: 123 });
// @ts-expect-error Directory review requires the resolved authorization context.
assignDirectoryReviewItem(env, { sourceType: 'change_request', sourceId: 'request-1' });
// @ts-expect-error Review permissions are explicit boolean capabilities.
const stringPermission: string = review.permissions.canViewAudit;
// @ts-expect-error An unclaimed profile has no linked person.
const unconditionalPerson: string = member.currentPerson.id;
void [stringPermission, unconditionalPerson];
