import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { initializeLedger, createJournalDraft, postJournalEntry } from '../../src/accounting/index.js';
import { ROLE_TEMPLATES } from '../../src/lib/authorization.js';
export async function accountingNativeFixture({ through = Infinity } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  const read = (name) => readFileSync(new URL('../../accounting-migrations/' + name, import.meta.url), 'utf8');
  const manifest = JSON.parse(read('manifest.json'));
  sqlite.exec(read(manifest.migrations[0].name));
  sqlite.exec(read(manifest.migrations[1].name));
  const db = {
    sqlite,
    prepare(sql) {
      return {
        params: [],
        bind(...params) {
          this.params = params;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...this.params) || null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...this.params) };
        },
        async run() {
          return { success: true, meta: { changes: sqlite.prepare(sql).run(...this.params).changes } };
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const actor = { id: 'synthetic-treasurer', type: 'platform_user', capabilities: ROLE_TEMPLATES.treasurer };
  await initializeLedger(db, { actor, date: new Date('2026-01-01T12:00:00Z') });
  for (const m of manifest.migrations.slice(2, through)) sqlite.exec(read(m.name));
  sqlite.exec(
    "UPDATE accounting_periods SET status='open'; INSERT OR REPLACE INTO accounting_database_metadata(key,value) VALUES('parish_id','synthetic-readiness')"
  );
  const journal = async (
    entryDate,
    lines,
    { description = 'Synthetic readiness transaction', sourceType = 'manual', sourceId = crypto.randomUUID() } = {}
  ) => {
    const draft = await createJournalDraft(db, {
      actor,
      entryDate,
      description,
      sourceType,
      sourceId,
      lines: lines.map((l) => ({ ...l, fundId: l.fundId || 'fund_general' })),
    });
    return postJournalEntry(db, {
      actor,
      journalEntryId: draft.id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomUUID(),
      expectedVersion: draft.version,
    });
  };
  return { db, sqlite, actor, reviewer: { ...actor, id: 'synthetic-reviewer' }, journal };
}
