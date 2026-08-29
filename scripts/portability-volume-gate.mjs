// Realistic-volume, local provider-runtime gate. Synthetic data only; no network,
// Cloudflare credentials, configured resource IDs, production data, or deployment.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { MAX_EXPORT_BYTES, MAX_TABLE_ROWS, POLICY_VERSION, quoted } from '../src/portability/catalog.js';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]+$/, '');
const artifactDir = path.join(root, 'artifacts', 'portability-staging');
const compatibilityDate = readFileSync(path.join(root, 'wrangler.toml'), 'utf8').match(/^compatibility_date = "([\d-]+)"/m)?.[1];
assert.ok(compatibilityDate);

const profile = Object.freeze({
  people: 2500,
  affiliations: 2500,
  contacts: 2500,
  offerings: 4000,
  announcements: 500,
  accountingEntries: 3000,
  accountingLines: 6000,
  overflowPeople: MAX_TABLE_ROWS + 1,
});
const expectedPrimaryRows = 1 + profile.people + profile.affiliations + profile.contacts + profile.offerings + profile.announcements;
const expectedAccountingRows = 1 + 1 + 2 + 1 + profile.accountingEntries + profile.accountingLines;
const mainParish = 'volume-parish';
const overflowParish = 'overflow-parish';
const token = randomUUID();
let egressAttempts = 0;

const built = await build({
  absWorkingDir: root,
  entryPoints: ['./scripts/fixtures/portability-volume-worker.js'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  conditions: ['workerd', 'worker', 'browser'],
  external: ['node:*'],
  write: false,
});
const options = convertV4MiniflareOptions({
  modules: true,
  script: built.outputFiles[0].text,
  compatibilityDate,
  compatibilityFlags: ['nodejs_compat'],
  host: '127.0.0.1',
  port: 0,
  cf: false,
  d1Databases: ['AGAPAY_DB', 'VOLUME_BOOKS'],
  kvNamespaces: ['AGAPAY_REGISTRATIONS'],
  r2Buckets: ['PARISH_EXPORTS'],
  bindings: {
    PORTABILITY_VOLUME_GATE: 'true',
    VOLUME_GATE_TOKEN: token,
    AGAPAY_ENVIRONMENT: 'staging',
    PARISH_PORTABILITY_ENABLED: 'true',
    PARISH_STORAGE_GUARDS_ENABLED: 'false',
    PARISH_AUTOMATIC_CLOSURE_ENABLED: 'false',
    ACCOUNTING_DATABASE_BINDINGS: JSON.stringify({ 'volume-books': 'VOLUME_BOOKS' }),
  },
  outboundService() { egressAttempts++; throw new Error('Network egress is forbidden in the portability volume gate'); },
});
options.telemetry = { enabled: false };
const mf = new Miniflare(options);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function batch(db, statements, size = 40) {
  for (let offset = 0; offset < statements.length; offset += size) await db.batch(statements.slice(offset, offset + size));
}
async function install(db, filename) {
  const sql = readFileSync(path.join(root, 'scripts', 'fixtures', filename), 'utf8');
  const statements = unstable_splitSqlQuery(sql).map(statement => db.prepare(statement));
  await batch(db, statements);
}
function zipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), result = new Map();
  let position = 0;
  while (position + 30 <= bytes.length && view.getUint32(position, true) === 0x04034b50) {
    const length = view.getUint32(position + 18, true), nameLength = view.getUint16(position + 26, true), extraLength = view.getUint16(position + 28, true);
    const name = new TextDecoder().decode(bytes.slice(position + 30, position + 30 + nameLength));
    const start = position + 30 + nameLength + extraLength;
    assert.ok(start + length <= bytes.length, `ZIP entry ${name} exceeds archive bounds`);
    result.set(name, bytes.slice(start, start + length));
    position = start + length;
  }
  return result;
}
async function call(parishId, expectedStatus) {
  const response = await mf.dispatchFetch('http://local.test/volume', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'export', parishId }),
  });
  const body = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(body));
  return body;
}
const rows = manifest => new Map(manifest.tables.map(table => [table.table, table.rowCount]));

