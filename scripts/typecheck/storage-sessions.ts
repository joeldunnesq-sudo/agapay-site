// Compile-only consumers of the migrated implementations, never deployed.
import { d1First, d1All, d1Batch, listKvKeys, parseJsonRow, type StorageEnvironment } from '../../src/lib/storage.js';
import { hashSessionToken } from '../../src/lib/session-crypto.js';
import {
  issueParishDashboardSession,
  resolveParishDashboardSession,
  pruneParishDashboardSessions,
  markParishDashboardSessionMfaVerified,
} from '../../src/lib/parish-sessions.js';
import { createParishDashboardBearerVerifier } from '../../src/lib/parish-dashboard-bearer.js';

declare const env: StorageEnvironment;
const rows = await d1All<{ reference: string; data: string }>(env, 'SELECT reference, data FROM registrations');
const reference: string = rows[0].reference;
const first = await d1First<{ reference: string }>(
  env,
  'SELECT reference FROM registrations WHERE parish_id=?',
  'demo'
);
// @ts-expect-error A database query can return no matching row.
void first.reference;
// @ts-expect-error Unspecified query row fields remain unknown.
const assumed: string = (await d1All(env, 'SELECT data FROM registrations'))[0].data;
const parsed = parseJsonRow({ data: '{"parishId":"demo"}' });
// @ts-expect-error Parsing JSON does not establish a registration shape.
void parsed.parishId;
// @ts-expect-error A KV page size is numeric, not a serialized form value.
listKvKeys(env, { pageSize: '100' });
// @ts-expect-error D1 batch statements need SQL text.
d1Batch(env, [{ params: ['demo'] }]);
// @ts-expect-error Storage bindings must come from actual Worker binding types.
d1First({ AGAPAY_DB: 'database-name' }, 'SELECT 1');
const keys = await listKvKeys(env);
const name: string = keys[0].name;
// @ts-expect-error KV metadata must be narrowed before use.
void keys[0].metadata.parishId;

declare const storedRecord: { parishId: string; note: string | null };
const issued = await issueParishDashboardSession(storedRecord, { accessType: 'staff' });
const id: string = issued.registration.parishId;
const note: string | null = issued.registration.note;
// @ts-expect-error Stored custom fields retain their nullability through issuance.
const assumedNote: string = issued.registration.note;
const session = await resolveParishDashboardSession(issued.registration, issued.token);
// @ts-expect-error Session verification may fail.
void session.id;
if (session) {
  // @ts-expect-error Successful verification does not validate persisted MFA metadata.
  const mfaTimestamp: string = session.mfaVerifiedAt;
  void mfaTimestamp;
}
// @ts-expect-error Pruning by expiry does not validate the stored entries' other fields.
void pruneParishDashboardSessions([])[0].tokenHash;
// @ts-expect-error Session issuance requires a timestamp string in typed options.
issueParishDashboardSession({}, { mfaVerifiedAt: 123 });
// @ts-expect-error MFA updates require a normalized session ID.
markParishDashboardSessionMfaVerified({}, 42);
// @ts-expect-error Hashing is asynchronous.
const prematureHash: string = hashSessionToken('token', 'salt');
// @ts-expect-error The verifier needs a typed nullable session result, not a truthy arbitrary value.
createParishDashboardBearerVerifier(async () => true);
void [reference, assumed, name, id, note, assumedNote, prematureHash];
