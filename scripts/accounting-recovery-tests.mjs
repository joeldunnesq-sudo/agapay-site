import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { portabilityFixture, sqliteBinding } from './portability-tests/fixtures.mjs';
import { startRecovery, advanceRecovery, recoveryStatus } from '../src/recovery/service.js';
import { initializeLedger, createJournalDraft, postJournalEntry } from '../src/accounting/index.js';
import { downloadRecoverySnapshot } from '../src/recovery/archive.js';

const f = await portabilityFixture({ barriers: false }),
  books = new DatabaseSync(':memory:');
f.db.exec(readFileSync(new URL('../migrations/0128_parish_recovery.sql', import.meta.url), 'utf8'));
f.db.exec(readFileSync(new URL('../migrations/0021_accounting_control_plane.sql', import.meta.url), 'utf8'));
f.db.exec(
  "INSERT INTO accounting_entities(id,parish_id) VALUES('entity-a','parish-a'); INSERT INTO accounting_databases(id,accounting_entity_id,environment,database_identifier) VALUES('books-a','entity-a','test','test-books-a');"
);
const directory = new URL('../accounting-migrations/', import.meta.url);
for (const name of readdirSync(directory)
  .filter((n) => /^\d+.*\.sql$/.test(n))
  .sort()) {
  books.exec(readFileSync(new URL(name, directory), 'utf8'));
  if (name === '0002_core_ledger.sql')
    await initializeLedger(sqliteBinding(books), {
      actor: { id: 'setup', type: 'platform_user', capabilities: ['accounting.configure'] },
      date: new Date('2026-09-24T12:00:00Z'),
    });
}
books.exec(
  "PRAGMA foreign_keys=ON; INSERT INTO accounting_database_metadata(key,value) VALUES('parish_id','parish-a'),('api_secret','never-download-me');"
);
Object.assign(f.env, {
  PARISH_RECOVERY_ENABLED: 'true',
  AGAPAY_ENVIRONMENT: 'test',
  ACCOUNTING_DATABASE_BINDINGS: JSON.stringify({ 'test-books-a': 'TEST_BOOKS' }),
  TEST_BOOKS: sqliteBinding(books),
});
const db = f.env.TEST_BOOKS,
  actor = {
    id: 'treasurer',
    type: 'platform_user',
    capabilities: [
      'accounting.configure',
      'accounting.view',
      'accounting.journals.create',
      'accounting.journals.post',
      'accounting.journals.reverse',
    ],
  };
const begin = (body) =>
  startRecovery(f.env, 'parish-a', 'actor-a', { scope: 'accounting', requestKey: crypto.randomUUID(), ...body });
