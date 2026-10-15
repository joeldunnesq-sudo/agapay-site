import { ensurePlatformUser, setPlatformUserPassword, issuePlatformUserSession } from '../../src/lib/identity.js';
import {
  verifyConsumerPasskeyAuthentication,
  verifyConsumerPasskeyRegistration,
} from '../../src/lib/consumer-passkeys.js';
import { handleConsumerPasskeyAuthenticationVerify } from '../../src/handlers/consumer-passkeys.js';
import { handleParishGivingSummary, handleParishGivingHistory } from '../../src/handlers/parish-giving-reports.js';
import { createSettlementProfile, setProfileActive } from '../../src/lib/settlement-profiles.js';
import { apiFormFromMeetingPayload, publicMeetingDetails } from '../../src/handlers/stewardship-http.js';
import { handleWaitlist } from '../../src/handlers/public-entry.js';
import { handleMarketplaceCatalog } from '../../src/handlers/marketplace.js';
import type { DonorRecord } from '../../src/lib/identity-contracts.js';
declare const env: Env;
declare const request: Request;
declare const donor: DonorRecord;
void ensurePlatformUser(env, { email: 'staff@example.test' });
void issuePlatformUserSession(env, 'user', { mfaVerifiedAt: new Date().toISOString() });
void verifyConsumerPasskeyAuthentication(env, request, {});
void verifyConsumerPasskeyRegistration(env, request, donor, {});
const responses: Promise<Response>[] = [
  handleConsumerPasskeyAuthenticationVerify(request, env),
  handleParishGivingSummary(request, env, 'parish'),
  handleParishGivingHistory(request, env, 'parish'),
  handleWaitlist(request, env),
];
void responses;
const catalog: Response = handleMarketplaceCatalog(request);
void catalog;
void createSettlementProfile(env, 'parish', { name: 'Giving', profileType: 'general_giving' });
void setProfileActive(env, 'parish', 'profile', false);
void apiFormFromMeetingPayload({ reports: [{ title: 'Annual report', body: 'Report' }] });
void publicMeetingDetails(null, null, null, null, null, null, null);
// @ts-expect-error Session IDs must identify a user, not an arbitrary number.
void issuePlatformUserSession(env, 4);
// @ts-expect-error Passwords cannot be numeric.
void setPlatformUserPassword(env, 'user', 1234);
// @ts-expect-error WebAuthn verification requires the browser credential structure.
void verifyConsumerPasskeyAuthentication(env, request, { credential: { id: 'forged' } });
// @ts-expect-error Verification cannot accept a donor with no account email.
void verifyConsumerPasskeyRegistration(env, request, { emailVerifiedAt: 'now' }, {});
// @ts-expect-error Profile activation is boolean, not a truthy string.
void setProfileActive(env, 'parish', 'profile', 'false');
// @ts-expect-error Report content is text, not an object.
void apiFormFromMeetingPayload({ reports: [{ body: { unsafe: true } }] });
// @ts-expect-error Parish scopes remain strings.
void handleParishGivingHistory(request, env, 123);
