import { sanitizePublicRegistrationInput, registrationAgreementEvidence } from '../../src/lib/registration-intake.js';
import { registrationRetryIdentity, insertRegistrationOnce } from '../../src/lib/registration-retries.js';
import { saveReviewedRegistration, type ReviewedRegistration } from '../../src/lib/registration-publication.js';
import { loadAdminRegistrationPage, loadAllRegistrations } from '../../src/lib/registrations.js';
import {
  saveContactLead,
  resolveContactDelivery,
  type ContactLeadEnv,
  type ContactLeadRow,
} from '../../src/lib/contact-leads.js';
declare const env: ContactLeadEnv;
declare const row: ContactLeadRow;
const reviewed: ReviewedRegistration = {
  parishId: 'p',
  status: 'approved',
  parishName: 'Test',
  communityType: 'Parish',
};
const cleaned = sanitizePublicRegistrationInput({ status: 'approved', parishName: 'Test' });
const name: string | undefined = cleaned.parishName;
void name;
void saveReviewedRegistration(env, 'reference', {}, reviewed);
void loadAllRegistrations({});
void loadAdminRegistrationPage({}, { limit: 10, cursor: null, query: 'Test' });
void registrationRetryIdentity(new Request('https://example.test'), { arbitrary: true });
void saveContactLead(env, { name: 'A', email: 'a@example.test', topic: 'Help', message: 'Test' });
// @ts-expect-error Server-owned status is absent from the public intake result.
void cleaned.status;
// @ts-expect-error Accepted times must be strings.
registrationAgreementEvidence(123);
// @ts-expect-error Retry identity reads a Request's headers.
registrationRetryIdentity({}, {});
insertRegistrationOnce(
  // @ts-expect-error Insert-once persistence requires a D1 binding.
  {},
  { reference: 'a', parishId: 'p', status: 'pending', parishName: 'T', communityType: 'Parish', receivedAt: 'now' }
);
// @ts-expect-error Publication records require database index fields.
saveReviewedRegistration(env, 'reference', {}, { parishId: 'p' });
// @ts-expect-error Page limits must be numeric for typed callers.
loadAdminRegistrationPage({}, { limit: 'all' });
// @ts-expect-error Contact persistence requires a message.
saveContactLead(env, { name: 'A', email: 'a@example.test', topic: 'Help' });
// @ts-expect-error Administrative resolutions have two supported outcomes.
resolveContactDelivery(env, row, 'force_retry');
// @ts-expect-error Historical contact rows can have no frozen notification.
const frozen: string = row.notification_json;
void frozen;
