import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function activationTestDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  const prepare = (sql) => ({
    sql,
    params: [],
    bind(...params) {
      this.params = params;
      return this;
    },
    async all() {
      return { results: sqlite.prepare(sql).all(...this.params) };
    },
    async first() {
      return sqlite.prepare(sql).get(...this.params) || null;
    },
    async run() {
      if (!this.params.length) {
        sqlite.exec(sql);
        return { success: true, meta: { changes: sqlite.prepare('SELECT changes() n').get().n } };
      }
      const result = sqlite.prepare(sql).run(...this.params);
      return { success: true, meta: { changes: result.changes } };
    },
  });
  return {
    sqlite,
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const item of statements) results.push(await item.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

export function activationTestEnvironment() {
  const db = activationTestDatabase();
  for (const file of [
    '0021_accounting_control_plane.sql',
    '0034_accounting_provisioning_phase1b.sql',
    '0114_accounting_activation_wizard.sql',
  ])
    db.sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  db.sqlite
    .exec(`CREATE TABLE registrations(reference TEXT PRIMARY KEY,parish_id TEXT,data TEXT,updated_at TEXT,received_at TEXT);
    CREATE TABLE parish_data_closures(parish_id TEXT,state TEXT,job_id TEXT);`);
  for (const parish of ['parish-a', 'parish-b'])
    db.sqlite
      .prepare('INSERT INTO registrations VALUES(?,?,?,NULL,NULL)')
      .run(
        `reg-${parish}`,
        parish,
        JSON.stringify({
          status: 'verified',
          subscriptionTier: 'parish',
          subscriptionStatus: 'trialing',
          subscriptionTrialEndsAt: new Date(Date.now() + 86400000).toISOString(),
          funds: [{ id: 'general', name: 'General Operating Fund', enabled: true }],
        })
      );
  return {
    AGAPAY_DB: db,
    AGAPAY_ENVIRONMENT: 'test',
    PARISH_PORTABILITY_ENABLED: 'true',
    CLOUDFLARE_ACCOUNT_ID: 'test-account',
    ACCOUNTING_D1_API_TOKEN: 'fake-test-token',
  };
}
