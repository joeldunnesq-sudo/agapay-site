// Configures or runs a private service-binding-only hosted volume drill.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { MAX_EXPORT_BYTES, MAX_TABLE_ROWS, POLICY_VERSION } from '../src/portability/catalog.js';

assert.ok(['--configure', '--run'].includes(process.argv[2]));
const dir = path.resolve('artifacts/portability-volume-hosted');
const base = JSON.parse(readFileSync(path.join(dir, 'wrangler.json'), 'utf8'));
const resources = JSON.parse(readFileSync(path.join(dir, 'resources.json'), 'utf8'));
const prefix = 'agapay-portability-volume-20260829';
const workerName = `${prefix}-worker`;
const token = 'synthetic-volume-service-capability';
const profile = { people: 2500, affiliations: 2500, contacts: 2500, offerings: 4000, announcements: 500, accountingEntries: 3000, accountingLines: 6000, overflowPeople: MAX_TABLE_ROWS + 1 };
const mainParish = 'volume-parish', overflowParish = 'overflow-parish';
assert.equal(base.name, prefix); assert.equal(resources.prefix, prefix);
assert.equal(base.workers_dev, false); assert.equal(base.preview_urls, false); assert.deepEqual(base.triggers.crons, []);
assert.equal(base.d1_databases.length, 2); assert.equal(base.kv_namespaces.length, 1); assert.equal(base.r2_buckets.length, 1);
const protectedIds = new Set([...readFileSync('wrangler.toml', 'utf8').matchAll(/(?:database_id|\bid)\s*=\s*"([a-f0-9-]+)"/g)].map(match => match[1]));
for (const resource of base.d1_databases) { assert.equal(resource.database_id, resources.d1[resource.binding].id); assert.ok(resource.database_name.startsWith(prefix)); assert.ok(!protectedIds.has(resource.database_id)); }
for (const resource of base.kv_namespaces) { assert.equal(resource.id, resources.kv[resource.binding].id); assert.ok(!protectedIds.has(resource.id)); }
for (const resource of base.r2_buckets) assert.ok(resource.bucket_name.startsWith(prefix));
assert.match(resources.safeguards.PARISH_EXPORTS.publicAccess, /Public access via the r2\.dev URL is disabled/);
assert.match(resources.safeguards.PARISH_EXPORTS.domains, /There are no custom domains/);
assert.match(resources.safeguards.lifecycle, /volume-expiry/);