const finish = async (op) => {
  for (let i = 0; i < 20 && op.status !== 'completed'; i++) op = await advanceRecovery(f.env, 'parish-a', op.id);
  assert.equal(op.status, 'completed');
  return op;
};
try {
  await initializeLedger(db, { actor, date: new Date('2026-09-24T12:00:00Z') });
  const journal = await createJournalDraft(db, {
    actor,
    entryDate: '2026-09-24',
    description: 'Good record',
    lines: [
      { accountId: 'acct_1010', fundId: 'fund_general', debitAmount: 100 },
      { accountId: 'acct_4010', fundId: 'fund_general', creditAmount: 100 },
    ],
  });
  await postJournalEntry(db, {
    actor,
    journalEntryId: journal.id,
    idempotencyKey: 'initial-post',
    requestHash: 'initial-hash',
    expectedVersion: 1,
  });
  await finish(await begin({ kind: 'backup' }));
  const target = (await recoveryStatus(f.env, 'parish-a', 'accounting')).snapshots[0].id;
  const archive = await downloadRecoverySnapshot(f.env, 'parish-a', target, 'accounting');
  assert.equal(new TextDecoder().decode(archive).includes('never-download-me'), false);
  const extra = await createJournalDraft(db, {
    actor,
    entryDate: '2026-09-24',
    description: 'Mistaken draft',
    lines: [
      { accountId: 'acct_1010', fundId: 'fund_general', debitAmount: 200 },
      { accountId: 'acct_4010', fundId: 'fund_general', creditAmount: 200 },
    ],
  });
  await postJournalEntry(db, {
    actor,
    journalEntryId: extra.id,
    idempotencyKey: 'mistaken-post',
    requestHash: 'mistaken-hash',
    expectedVersion: 1,
  });
  f.db.prepare("UPDATE directory_people SET preferred_name='Keep parish change' WHERE id='a'").run();
  const restore = await begin({
    kind: 'restore',
    snapshotId: target,
    confirmation: 'RESTORE ACCOUNTING',
    acknowledged: true,
  });
  await advanceRecovery(f.env, 'parish-a', restore.id);
  assert.throws(() => books.prepare("UPDATE accounting_funds SET name='Blocked'").run(), /RECOVERY_WRITE_BLOCKED/);
  f.db.prepare("UPDATE directory_people SET notes='still writable' WHERE id='a'").run();
  await finish(restore);
  assert.equal(books.prepare('SELECT id FROM accounting_journal_entries WHERE id=?').get(extra.id), undefined);
  assert.equal(
    books.prepare('SELECT status FROM accounting_journal_entries WHERE id=?').get(journal.id).status,
    'posted'
  );
  assert.throws(
    () => books.prepare('UPDATE accounting_journal_lines SET debit_amount=1 WHERE journal_entry_id=?').run(journal.id),
    /immutable/,
    'journal protections reinstated'
  );
  assert.equal(
    f.db.prepare("SELECT preferred_name FROM directory_people WHERE id='a'").get().preferred_name,
    'Keep parish change'
  );
  assert.equal(
    books.prepare("SELECT value FROM accounting_database_metadata WHERE key='api_secret'").get().value,
    'never-download-me'
  );
  assert.equal(books.prepare('PRAGMA foreign_key_check').all().length, 0);
  const retained = f.db.prepare('SELECT * FROM parish_recovery_retention WHERE operation_id=?').get(restore.id);
  assert.ok(retained.review_after >= retained.created_at + 7 * 365 * 86400000);
  const evidence = await f.env.PARISH_RETAINED_DATA.get('parish-recovery-audit/' + restore.id + '/accounting.json');
  assert.ok(
    (await evidence.text()).includes(extra.id),
    'removed posted entry remains in restricted financial evidence'
  );
  assert.throws(() => f.db.prepare('DELETE FROM parish_recovery_retention').run(), /IMMUTABLE/);
  books.exec(
    "INSERT INTO accounting_legal_holds(id,entity_type,entity_id,hold_reason,placed_by) VALUES('hold','fiscal_year','2026','Synthetic hold','operator')"
  );
  const held = await begin({
    kind: 'restore',
    snapshotId: target,
    confirmation: 'RESTORE ACCOUNTING',
    acknowledged: true,
  });
  await assert.rejects(finish(held), /active accounting hold/);
  await advanceRecovery(f.env, 'parish-a', held.id, 'cancel');
  books.exec("UPDATE accounting_legal_holds SET status='released' WHERE id='hold'");
  books.exec(
    "INSERT INTO accounting_integration_source_events(id,source_system,source_type,source_event_id,source_object_id,occurred_at,received_at,payload_hash) VALUES('real-source','stripe','donation','evt-new','pi-new','2026-09-24','2026-09-24','synthetic')"
  );
  const external = await begin({
    kind: 'restore',
    snapshotId: target,
    confirmation: 'RESTORE ACCOUNTING',
    acknowledged: true,
  });
  await assert.rejects(finish(external), /external-source records changed/);
  assert.ok(books.prepare("SELECT id FROM accounting_integration_source_events WHERE id='real-source'").get());
  await advanceRecovery(f.env, 'parish-a', external.id, 'cancel');
  console.log(
    'PASS - full accounting schema, posted journal preservation, mistaken draft recovery, primary parish isolation, credential-safe ZIP, write fences and immutable triggers'
  );
} finally {
  books.close();
  f.db.close();
}