try {
  const central = await mf.getD1Database('AGAPAY_DB');
  const books = await mf.getD1Database('VOLUME_BOOKS');
  await install(central, 'portability-central-schema.sql');
  await install(books, 'portability-accounting-schema.sql');

  await central.batch([
    central.prepare('INSERT INTO registrations(reference,parish_id,updated_at,data) VALUES(?,?,?,?)').bind('volume-reference', mainParish, '2026-08-29', JSON.stringify({ parishId: mainParish, parishName: 'Synthetic Volume Parish', password: 'volume-secret-never-export' })),
    central.prepare('INSERT INTO registrations(reference,parish_id,updated_at,data) VALUES(?,?,?,?)').bind('other-reference', 'other-parish', '2026-08-29', JSON.stringify({ parishId: 'other-parish', parishName: 'Other Parish' })),
    central.prepare('INSERT INTO registrations(reference,parish_id,updated_at,data) VALUES(?,?,?,?)').bind('overflow-reference', overflowParish, '2026-08-29', JSON.stringify({ parishId: overflowParish, parishName: 'Overflow Parish' })),
    central.prepare("INSERT INTO accounting_entities(id,parish_id) VALUES('volume-entity',?)").bind(mainParish),
    central.prepare("INSERT INTO accounting_databases(id,accounting_entity_id,environment,database_identifier) VALUES('volume-db','volume-entity','staging','volume-books')"),
  ]);
  await central.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<${profile.people}) INSERT INTO directory_people(id,created_by_parish_id,preferred_name,legal_name,notes,created_at,updated_at) SELECT printf('person-%05d',n),?1,printf('Member %05d',n),printf('Synthetic Member %05d',n),printf('Volume note %05d',n),n,n FROM seq`).bind(mainParish).run();
  await central.prepare("INSERT INTO directory_parish_affiliations(id,person_id,parish_id,status,created_at,updated_at) SELECT 'aff-'||id,id,?1,'member',created_at,updated_at FROM directory_people WHERE created_by_parish_id=?1").bind(mainParish).run();
  await central.prepare("INSERT INTO directory_contact_methods(id,parish_id,owner_type,owner_id,contact_type,label,value,normalized_value,visibility,created_at,updated_at) SELECT 'contact-'||id,?1,'person',id,'email','home',id||'@example.test',id||'@example.test','private',created_at,updated_at FROM directory_people WHERE created_by_parish_id=?1").bind(mainParish).run();
  await central.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<${profile.offerings}) INSERT INTO donor_offerings(id,donor_email,parish_id,status,payment_status,created_at,updated_at,data) SELECT printf('offering-%05d',n),printf('donor-%05d@example.test',n),?1,'completed','paid','2026-08-29','2026-08-29',json_object('amountCents',1000+(n%5000),'currency','USD','memo',printf('Synthetic offering %05d',n),'paymentToken','volume-secret-never-export') FROM seq`).bind(mainParish).run();
  await central.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<${profile.announcements}) INSERT INTO parish_announcements(id,parish_id,title,body,status,created_by) SELECT printf('announcement-%04d',n),?1,printf('Announcement %04d',n),printf('Synthetic parish announcement body %04d for volume validation',n),'published','volume-admin' FROM seq`).bind(mainParish).run();
  await central.prepare("INSERT INTO directory_people(id,created_by_parish_id,preferred_name,created_at,updated_at) VALUES('other-person','other-parish','Other Member',1,1)").run();
  await central.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<${profile.overflowPeople}) INSERT INTO directory_people(id,created_by_parish_id,preferred_name,created_at,updated_at) SELECT printf('overflow-%05d',n),?1,printf('Overflow %05d',n),n,n FROM seq`).bind(overflowParish).run();

  await books.batch([
    books.prepare("INSERT INTO accounting_database_metadata(key,value) VALUES('parish_id',?),('api_secret','volume-book-secret-never-export')").bind(mainParish),
    books.prepare("INSERT INTO accounting_account_types(id,code,name,category,normal_balance,statement_type,sort_order) VALUES('type-asset','ASSET','Assets','asset','debit','balance_sheet',1)"),
    books.prepare("INSERT INTO accounting_accounts(id,account_number,name,account_type_id,normal_balance) VALUES('account-cash','1000','Cash','type-asset','debit'),('account-clearing','1010','Clearing','type-asset','debit')"),
    books.prepare("INSERT INTO accounting_funds(id,code,name,restriction_type,is_default) VALUES('fund-general','GENERAL','General Fund','unrestricted',1)"),
  ]);
  await books.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<${profile.accountingEntries}) INSERT INTO accounting_journal_entries(id,entry_number,entry_date,description,memo,status,source_type,total_debits,total_credits,created_by_actor_type,created_by_actor_id) SELECT printf('entry-%05d',n),printf('VOL-%05d',n),'2026-08-29',printf('Synthetic offering batch %05d',n),printf('Volume accounting memo %05d',n),'draft','manual',1000+(n%5000),1000+(n%5000),'parish_admin','volume-admin' FROM seq`).run();
  await books.prepare("INSERT INTO accounting_journal_lines(id,journal_entry_id,line_number,account_id,fund_id,description,debit_amount,credit_amount) SELECT 'debit-'||id,id,1,'account-cash','fund-general','Synthetic debit',total_debits,0 FROM accounting_journal_entries UNION ALL SELECT 'credit-'||id,id,2,'account-clearing','fund-general','Synthetic credit',0,total_credits FROM accounting_journal_entries").run();

  const beforeOther = await central.prepare("SELECT preferred_name FROM directory_people WHERE id='other-person'").first();
  const started = performance.now();
  const success = await call(mainParish, 200);
  const elapsedMs = Math.round(performance.now() - started);
  assert.equal(success.status, 'ready');
  assert.ok(success.archiveBytes > 1024 * 1024 && success.archiveBytes < MAX_EXPORT_BYTES, 'archive should exercise meaningful volume below the self-service cap');
  const object = await (await mf.getR2Bucket('PARISH_EXPORTS')).get(success.archiveKey);
  assert.ok(object);
  const archive = new Uint8Array(await object.arrayBuffer());
  assert.equal(archive.length, success.archiveBytes);
  assert.equal(digest(archive), success.archiveSha256);
  const entries = zipEntries(archive);
  assert.equal(entries.size, success.manifest.files.length + 2);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(entries.get('manifest.json'))), success.manifest);
  assert.ok(new TextDecoder().decode(entries.get('README.txt')).includes('AGAPAY parish data export'));
  for (const file of success.manifest.files) assert.equal(digest(entries.get(file.path)), file.sha256, file.path);
  assert.equal(new TextDecoder().decode(archive).includes('secret-never-export'), false);
  const counts = rows(success.manifest);
  assert.equal(counts.get('registrations'), 1);
  assert.equal(counts.get('directory_people'), profile.people);
  assert.equal(counts.get('directory_parish_affiliations'), profile.affiliations);
  assert.equal(counts.get('directory_contact_methods'), profile.contacts);
  assert.equal(counts.get('donor_offerings'), profile.offerings);
  assert.equal(counts.get('parish_announcements'), profile.announcements);
  assert.equal(counts.get('accounting/accounting_journal_entries'), profile.accountingEntries);
  assert.equal(counts.get('accounting/accounting_journal_lines'), profile.accountingLines);
  assert.equal(success.manifest.tables.reduce((sum, table) => sum + table.rowCount, 0), expectedPrimaryRows + 2 + expectedAccountingRows);
  assert.deepEqual(await central.prepare("SELECT preferred_name FROM directory_people WHERE id='other-person'").first(), beforeOther);

  const overflow = await call(overflowParish, 413);
  assert.equal(overflow.code, 'export_too_large');
  const overflowJob = await central.prepare("SELECT id,status,error_code,archive_key,archive_sha256,manifest_json FROM parish_portability_jobs WHERE parish_id=?").bind(overflowParish).first();
  const { id: overflowJobId, ...overflowState } = overflowJob;
  assert.match(overflowJobId, /^[a-f0-9-]{36}$/);
  assert.deepEqual(overflowState, { status: 'failed', error_code: 'export_too_large', archive_key: null, archive_sha256: null, manifest_json: null });
  assert.equal((await central.prepare('SELECT count(*) n FROM directory_people WHERE created_by_parish_id=?').bind(overflowParish).first()).n, profile.overflowPeople);
  assert.equal((await (await mf.getR2Bucket('PARISH_EXPORTS')).list({ prefix: `parish-exports/${overflowJobId}/` })).objects.length, 0);
  assert.equal(egressAttempts, 0);

  const report = {
    measuredAt: new Date().toISOString(),
    remote: false,
    runtime: 'workerd via Miniflare with native local D1, R2, and KV bindings',
    productionDataUsed: false,
    productionBindingsUsed: false,
    profile,
    expectedRows: { primaryParishTables: expectedPrimaryRows + 2, accountingTables: expectedAccountingRows },
    archive: { bytes: success.archiveBytes, sha256: success.archiveSha256, entries: entries.size, elapsedMs },
    assertions: { checksumsVerified: true, secretsExcluded: true, tenantIsolationVerified: true, overflowRejected: true, partialOverflowArchivePublished: false, overflowRowsPreserved: true, networkEgressAttempts: egressAttempts },
    limits: { selfServiceArchiveBytes: MAX_EXPORT_BYTES, perDatasetRows: MAX_TABLE_ROWS, policyVersion: POLICY_VERSION },
    hostedInvocationCertified: false,
  };
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(path.join(artifactDir, 'volume-gate.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`PASS - realistic-volume export: ${report.expectedRows.primaryParishTables + report.expectedRows.accountingTables} rows, ${success.archiveBytes} bytes, ${entries.size} ZIP entries, ${elapsedMs} ms`);
  console.log('PASS - 10,001-row boundary failed closed with source data intact and no partial archive');
} finally {
  await mf.dispose();
}
