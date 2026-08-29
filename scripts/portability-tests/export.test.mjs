import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { POLICY_VERSION, inspectStorage } from '../../src/portability/catalog.js';
import { sha256, utf8 } from '../../src/portability/archive.js';
import { collectParishExport } from '../../src/portability/export.js';
import { classifyLegacyRecord, collectLegacyRecords } from '../../src/portability/legacy.js';
import { collectAccountingRecords } from '../../src/portability/accounting.js';
import { barrierStatements, closureReadiness } from '../../src/portability/closure.js';
import { processExport, getJob, downloadExport, cancelExport } from '../../src/portability/service.js';
import { handleParishPortability } from '../../src/handlers/parish-portability.js';
import { portabilityFixture as fixture, memoryBucket, sqliteBinding, zipEntries as entries, decodedText as text } from './fixtures.mjs';

{
  const f = await fixture();
  f.db.exec('CREATE TABLE stewardship_annual_meetings(id TEXT PRIMARY KEY,parish_id TEXT); CREATE TABLE stewardship_generated_packets(id TEXT PRIMARY KEY,annual_meeting_id TEXT,generated_at TEXT,generated_by TEXT,storage_key TEXT)');
  f.db.prepare("INSERT INTO stewardship_annual_meetings VALUES('meeting-a','parish-a')").run();
  f.db.prepare("INSERT INTO stewardship_generated_packets VALUES('packet-a','meeting-a','2026-08-28','admin','unmapped/packet.pdf')").run();
  await assert.rejects(collectParishExport(f.env,'parish-a'),error=>error.code==='legacy_packet_storage_unverified');
  f.db.prepare("UPDATE stewardship_generated_packets SET storage_key=NULL").run();
  assert.ok(entries((await collectParishExport(f.env,'parish-a')).archive)['data/stewardship_generated_packets.json']);
  f.db.close();
}
{
  const f = await fixture();
  const result = await collectParishExport(f.env, 'parish-a');
  const files = entries(result.archive), people = JSON.parse(text(files['data/directory_people.json']));
  assert.equal(people.find(p => p.id === 'a').legal_name, 'Alpha Legal');
  assert.equal(people.find(p => p.id === 'shared').notes, undefined);
  assert.equal(people.some(p => p.id === 'b'), false);
  const registration = text(files['data/registrations.json']);
  assert.ok(!registration.includes('do-not-export') && !registration.includes('tokenHash'));
  assert.ok(!text(result.archive).includes('private@example.test'));
  for (const file of result.manifest.files) assert.equal(await sha256(files[file.path]), file.sha256, file.path);
  const job = await f.start('export');
  await processExport(f.env, 'parish-a', job.id);
  const download = await downloadExport(f.env, 'parish-a', job.id);
  await download.object.body.cancel();
  assert.equal(f.db.prepare('SELECT count(*) n FROM directory_people').get().n, 3, 'aborted download never deletes');
  await assert.rejects(f.confirm(await getJob(f.env, 'parish-a', job.id)), /not ready|expired/);
  await assert.rejects(getJob(f.env, 'parish-b', job.id), /not found/);
  await cancelExport(f.env, 'parish-a', job.id);
  assert.equal(f.env.PARISH_EXPORTS.objects.size, 0);
  f.db.exec('ALTER TABLE directory_people ADD COLUMN unreviewed TEXT');
  await assert.rejects(collectParishExport(f.env, 'parish-a'), /field/);
  f.db.close();
}
{
  const f = await fixture();
  f.db.exec('CREATE TABLE _cf_METADATA(key INTEGER PRIMARY KEY,value BLOB)');
  assert.equal((await inspectStorage(f.env.AGAPAY_DB)).some(table=>table.name==='_cf_METADATA'),false);
  f.db.exec('CREATE TABLE _cf_unreviewed_application_data(secret TEXT)');
  await assert.rejects(inspectStorage(f.env.AGAPAY_DB), /_cf_unreviewed_application_data/,'provider exclusion must not hide arbitrary unreviewed tables');
  f.db.close();
}
{
  const indexed = await classifyLegacyRecord('parish_id_index:parish-a', JSON.stringify({ parishId: 'parish-a', parishName: 'Alpha', dashboardPasswordHash: 'hidden' }));
  assert.equal(indexed.parishId, 'parish-a'); assert.equal(indexed.kind, 'index'); assert.equal(indexed.data.dashboardPasswordHash, undefined);
  const pointed = await classifyLegacyRecord('parish_id_index:parish-a', 'registration:alpha', async key => key === 'registration:alpha' ? JSON.stringify({ parishId: 'parish-a' }) : null);
  assert.deepEqual(pointed.data, { target: 'registration:alpha' });
  await assert.rejects(classifyLegacyRecord('parish_id_index:parish-a', JSON.stringify({ parishId: 'parish-b' })), error => error.code === 'legacy_index_invalid');
  await assert.rejects(classifyLegacyRecord('parish_id_index:parish-a', 'registration:beta', async () => JSON.stringify({ parishId: 'parish-b' })), error => error.code === 'legacy_index_invalid');
}
{
  const values = new Map([['ref-a', JSON.stringify({ parishId: 'parish-a', parishName: 'Alpha', password: 'hidden' })], ['ref-b', JSON.stringify({ parishId: 'parish-b', parishName: 'Beta' })]]);
  const env = { AGAPAY_REGISTRATIONS: { async list({ cursor }) { return cursor ? { keys: [{ name: 'ref-b' }], list_complete: true } : { keys: [{ name: 'ref-a' }], list_complete: false, cursor: 'next' }; }, async get(key) { return values.get(key); } } };
  const records = await collectLegacyRecords(env, 'parish-a');
  assert.equal(records.length, 1); assert.equal(records[0].data.password, undefined);
  env.AGAPAY_REGISTRATIONS.list = async () => ({ keys: [], list_complete: false, cursor: 'stuck' });
  await assert.rejects(collectLegacyRecords(env, 'parish-a'), /completed/);
}
{
  const f = await fixture();
  const registration = JSON.parse(f.db.prepare("SELECT data FROM registrations WHERE parish_id='parish-a'").get().data);
  registration.logoStorageKey = 'logos/parish-a.png';
  f.db.prepare("UPDATE registrations SET data=? WHERE parish_id='parish-a'").run(JSON.stringify(registration));
  f.env.CAMPAIGN_ASSETS = memoryBucket();
  await assert.rejects(collectParishExport(f.env, 'parish-a'), /verified ownership/);
  await f.env.CAMPAIGN_ASSETS.put('logos/parish-a.png', utf8('synthetic image bytes'), { httpMetadata: { contentType: 'image/png' } });
  f.db.prepare("INSERT INTO parish_portability_objects(binding,object_key,parish_id,state,etag,updated_at) VALUES('CAMPAIGN_ASSETS','logos/parish-a.png','parish-a','stored',?,1)").run((await f.env.CAMPAIGN_ASSETS.head('logos/parish-a.png')).etag);
  const result = await collectParishExport(f.env, 'parish-a');
  const asset = result.manifest.assets[0];
  assert.equal(text(entries(result.archive)[asset.archivePath]), 'synthetic image bytes');
  assert.equal(closureReadiness(f.env, result.manifest).available, false, 'a file adapter can export without falsely claiming purge coverage');
  const before = f.db.prepare('SELECT count(*) n FROM directory_people').get().n;
  const request = new Request('https://agapay.test/api', { method: 'POST', headers: { Authorization: 'Bearer ' + f['parish-a'], 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'x'.repeat(17000) }) });
  const response = await handleParishPortability(request, f.env, 'parish-a');
  assert.equal(response.status, 413); assert.equal(f.db.prepare('SELECT count(*) n FROM directory_people').get().n, before);
  f.db.close();
}
{
  const f = await fixture({ barriers: false }), books = new DatabaseSync(':memory:');
  f.db.exec(readFileSync(new URL('../../migrations/0021_accounting_control_plane.sql', import.meta.url), 'utf8'));
  f.db.exec("INSERT INTO accounting_entities(id,parish_id) VALUES('entity-a','parish-a'); INSERT INTO accounting_databases(id,accounting_entity_id,environment,database_identifier) VALUES('books-a','entity-a','test','test-books-a');");
  books.exec(readFileSync(new URL('../../accounting-migrations/0001_accounting_database_foundation.sql', import.meta.url), 'utf8'));
  books.exec('CREATE TABLE _cf_METADATA(key INTEGER PRIMARY KEY,value BLOB)');
  books.exec('CREATE TABLE donors(email TEXT PRIMARY KEY,data TEXT)');
  books.exec("INSERT INTO accounting_database_metadata(key,value) VALUES('parish_id','parish-b'),('api_secret','not-exportable'); CREATE TABLE accounting_legal_holds(id TEXT,status TEXT,entity_type TEXT,entity_id TEXT); INSERT INTO accounting_legal_holds VALUES('hold-a','active','fiscal_year','year-a');");
  f.env.AGAPAY_ENVIRONMENT = 'test'; f.env.ACCOUNTING_DATABASE_BINDINGS = JSON.stringify({ 'test-books-a': 'TEST_BOOKS' });
  f.env.TEST_BOOKS = sqliteBinding(books);
  await assert.rejects(collectAccountingRecords(f.env, 'parish-a', [{ id: 'entity-a', parish_id: 'parish-a' }]), /does not match/);
  books.exec("UPDATE accounting_database_metadata SET value='parish-a' WHERE key='parish_id'");
  books.exec("INSERT INTO donors VALUES('legacy@example.test','{}')");
  await assert.rejects(collectAccountingRecords(f.env,'parish-a',[{id:'entity-a',parish_id:'parish-a'}]),/Unexpected legacy data/,'non-accounting data must never be silently omitted or assigned to the parish');
  books.exec('DELETE FROM donors');
  const result = await collectAccountingRecords(f.env, 'parish-a', [{ id: 'entity-a', parish_id: 'parish-a' }]);
  assert.equal(result.holds.length, 1); assert.equal(JSON.stringify(result).includes('not-exportable'), false);
  const archive = await collectParishExport(f.env, 'parish-a');
  assert.ok(entries(archive.archive)['accounting/accounting_legal_holds.json']);
  assert.equal(text(archive.archive).includes('test-books-a'), false, 'provider database identifiers are not parish export data');
  assert.equal(closureReadiness(f.env, archive.manifest).available, false);
  books.exec("DELETE FROM accounting_legal_holds; CREATE TABLE accounting_journal_entries(id TEXT PRIMARY KEY,status TEXT); INSERT INTO accounting_journal_entries VALUES('posted-journal','posted'); CREATE TRIGGER test_posted_immutable BEFORE DELETE ON accounting_journal_entries BEGIN SELECT RAISE(ABORT,'immutable posted journal'); END;");
  for(const sql of barrierStatements((await inspectStorage(f.env.AGAPAY_DB)).map(t=>t.name)))f.db.exec(sql);
  const job=await f.start('close'); await processExport(f.env,'parish-a',job.id); await f.confirm(await getJob(f.env,'parish-a',job.id));
  assert.throws(()=>books.prepare("INSERT INTO accounting_journal_entries VALUES('late','draft')").run(),/ACCOUNTING_CLOSURE_WRITE_BLOCKED/);
  await processExport(f.env,'parish-a',job.id);
  assert.equal(books.prepare('SELECT count(*) n FROM accounting_journal_entries').get().n,1);
  assert.equal(books.prepare("SELECT value FROM accounting_database_metadata WHERE key='api_secret'").get(),undefined,'technical credentials are not retained as accounting evidence');
  assert.ok(books.prepare("SELECT 1 FROM sqlite_master WHERE name='test_posted_immutable'").get(),'existing journal immutability is untouched');
  assert.ok(f.db.prepare("SELECT 1 FROM parish_portability_retention WHERE category='accounting'").get());
  assert.throws(()=>books.prepare("UPDATE accounting_database_metadata SET value='another-parish' WHERE key='parish_id'").run(),/ACCOUNTING_CLOSURE_WRITE_BLOCKED/);
  assert.throws(()=>books.prepare("INSERT INTO donors VALUES('late@example.test','{}')").run(),/ACCOUNTING_CLOSURE_WRITE_BLOCKED/,'empty reviewed legacy tables are frozen with the books');
  books.close(); f.db.close();
}
