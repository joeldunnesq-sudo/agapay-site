import { loadDonor, saveDonor } from '../../src/lib/donor-repository.js';
import { issueDonorSession, resolveDonorSession, requireDonor } from '../../src/lib/donor-sessions.js';
import {
  issueAdminSession,
  resolveAdminSession,
  parseAdminSessionStore,
  markAdminSessionMfaVerified,
} from '../../src/lib/admin-sessions.js';
import { d1GetSetting } from '../../src/lib/storage-policy.js';
declare const env: Env;
declare const request: Request;
const raw = await loadDonor(env, 'person@example.test');
// @ts-expect-error Raw donor JSON needs a root/field boundary.
void raw.email;
const setting = await d1GetSetting(env, 'opaque-setting');
// @ts-expect-error Settings are not assumed to be strings or session stores.
const assumedSetting: string = setting;
const parsed = parseAdminSessionStore('{"sessions":[]}');
// @ts-expect-error Parsing a store does not validate individual sessions.
void parsed.sessions[0].tokenHash;
const admin = await issueAdminSession(env, 'Admin');
const token: string = admin.token;
const resolved = await resolveAdminSession(env, token);
// @ts-expect-error An Admin bearer can fail verification or expire.
void resolved.actor;
if (resolved) {
  const actor: string = resolved.actor;
  // @ts-expect-error Verified sessions still contain unvalidated persisted MFA fields.
  const mfa: string = resolved.mfaVerifiedAt;
  void [actor, mfa];
}
// @ts-expect-error MFA session IDs are normalized strings.
markAdminSessionMfaVerified(env, 42);
declare const original: { email: string; privateNote: string | null };
const stored = await saveDonor(env, original);
const note: string | null = stored.privateNote;
const issued = await issueDonorSession(env, original);
const email: string = issued.donor.email;
const salt: string = issued.donor.sessionSalt;
const donor = await resolveDonorSession(issued.donor, issued.token);
// @ts-expect-error A Donor bearer may fail verification.
void donor.email;
const authenticated = await requireDonor(request, env);
if (authenticated) {
  // @ts-expect-error Request authentication does not validate other donor profile fields.
  const profileEmail: string = authenticated.email;
  void profileEmail;
}
void [assumedSetting, token, note, email, salt];
