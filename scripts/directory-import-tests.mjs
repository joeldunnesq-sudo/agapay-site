import assert from 'node:assert/strict';
import { directoryImportFixture as fixture } from './directory-import-fixture.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as XLSX from 'xlsx';
import { parseDirectoryCsv, suggestImportMapping, mapImportRows, normalizeImportRows } from '../public/parish/directory-import-format.js';
import { previewDirectoryImport, startDirectoryImport, processDirectoryImport, getDirectoryImport, listDirectoryImports } from '../src/directory/imports.js';
import { acceptDirectoryInvitation } from '../src/directory/claims.js';
import { directoryInvitationNext } from '../src/lib/directory-invitation-next.js';
import { readDirectoryImportBody, handleDirectoryImports } from '../src/handlers/directory-imports.js';
import { handleDirectoryAdmin } from '../src/handlers/directory-admin.js';
import { handleDonorSignup, handleDonorVerifyPage } from '../src/handlers/donor.js';

const context = { userId: 'staff', parishId: 'parish_a', capabilities: ['directory.manage', 'directory.invitations.manage'] };
const other = { ...context, parishId: 'parish_b' };
const contact = (name = 'Maria Example', email = 'maria@example.org', patch = {}) => ({ name, email, household: 'Example Household', relationship: 'head', ...patch });
async function start(env, rows, sendInvitations = false, actor = context, extra = {}) {
  const preview = await previewDirectoryImport(env, { context: actor, rows });
  return startDirectoryImport(env, { context: actor, rows, previewHash: preview.hash, filename: 'contacts.csv', sendInvitations, confirmed: true, requestKey: crypto.randomUUID(), ...extra });
}
let messages = [], deliveryMode = 'sent';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  assert.equal(url, 'https://api.resend.com/emails', 'tests never contact real services');
  messages.push({ ...JSON.parse(init.body), headers: init.headers });
  if (deliveryMode === 'error') throw new Error('Simulated timeout');
  if (deliveryMode === 'failed') return Response.json({ message: 'Rejected' }, { status: 429 });
  return Response.json({ id: 'provider-test-id' });
};
try {
  const table = parseDirectoryCsv('\uFEFFFull Name,Email,Household\r\n"Maria, Example",MARIA@EXAMPLE.ORG,Example\r\n');
  const mapped = mapImportRows(table, suggestImportMapping(table.headers));
  assert.equal(mapped[0].name, 'Maria, Example');
  assert.equal(normalizeImportRows(mapped)[0].data.email, 'maria@example.org');
  assert.equal(parseDirectoryCsv('Name,Email\n"A ""Quote""",a@example.org').rows[0][0], 'A "Quote"');
  assert.equal(parseDirectoryCsv('Name\tEmail\nMaria\tm@example.org').rows.length, 1);
  assert.equal(parseDirectoryCsv('Name,Email\n"Maria\nExample",m@example.org').rows[0][0], 'Maria\nExample');
  for (const input of ['Name,Email\n"broken,m@example.org', 'Name,Name\nA,B', 'Name,Email\nA,B,C', 'Name,Email\nA"quote,B']) assert.throws(() => parseDirectoryCsv(input));
  assert.throws(() => parseDirectoryCsv('Name\n' + Array.from({ length: 501 }, (_, i) => 'Person ' + i).join('\n')));
  assert.ok(normalizeImportRows([contact('Maria', 'a@example.org,b@example.org')])[0].errors.length);
  assert.ok(normalizeImportRows([contact('Maria', 'a@example.org', { address: 'Street' })])[0].errors.length);
  assert.equal(normalizeImportRows([contact('Child', 'child@example.org', { relationship: 'child' })])[0].eligibleForInvitation, false);
  assert.equal(normalizeImportRows([contact('Maria', '', { platformUserId: 'attacker' })])[0].data.platformUserId, undefined);

  function workbookResult(rows, mutate) {
    const workbook = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet(rows);
    mutate?.(sheet); XLSX.utils.book_append_sheet(workbook, sheet, 'Directory');
    let result;
    const sandbox = { XLSX, ArrayBuffer, DataView, self: { postMessage: (data) => { result = data; } }, importScripts: () => {} };
    vm.runInNewContext(readFileSync(new URL('../public/parish/directory-import-file-worker.js', import.meta.url), 'utf8'), sandbox);
    sandbox.self.onmessage({ data: { buffer: XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) } });
    return result;
  }
  assert.equal(workbookResult([['Name', 'Email'], ['Maria', 'm@example.org']]).records[1][0], 'Maria');
  assert.match(workbookResult([['Name'], ['Maria']], (sheet) => { sheet.A2.f = '1+1'; }).error, /formulas/);

  {
    const { env, db } = fixture();
    const rows = [contact(), contact('Child Example', '', { relationship: 'child' }), contact('Phone Only', '', { household: 'Phone Household', phone: '312-555-0100' })];
    const preview = await previewDirectoryImport(env, { context, rows });
    assert.equal(preview.summary.ready, 3); assert.equal(preview.summary.invitations, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM directory_people').get().n, 0);
    assert.equal(messages.length, 0);
    const batch = await start(env, rows);
    const done = await processDirectoryImport(env, { context, id: batch.id });
    assert.equal(done.summary.imported, 3); assert.equal(done.hasPending, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM directory_households').get().n, 2);
    for (const table of ['directory_person_links', 'directory_household_admins']) assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_publication_profiles WHERE status != 'draft'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_contact_methods WHERE visibility != 'private' OR verified != 0").get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM directory_person_privacy_flags WHERE is_child = 1').get().n, 1);
    assert.equal((await previewDirectoryImport(env, { context, rows })).summary.skipped, 3);
    assert.equal((await processDirectoryImport(env, { context, id: batch.id })).summary.imported, 3);
    assert.equal((await previewDirectoryImport(env, { context: other, rows })).summary.ready, 3);
    await assert.rejects(getDirectoryImport(env, { context: other, id: batch.id }), (e) => e.status === 404);
    assert.equal((await listDirectoryImports(env, { context: other })).length, 0);
    assert.equal(messages.length, 0);
    db.close();
  }
  {
    const { env, db } = fixture();
    await assert.rejects(previewDirectoryImport(env, { context: { ...context, capabilities: ['directory.view'] }, rows: [contact()] }), (e) => e.status === 403);
    await assert.rejects(start(env, [contact()], true, { ...context, capabilities: ['directory.manage'] }), (e) => e.status === 403);
    await assert.rejects(start(env, [contact()], false, context, { confirmed: false }), (e) => e.code === 'confirmation_required');
    await assert.rejects(start(env, [contact()], false, context, { previewHash: 'stale' }), (e) => e.code === 'preview_changed');
    const duplicate = await previewDirectoryImport(env, { context, rows: [contact(), contact('Other Adult')] });
    assert.equal(duplicate.summary.skipped, 2, 'shared email addresses do not select the wrong adult');
    const mixed = await start(env, [contact(), contact('Bad Email', 'broken', { household: 'Other' })]);
    const done = await processDirectoryImport(env, { context, id: mixed.id });
    assert.equal(done.summary.imported, 1); assert.equal(done.summary.invalid, 1);
    db.close();
  }
  {
    const { env, db } = fixture();
    const key = crypto.randomUUID();
    const one = await start(env, [contact()], false, context, { requestKey: key });
    assert.equal((await start(env, [contact()], false, context, { requestKey: key })).id, one.id);
    db.prepare('INSERT INTO directory_import_leases VALUES (?, ?, ?)').run(context.parishId, 'busy', Date.now() + 60000);
    await assert.rejects(processDirectoryImport(env, { context, id: one.id }), (e) => e.code === 'import_busy');
    db.prepare('DELETE FROM directory_import_leases').run();
    db.exec("CREATE TRIGGER import_failure BEFORE INSERT ON directory_contact_methods BEGIN SELECT RAISE(ABORT, 'failure'); END;");
    await assert.rejects(processDirectoryImport(env, { context, id: one.id }));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM directory_people').get().n, 0, 'a failed row is rolled back atomically');
    db.exec('DROP TRIGGER import_failure');
    assert.equal((await processDirectoryImport(env, { context, id: one.id })).summary.imported, 1);
    db.close();
  }
  {
    const { env, db } = fixture();
    const rows = Array.from({ length: 7 }, (_, i) => contact('Person ' + i, '', { household: 'Household ' + i }));
    const batch = await start(env, rows);
    assert.equal((await processDirectoryImport(env, { context, id: batch.id })).summary.imported, 5);
    assert.equal((await processDirectoryImport(env, { context, id: batch.id })).summary.imported, 7);
    db.close();
  }
  {
    const { env, db } = fixture(); messages = []; deliveryMode = 'sent';
    const batch = await start(env, [contact(), contact('Child', 'child@example.org', { relationship: 'child' })], true);
    const done = await processDirectoryImport(env, { context, id: batch.id, parishName: '<Example Parish>' });
    assert.equal(done.summary.sent, 1); assert.equal(messages.length, 1);
    assert.equal(messages[0].to.length, 1); assert.ok(messages[0].text.includes('No gift or payment'));
    assert.ok(messages[0].html.includes('&lt;Example Parish&gt;'));
    assert.ok(messages[0].headers['Idempotency-Key']);
    const invitationUrl = new URL(messages[0].text.match(/https:\/\/agapay.test\/myagapay\/login\?[^\s]+/)[0]);
    const next = invitationUrl.searchParams.get('next'); assert.equal(directoryInvitationNext(next), next);
    const token = new URL(next, 'https://agapay.test').searchParams.get('invite');
    assert.ok(!JSON.stringify(done).includes(token), 'results never expose raw invitation tokens');
    assert.ok(!db.prepare('SELECT data_json FROM directory_import_rows LIMIT 1').get().data_json.includes(token));
    await assert.rejects(acceptDirectoryInvitation(env, { user: { id: 'wrong', email: 'other@example.org' }, token }), (e) => e.code === 'wrong_account');
    const accepted = await acceptDirectoryInvitation(env, { user: { id: 'recipient', email: 'maria@example.org' }, token });
    assert.equal(accepted.claimed, true); assert.equal(accepted.personId, done.rows[0].personId);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM directory_household_admins').get().n, 0);
    await processDirectoryImport(env, { context, id: batch.id, retryFailed: true });
    assert.equal(messages.length, 1, 'successful invitations are never resent');
    db.close();
  }
  {
    const { env, db } = fixture(); messages = []; deliveryMode = 'failed';
    const batch = await start(env, [contact()], true);
    assert.equal((await processDirectoryImport(env, { context, id: batch.id })).summary.failed, 1);
    assert.equal(db.prepare('SELECT status FROM directory_invitations').get().status, 'pending', 'failed delivery is not marked sent');
    await processDirectoryImport(env, { context, id: batch.id }); assert.equal(messages.length, 1);
    deliveryMode = 'sent';
    assert.equal((await processDirectoryImport(env, { context, id: batch.id, retryFailed: true })).summary.sent, 1);
    assert.equal(messages.length, 2);
    db.close();
  }
  {
    const { env, db } = fixture(); messages = []; deliveryMode = 'error';
    const batch = await start(env, [contact()], true);
    assert.equal((await processDirectoryImport(env, { context, id: batch.id })).summary.uncertain, 1);
    await processDirectoryImport(env, { context, id: batch.id, retryFailed: true });
    assert.equal(messages.length, 1, 'unknown delivery is not retried');
    db.close();
  }
  {
    const { env, db } = fixture(); env.RESEND_API_KEY = '';
    await assert.rejects(start(env, [contact()], true), (e) => e.code === 'email_unavailable');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM directory_import_batches').get().n, 0);
    db.close();
  }
  for (const path of ['https://evil.test', '//evil.test', '/myagapay/directory?invite=bad', '/myagapay/directory?invite=' + 'a'.repeat(64) + '&redirect=https://evil.test']) assert.equal(directoryInvitationNext(path), '');
  {
    const { env, db } = fixture(); deliveryMode = 'sent'; messages = [];
    const token = 'a'.repeat(64), next = '/myagapay/directory?invite=' + token;
    const signup = await handleDonorSignup(new Request('https://agapay.test/api/donor/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'signup@example.org', donorName: 'Signup Example', password: 'test-password-only', termsAccepted: true, next }) }), env);
    assert.equal(signup.status, 201, await signup.text());
    const verifyUrl = messages[0].html.match(/href="(https:\/\/agapay.test\/myagapay\/verify[^\"]+)"/)[1].replace(/&amp;/g, '&');
    assert.equal(new URL(verifyUrl).searchParams.get('next'), next);
    assert.ok(!db.prepare('SELECT data FROM donors').get().data.includes(token), 'raw invitation token is never persisted to the donor');
    const verified = await handleDonorVerifyPage(new Request(verifyUrl), env);
    const html = await verified.text();
    assert.equal(verified.status, 200); assert.ok(html.includes('window.location.replace(' + JSON.stringify(next) + ')'));
    db.close();
  }
  {
    const { env, db } = fixture();
    const url = 'https://agapay.test/api/parish/dashboard/parish_a/directory/admin/imports';
    assert.equal((await handleDirectoryAdmin(new Request(url), env, 'parish_a')).status, 401);
    const request = (data) => new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const response = await handleDirectoryImports(request({ rows: [contact()] }), env, context, '/imports/preview');
    assert.equal(response.status, 200); assert.match(response.headers.get('Cache-Control'), /no-store/);
    await assert.rejects(readDirectoryImportBody(new Request(url, { method: 'POST', body: 'x' })), (e) => e.status === 415);
    await assert.rejects(readDirectoryImportBody(request({ junk: 'x'.repeat(1024 * 1024) })), (e) => e.status === 413);
    await assert.rejects(readDirectoryImportBody(request([])), (e) => e.status === 422);
    db.close();
  }
  {
    const { env, db } = fixture();
    const rows = [contact('Adult A', 'a@example.org', { address: '123 Example St', city: 'Chicago', state: 'IL', postalCode: '06001' }), contact('Adult B', 'b@example.org', { address: '123 Example St', city: 'Chicago', state: 'IL', postalCode: '06001' })];
    const batch = await start(env, rows);
    await processDirectoryImport(env, { context, id: batch.id });
    const addresses = db.prepare('SELECT * FROM directory_addresses').all();
    assert.equal(addresses.length, 1); assert.equal(addresses[0].owner_type, 'household'); assert.equal(addresses[0].postal_code, '06001');
    assert.equal(addresses[0].visibility, 'private');
    const conflict = await previewDirectoryImport(env, { context: other, rows: [rows[0], { ...rows[1], address: '999 Other St' }] });
    assert.equal(conflict.summary.invalid, 2);
    db.close();
  }
  console.log('PASS - directory CSV/XLSX imports, private household records, permissions, retries, signup verification and invitation claims');
} finally { globalThis.fetch = originalFetch; }
