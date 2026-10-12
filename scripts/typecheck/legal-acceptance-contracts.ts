import { recordLegalAcceptance, recordOrganizationRegistrationAcceptance } from '../../src/lib/legal-acceptance.js';
declare const env: Partial<Env>;
const request = new Request('https://example.test');
const record = recordLegalAcceptance(env, request, { actorEmail: 'test@example.test' });
const id: Promise<string> = record.then((value) => value.id);
void id;
void recordOrganizationRegistrationAcceptance(env, request, { body: {}, parishId: 'a', reference: 'r' });
// @ts-expect-error request must carry real headers
void recordLegalAcceptance(env, {});
// @ts-expect-error KV must satisfy the platform binding contract
void recordLegalAcceptance({ AGAPAY_REGISTRATIONS: {} }, request);
// @ts-expect-error organization context needs a registration reference
void recordOrganizationRegistrationAcceptance(env, request, { body: {}, parishId: 'a' });
// @ts-expect-error organization identifier must be text
void recordOrganizationRegistrationAcceptance(env, request, { body: {}, parishId: 2, reference: 'r' });
