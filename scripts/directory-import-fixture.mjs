import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function directoryImportFixture() {
  const db = new DatabaseSync(':memory:');
  for (const name of ['0014_audit_log.sql', '0020_platform_identity.sql', '0022_directory_canonical_foundation.sql', '0023_directory_contact_privacy_publication.sql', '0024_directory_invitations_claims.sql', '0108_directory_imports.sql']) db.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0001_production_records.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0088_legal_acceptances.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0095_finalized_legal_terms.sql', import.meta.url), 'utf8'));
  const wrap = (sql) => ({ sql, params: [], bind(...args) { this.params = args; return this; },
    async first() { return db.prepare(sql).get(...this.params) || null; },
    async all() { return { results: db.prepare(sql).all(...this.params) }; },
    async run() { const result = db.prepare(sql).run(...this.params); return { success: true, meta: { changes: result.changes } }; }
  });
  const env = { RESEND_API_KEY: 'test-key', AGAPAY_APP_URL: 'https://agapay.test', AGAPAY_DB: {
    prepare: wrap,
    async batch(statements) {
      db.exec('BEGIN');
      try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  } };
  return { env, db };
}
