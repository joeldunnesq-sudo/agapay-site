import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { accountingNativeFixture } from './lib/accounting-native-fixture.mjs';
import { portabilityFixture, memoryBucket } from './portability-tests/fixtures.mjs';
import { recordAttachment } from '../src/accounting/attachments/service.js';
import { captureDatabase } from '../src/recovery/storage.js';
import { planDatabase, applyDatabase, validateLedger } from '../src/recovery/database.js';
import { captureFiles, validateFiles, applyFiles } from '../src/recovery/files.js';
import { sha256 } from '../src/portability/archive.js';
const started = performance.now();
const { db, sqlite, actor, journal } = await accountingNativeFixture();
const f = await portabilityFixture({ barriers: false });
f.env.ACCOUNTING_ATTACHMENTS = memoryBucket();
const parishId = 'synthetic-readiness',
  bucket = f.env.ACCOUNTING_ATTACHMENTS;
const invoice = new TextEncoder().encode(
  'Synthetic invoice: parish sound equipment, $1,000. No actual donor information.'
);
const source = await journal(
  '2026-01-01',
  [
    { accountId: 'acct_1010', debitAmount: 100000, creditAmount: 0 },
    { accountId: 'acct_3990', debitAmount: 0, creditAmount: 100000 },
  ],
  { sourceType: 'opening_balance' }
);
const addFile = async (key, body) => {
  const object = await bucket.put(key, body, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { agapayParishId: parishId },
  });
  f.db
    .prepare(
      "INSERT INTO parish_portability_objects(binding,object_key,parish_id,disposition,state,etag,updated_at) VALUES('ACCOUNTING_ATTACHMENTS',?,?, 'financial','stored',?,?) ON CONFLICT(binding,object_key) DO UPDATE SET etag=excluded.etag,state='stored'"
    )
    .run(key, parishId, object.etag, Date.now());
};
await addFile('synthetic/invoice.pdf', invoice);
const attachment = await recordAttachment(db, {
  actor,
  entityType: 'journal_entry',
  entityId: source.id,
  displayName: 'Synthetic invoice.pdf',
  storageKey: 'synthetic/invoice.pdf',
  mimeType: 'application/pdf',
  sizeBytes: invoice.length,
  sha256Hex: await sha256(invoice),
});
const snapshot = await captureDatabase(db, 'books', parishId),
  files = await captureFiles(f.env, parishId, 'accounting');
assert.equal(files.files.length, 1);
await addFile('synthetic/invoice.pdf', new TextEncoder().encode('Synthetic damaged body'));
await addFile('synthetic/later.pdf', new TextEncoder().encode('Synthetic post-snapshot attachment'));
sqlite
  .prepare("UPDATE accounting_accounts SET name='Synthetic later edit',version=version+1 WHERE id='acct_1010'")
  .run();
const currentFiles = await captureFiles(f.env, parishId, 'accounting');
const tampered = structuredClone(files);
tampered.files[0].body = btoa('tampered');
await assert.rejects(() => validateFiles(f.env, parishId, 'accounting', tampered, currentFiles), /verification/);
await validateFiles(f.env, parishId, 'accounting', files, currentFiles);
const plan = await planDatabase(db, 'books', parishId, snapshot);
await applyDatabase(db, 'books', { parish_id: parishId }, snapshot, plan);
await applyFiles(f.env, { parish_id: parishId }, files, currentFiles);
assert.deepEqual(await captureDatabase(db, 'books', parishId), snapshot);
assert.equal(await sha256(await (await bucket.get('synthetic/invoice.pdf')).arrayBuffer()), await sha256(invoice));
assert.equal(await bucket.head('synthetic/later.pdf'), null);
assert.equal(
  sqlite.prepare('SELECT sha256_hex FROM accounting_attachments WHERE id=?').get(attachment.id).sha256_hex,
  await sha256(invoice)
);
validateLedger(await captureDatabase(db, 'books', parishId));
assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
// A schema-changing asset migration must also preserve populated older books.
const legacy = await accountingNativeFixture({ through: 27 });
const oldJournal = await legacy.journal('2026-01-01', [
  { accountId: 'acct_1010', debitAmount: 10000, creditAmount: 0 },
  { accountId: 'acct_3990', debitAmount: 0, creditAmount: 10000 },
]);
const line = legacy.sqlite
  .prepare('SELECT id FROM accounting_journal_lines WHERE journal_entry_id=? AND debit_amount>0')
  .get(oldJournal.id).id;
legacy.sqlite
  .prepare(
    "INSERT INTO accounting_fixed_assets(id,tag,name,acquisition_line_id,acquisition_date,in_service_date,cost,salvage,life_months,method,cost_account_id,fund_id,request_hash,created_by) VALUES('legacy','LEGACY','Synthetic legacy asset',?,'2026-01-01','2026-01-01',10000,0,60,'none','acct_1010','fund_general','legacy-hash','synthetic')"
  )
  .run(line);
legacy.sqlite
  .prepare(
    "INSERT INTO accounting_asset_movements(id,asset_id,kind,through_date,depreciation,accumulated,journal_id,operation_key,request_hash,created_by) VALUES('legacy-movement','legacy','depreciation','2026-01-31',0,0,?,'legacy-operation','legacy-hash','synthetic')"
  )
  .run(oldJournal.id);
const before = legacy.sqlite.prepare('SELECT * FROM accounting_asset_movements').get();
legacy.sqlite.exec(
  readFileSync(new URL('../accounting-migrations/0028_asset_opening_corrections.sql', import.meta.url), 'utf8')
);
const { asset_version, ...after } = legacy.sqlite.prepare('SELECT * FROM accounting_asset_movements').get();
assert.deepEqual(after, { ...before });
assert.equal(asset_version, 0);
assert.throws(() => legacy.sqlite.prepare('DELETE FROM accounting_asset_movements').run(), /append-only/);
assert.deepEqual(legacy.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
const evidence = {
  generatedAt: new Date().toISOString(),
  environment: 'Local native SQLite and in-memory private object storage; synthetic records only',
  result: 'passed',
  elapsedMs: Math.round(performance.now() - started),
  checks: [
    'Exact database snapshot restored',
    'Attachment metadata restored',
    'Private attachment bytes and SHA-256 verified',
    'Post-snapshot file removed',
    'Tampered file rejected before replacement',
    'Ledger and foreign keys validated',
    'Populated asset migration preserved rows and immutable protections',
  ],
  limitations: [
    'This is not a production restore or an RTO/SLA commitment.',
    'Provider-runtime and production restore rehearsals require separate operational validation.',
  ],
};
mkdirSync('artifacts/parish-readiness', { recursive: true });
writeFileSync('artifacts/parish-readiness/recovery-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
f.db.close();
sqlite.close();
legacy.sqlite.close();
console.log(
  'PASS database and private document recovery rehearsal, checksum tamper rejection, post-snapshot cleanup and populated historical-asset migration'
);
