// Compile-time consumers only; this file is never run or deployed.
import { recoveryStatus } from '../../src/recovery/service.js';
import { validateLedger } from '../../src/recovery/database.js';
import { captureFiles } from '../../src/recovery/files.js';
import { getJob, publicJob } from '../../src/portability/service.js';
import { handlePublicParishAsset } from '../../src/handlers/public-parish-assets.js';
import * as portabilityHandler from '../../src/handlers/parish-portability.js';
import { createPerson } from '../../src/directory/foundation.js';
import { cleanText } from '../../src/directory/shared.js';
import { getDirectorySettings } from '../../src/directory/settings.js';
import { getPersonPrivacyFlags, defaultPrivacyForField } from '../../src/directory/privacy.js';
import { getPublicationProfile } from '../../src/directory/publication.js';
import { normalizeEmailValue } from '../../src/directory/contacts.js';
import * as projections from '../../src/directory/projections.js';
import { buildUpcomingDirectoryMilestones } from '../../src/directory/milestones.js';
import { inspectDirectoryInvitationByToken } from '../../src/directory/invitations.js';
import { previewDirectoryImport } from '../../src/directory/imports.js';
import { inspectHouseholdShareInvitation } from '../../src/directory/household-share-invitations.js';
import { sanitizeChildFields } from '../../src/directory/child-publication.js';
import { listDirectoryReviewConversation } from '../../src/directory/review-correspondence.js';
import { getDuplicateComparison } from '../../src/directory/duplicates.js';
import { annualGivingReport } from '../../src/operations/parish-milestones.js';
import { RateLimiter } from '../../src/operations/rate-limiter.js';
import { submitLearnFeedback } from '../../src/learn/feedback-store.js';
import { submitLearnCommunityResource } from '../../src/learn/community-store.js';
import { loadTestScores } from '../../src/learn/test-scores.js';
import type { DirectoryContext } from '../../src/directory/contracts.js';
import type { PortabilityJobRow } from '../../src/portability/contracts.js';
import type { RelationshipRegistration } from '../../src/lib/parish-relationships.js';
declare const env: Env;
declare const request: Request;
declare const context: DirectoryContext;
declare const job: PortabilityJobRow;
declare const registration: RelationshipRegistration;
declare const state: DurableObjectState;
void recoveryStatus(env, 'fixture-parish', 'all');
void validateLedger(null);
void captureFiles(env, 'fixture-parish', 'all');
void getJob(env, 'fixture-parish', 'fixture-job');
const receipt = publicJob(env, job);
// Private archive keys must not escape into public job receipts.
// @ts-expect-error internal storage keys are excluded from the public DTO.
void receipt.archive_key;
void handlePublicParishAsset(request, env);
void portabilityHandler;
void projections;
void createPerson;
const required: string = cleanText('fixture', { required: true });
void required;
const optional: string | null = cleanText(null);
void optional;
// @ts-expect-error optional input normalization remains nullable.
const unsafe: string = cleanText(null);
void unsafe;
void getDirectorySettings(env, 'fixture-parish');
void getPersonPrivacyFlags(env, { parishId: 'fixture-parish', personId: 'fixture-person' });
void defaultPrivacyForField('unknown-field');
void getPublicationProfile;
void normalizeEmailValue('fixture@example.test');
void buildUpcomingDirectoryMilestones({}, { fromDate: new Date(), days: 30 });
void inspectDirectoryInvitationByToken(env, 'synthetic-token');
void previewDirectoryImport(env, { context, rows: [] });
void inspectHouseholdShareInvitation(env, { token: 'synthetic-token' });
const childFields: string[] = sanitizeChildFields(['child_name', 'giving_information']);
void childFields;
void listDirectoryReviewConversation(env, {
  parishId: 'fixture-parish',
  sourceType: 'person',
  sourceId: 'fixture-person',
});
void getDuplicateComparison;
void annualGivingReport(env, registration);
void new RateLimiter(state).fetch(request);
void submitLearnFeedback(
  env,
  { email: 'fixture@example.test', householdId: 'fixture-household' },
  { message: 'fixture suggestion' }
);
void submitLearnCommunityResource(
  env,
  { email: 'fixture@example.test', householdId: 'fixture-household' },
  { title: 'fixture' }
);
void loadTestScores(env, 'fixture-household');
// @ts-expect-error household scoping requires a string identifier.
void loadTestScores(env, 42);
// @ts-expect-error authenticated submission requires an identified household.
void submitLearnFeedback(env, { email: 'fixture@example.test' }, {});
