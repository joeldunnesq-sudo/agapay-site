import {
  requirePlatformUser,
  findPlatformUserByEmail,
  publicPlatformUser,
  issuePlatformUserSession,
} from '../../src/lib/identity.js';
import { parsePasswordRecord, verifyPasswordRecord } from '../../src/lib/password-records.js';
import { resolveAuthorizationContext } from '../../src/lib/authorization-context.js';
declare const env: Env;
declare const request: Request;
const row = await findPlatformUserByEmail(env, 'person@example.test');
// @ts-expect-error A lookup may miss.
void row.id;
if (row) {
  const publicUser = publicPlatformUser(row);
  // @ts-expect-error Private password records cannot escape the public projection.
  void publicUser!.password_record;
}
const user = await requirePlatformUser(request, env);
// @ts-expect-error Failed authentication returns null.
void user.id;
if (user) {
  const id: string = user.id;
  const mfa: string | undefined = user.mfaVerifiedAt;
  // @ts-expect-error Identity is not proof of membership or capability.
  void user.capabilities;
  void [id, mfa];
}
const session = await issuePlatformUserSession(env, 'user');
// @ts-expect-error A missing database or identifier prevents issuance.
void session.token;
const raw = parsePasswordRecord('{"version":"pbkdf2-sha256"}');
// @ts-expect-error Parsing does not validate a stored password record.
void raw.hash;
const verified: boolean = await verifyPasswordRecord('password', raw);
const context = await resolveAuthorizationContext(env, { userId: 'user', parishId: 'parish' });
// @ts-expect-error A membership can be absent or inactive.
void context.membership.id;
// @ts-expect-error Identity requests require a Request object.
requirePlatformUser('token', env);
void verified;