const worker = {
  ...base,
  name: workerName,
  main: path.resolve('scripts/fixtures/portability-volume-worker.js'),
  routes: [],
  vars: { ...base.vars, PORTABILITY_VOLUME_GATE: 'true', VOLUME_GATE_TOKEN: token, PARISH_PORTABILITY_ENABLED: 'true', ACCOUNTING_DATABASE_BINDINGS: JSON.stringify({ [resources.d1.VOLUME_BOOKS.name]: 'VOLUME_BOOKS' }) },
};
for (const key of ['d1_databases', 'kv_namespaces', 'r2_buckets']) worker[key] = worker[key].map(({ remote, ...binding }) => binding);
const operator = { name: `${prefix}-operator`, account_id: base.account_id, compatibility_date: base.compatibility_date, compatibility_flags: base.compatibility_flags, workers_dev: false, preview_urls: false, services: [{ binding: 'VOLUME', service: workerName, remote: true }] };
const workerPath = path.join(dir, 'hosted-worker.json'), operatorPath = path.join(dir, 'hosted-operator.json');
if (process.argv[2] === '--configure') {
  writeFileSync(workerPath, JSON.stringify(worker, null, 2) + '\n');
  writeFileSync(operatorPath, JSON.stringify(operator, null, 2) + '\n');
  console.log('Wrote private hosted volume Worker and service-only operator configs. No deployment performed.');
  process.exit(0);
}
assert.deepEqual(JSON.parse(readFileSync(workerPath, 'utf8')), worker);
assert.deepEqual(JSON.parse(readFileSync(operatorPath, 'utf8')), operator);
const statePath = path.join(dir, 'hosted-volume-state.json');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { startedAt: new Date().toISOString(), prefix, actions: [] };
assert.equal(state.prefix, prefix);
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
const proxy = await getPlatformProxy({ configPath: path.join(dir, 'wrangler.json'), envFiles: [], remoteBindings: true, persist: false });
try {
  const central = proxy.env.AGAPAY_DB, books = proxy.env.VOLUME_BOOKS;
  if (!state.seeded) {
    await central.batch([
      central.prepare('INSERT OR IGNORE INTO registrations(reference,parish_id,updated_at,data) VALUES(?,?,?,?)').bind('volume-reference', mainParish, '2026-08-29', JSON.stringify({ parishId: mainParish, parishName: 'Synthetic Volume Parish', password: 'volume-secret-never-export' })),
      central.prepare('INSERT OR IGNORE INTO registrations(reference,parish_id,updated_at,data) VALUES(?,?,?,?)').bind('overflow-reference', overflowParish, '2026-08-29', JSON.stringify({ parishId: overflowParish, parishName: 'Overflow Parish' })),
      central.prepare("INSERT OR IGNORE INTO accounting_entities(id,parish_id) VALUES('volume-entity',?)").bind(mainParish),
      central.prepare("INSERT OR IGNORE INTO accounting_databases(id,accounting_entity_id,environment,database_identifier) VALUES('volume-db','volume-entity','staging',?)").bind(resources.d1.VOLUME_BOOKS.name),
    ]);
    await central.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<${profile.people}) INSERT OR IGNORE INTO directory_people(id,created_by_parish_id,preferred_name,legal_name,notes,created_at,updated_at) SELECT printf('person-%05d',n),?1,printf('Member %05d',n),printf('Synthetic Member %05d',n),printf('Volume note %05d',n),n,n FROM seq`).bind(mainParish).run();
    await central.prepare("INSERT OR IGNORE INTO directory_parish_affiliations(id,person_id,parish_id,status,created_at,updated_at) SELECT 'aff-'||id,id,?1,'member',created_at,updated_at FROM directory_people WHERE created_by_parish_id=?1").bind(mainParish).run();
    await central.prepare("INSERT OR IGNORE INTO directory_contact_methods(id,parish_id,owner_type,owner_id,contact_type,label,value,normalized_value,visibility,created_at,updated_at) SELECT 'contact-'||id,?1,'person',id,'email','home',id||'@example.test',id||'@example.test','private',created_at,updated_at FROM directory_people WHERE created_by_parish_id=?1").bind(mainParish).run();
    await central.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<${profile.offerings}) INSERT OR IGNORE INTO donor_offerings(id,donor_email,parish_id,status,payment_status,created_at,updated_at,data) SELECT printf('offering-%05d',n),printf('donor-%05d@example.test',n),?1,'completed','paid','2026-08-29','2026-08-29',json_object('amountCents',1000+(n%5000),'currency','USD','memo',printf('Synthetic offering %05d',n),'paymentToken','volume-secret-never-export') FROM seq`).bind(mainParish).run();
    await central.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<${profile.announcements}) INSERT OR IGNORE INTO parish_announcements(id,parish_id,title,body,status,created_by) SELECT printf('announcement-%04d',n),?1,printf('Announcement %04d',n),printf('Synthetic parish announcement body %04d for volume validation',n),'published','volume-admin' FROM seq`).bind(mainParish).run();
    await central.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<${profile.overflowPeople}) INSERT OR IGNORE INTO directory_people(id,created_by_parish_id,preferred_name,created_at,updated_at) SELECT printf('overflow-%05d',n),?1,printf('Overflow %05d',n),n,n FROM seq`).bind(overflowParish).run();
    await books.batch([
      books.prepare("INSERT OR IGNORE INTO accounting_database_metadata(key,value) VALUES('parish_id',?),('api_secret','volume-book-secret-never-export')").bind(mainParish),
      books.prepare("INSERT OR IGNORE INTO accounting_account_types(id,code,name,category,normal_balance,statement_type,sort_order) VALUES('type-asset','ASSET','Assets','asset','debit','balance_sheet',1)"),
      books.prepare("INSERT OR IGNORE INTO accounting_accounts(id,account_number,name,account_type_id,normal_balance) VALUES('account-cash','1000','Cash','type-asset','debit'),('account-clearing','1010','Clearing','type-asset','debit')"),
      books.prepare("INSERT OR IGNORE INTO accounting_funds(id,code,name,restriction_type,is_default) VALUES('fund-general','GENERAL','General Fund','unrestricted',1)"),
    ]);
    await books.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<${profile.accountingEntries}) INSERT OR IGNORE INTO accounting_journal_entries(id,entry_number,entry_date,description,memo,status,source_type,total_debits,total_credits,created_by_actor_type,created_by_actor_id) SELECT printf('entry-%05d',n),printf('VOL-%05d',n),'2026-08-29',printf('Synthetic offering batch %05d',n),printf('Volume accounting memo %05d',n),'draft','manual',1000+(n%5000),1000+(n%5000),'parish_admin','volume-admin' FROM seq`).run();
    await books.prepare("INSERT OR IGNORE INTO accounting_journal_lines(id,journal_entry_id,line_number,account_id,fund_id,description,debit_amount,credit_amount) SELECT 'debit-'||id,id,1,'account-cash','fund-general','Synthetic debit',total_debits,0 FROM accounting_journal_entries UNION ALL SELECT 'credit-'||id,id,2,'account-clearing','fund-general','Synthetic credit',0,total_credits FROM accounting_journal_entries").run();
    state.seeded = true; state.seededAt = new Date().toISOString(); save();
  }
  const operatorProxy = await getPlatformProxy({ configPath: operatorPath, envFiles: [], remoteBindings: true, persist: false });
  try {
    async function invoke(parishId, expectedStatus) {
      const started = performance.now();
      const response = await operatorProxy.env.VOLUME.fetch('https://volume.invalid/export', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'export', parishId }) });
      const result = await response.json();
      state.actions.push({ parishId, at: new Date().toISOString(), status: response.status, elapsedMs: Math.round(performance.now() - started), code: result.code || null }); save();
      assert.equal(response.status, expectedStatus, JSON.stringify(result)); return result;
    }
    const success = await invoke(mainParish, 200);
    assert.equal(success.status, 'ready'); assert.ok(success.archiveBytes > 1024 * 1024 && success.archiveBytes < MAX_EXPORT_BYTES);
    const object = await proxy.env.PARISH_EXPORTS.get(success.archiveKey); assert.ok(object);
    const archive = new Uint8Array(await object.arrayBuffer());
    assert.equal(archive.length, success.archiveBytes); assert.equal(createHash('sha256').update(archive).digest('hex'), success.archiveSha256);
    assert.equal(new TextDecoder().decode(archive).includes('secret-never-export'), false);
    const counts = new Map(success.manifest.tables.map(table => [table.table, table.rowCount]));
    for (const [table, count] of [['directory_people', profile.people], ['directory_parish_affiliations', profile.affiliations], ['directory_contact_methods', profile.contacts], ['donor_offerings', profile.offerings], ['parish_announcements', profile.announcements], ['accounting/accounting_journal_entries', profile.accountingEntries], ['accounting/accounting_journal_lines', profile.accountingLines]]) assert.equal(counts.get(table), count, table);
    const overflow = await invoke(overflowParish, 413); assert.equal(overflow.code, 'export_too_large');
    const failed = await central.prepare('SELECT id,status,error_code,archive_key,manifest_json FROM parish_portability_jobs WHERE parish_id=?').bind(overflowParish).first();
    assert.equal(failed.status, 'failed'); assert.equal(failed.error_code, 'export_too_large'); assert.equal(failed.archive_key, null); assert.equal(failed.manifest_json, null);
    assert.equal((await central.prepare('SELECT count(*) n FROM directory_people WHERE created_by_parish_id=?').bind(overflowParish).first()).n, profile.overflowPeople);
    assert.equal((await proxy.env.PARISH_EXPORTS.list({ prefix: `parish-exports/${failed.id}/` })).objects.length, 0);
    state.status = 'passed'; state.completedAt = new Date().toISOString(); state.hostedInvocationCertified = true; state.profile = profile; state.archive = { bytes: success.archiveBytes, sha256: success.archiveSha256 }; delete state.error; save();
    console.log(`PASS - hosted realistic-volume export: ${success.archiveBytes} bytes`);
    console.log('PASS - hosted 10,001-row boundary failed closed with no partial archive');
  } finally { await operatorProxy.dispose(); }
} catch (error) { state.status = 'incomplete'; state.error = { code: error.code || null, message: error.message }; save(); throw error; }
finally { await proxy.dispose(); }
