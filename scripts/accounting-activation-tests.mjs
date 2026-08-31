import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  activationOptions,
  activationDto,
  reserveActivation,
  requireActivationParish,
} from '../src/accounting/provisioning/activation.js';
import {
  applyAccountingMigration,
  initializeProvisionedCalendar,
  prepareAccountingMigrationLedger,
  seedBeforeIntegrationMigration,
  validateProvisionedBooks,
} from '../src/accounting/provisioning/full-schema.js';
import { previewActivationChart, commitActivationChart } from '../src/accounting/provisioning/chart-import.js';
import { createMigrationSession } from '../src/accounting/migration/service.js';
import {
  createCloudflareD1ProvisioningAdapter,
  createD1DatabaseFacade,
} from '../src/accounting/provisioning/adapters.js';
import { fiscalCalendar } from '../src/accounting/provisioning/fiscal-calendar.js';

function database() {
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
      const info = sqlite.prepare(sql).run(...this.params);
      return { success: true, meta: { changes: info.changes } };
    },
  });
  return {
    sqlite,
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const out = [];
        for (const statement of statements) out.push(await statement.run());
        sqlite.exec('COMMIT');
        return out;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
const migrations = JSON.parse(readFileSync('accounting-migrations/manifest.json', 'utf8')).migrations.map((item) => ({
  ...item,
  sql: readFileSync(`accounting-migrations/${item.name}`, 'utf8'),
}));
const actor = {
  id: 'named-treasurer',
  type: 'accounting_staff_profile',
  capabilities: ['accounting.configure', 'accounting.view', 'accounting.migration.import'],
};
const db = database();
await prepareAccountingMigrationLedger(db);
for (const migration of migrations) {
  await applyAccountingMigration(db, migration);
  await seedBeforeIntegrationMigration(db, migration);
}
await db.prepare("INSERT INTO accounting_database_metadata(key,value) VALUES('parish_id','parish-a')").run();
await initializeProvisionedCalendar(db, { startDate: '2026-08-30', fiscalYearStartMonth: 7 }, 'activation-a');
assert.equal(await validateProvisionedBooks(db, 'parish-a', migrations), true);
assert.deepEqual(
  { ...db.sqlite.prepare('SELECT start_date,end_date FROM accounting_fiscal_years').get() },
  { start_date: '2026-07-01', end_date: '2027-06-30' }
);
assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM accounting_periods').get().n, 12);
assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n, 0);
assert.equal(
  db.sqlite.prepare('SELECT opening_balances_disposition FROM accounting_settings').get().opening_balances_disposition,
  'pending'
);
assert.equal(
  db.sqlite.prepare('SELECT give_posting_enabled FROM accounting_integration_settings').get().give_posting_enabled,
  0
);
for (const migration of migrations) {
  await applyAccountingMigration(db, migration);
  await seedBeforeIntegrationMigration(db, migration);
}
assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM accounting_migrations').get().n, migrations.length);
await assert.rejects(() => validateProvisionedBooks(db, 'parish-b', migrations), /ownership/);
await assert.rejects(() => applyAccountingMigration(db, { ...migrations[0], sha256: 'changed' }), /checksum/);
assert.equal(fiscalCalendar(new Date('2024-02-29T12:00:00Z'), 7).periods[7].end, '2024-02-29');
assert.throws(() => activationOptions({ startDate: '2026-02-30', fiscalYearStartMonth: 1 }), /valid/);
assert.throws(() => activationOptions({ startDate: '2026-08-30', fiscalYearStartMonth: 13 }), /valid/);
assert.deepEqual(
  activationOptions({ startDate: '2026-08-30', fiscalYearStartMonth: 1, pin: 'secret', provider_id: 'foreign' }),
  { startDate: '2026-08-30', fiscalYearStartMonth: 1 }
);

const session = await createMigrationSession(db, { actor, entitlementTier: 'parish', sourceSystem: 'quickbooks' });
let input = {
  actor,
  filename: 'QuickBooks.csv',
  csv: 'Number,Full Name,Type,Balance\r\n91250,"Equipment, parish",Fixed Asset,2000\r\n94050,Sunday donations,Income,50\r\n',
  migrationSessionId: session.id,
};
let preview = await previewActivationChart(db, input);
assert.equal(preview.createCount, 2);
assert.equal(preview.errors.length, 0);
assert.equal(preview.rows[0].name, 'Equipment, parish');
assert.deepEqual(preview.ignoredBalanceColumns, ['Balance']);
input = { ...input, typeMap: preview.selectedTypeMap, fingerprint: preview.fingerprint, confirmed: true };
assert.deepEqual(await commitActivationChart(db, input), { created: 2, linked: 0 });
assert.deepEqual(await commitActivationChart(db, input), { alreadyImported: true });
assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n, 0);
assert.equal(
  db.sqlite.prepare("SELECT actor_id FROM accounting_ledger_events WHERE event_type='activation.chart_imported'").get()
    .actor_id,
  actor.id
);
assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM accounting_migration_account_map').get().n, 2);
preview = await previewActivationChart(db, {
  actor,
  filename: 'Aplos.csv',
  csv: 'Account Number,Account Name,Account Type\n6901,Altar supplies,Expense\n6901,Office supplies,Expense',
});
assert.match(preview.errors[0].message, /Duplicate/);
preview = await previewActivationChart(db, {
  actor,
  filename: 'Aplos.csv',
  csv: 'Account Number,Account Name,Account Type\n2000,Endowment,Asset',
});
assert.match(preview.errors[0].message, /category must agree/);
preview = await previewActivationChart(db, {
  actor,
  filename: 'Aplos.csv',
  csv: 'Account Number,Account Name,Account Type\n1000,Cash and Cash Equivalents,Asset',
});
assert.match(preview.errors[0].message, /parent account/);
preview = await previewActivationChart(db, {
  actor,
  filename: 'Aplos.csv',
  csv: 'Acct,Label,Class\n6902,Altar supplies,Expenses',
  columnMap: { accountNumber: 'Acct', name: 'Label', type: 'Class' },
});
assert.equal(preview.rows[0].category, 'expense');
assert.equal(preview.errors.length, 0);
const unrecognized = {
  actor,
  filename: 'Aplos.csv',
  csv: 'Account Name,Account Type\nSpecial account,Mystery',
  migrationSessionId: session.id,
};
preview = await previewActivationChart(db, unrecognized);
await assert.rejects(
  () => commitActivationChart(db, { ...unrecognized, fingerprint: preview.fingerprint, confirmed: true }),
  /Confirm a category/
);
await assert.rejects(
  () => previewActivationChart(db, { ...input, actor: { id: 'no-role', capabilities: [] } }),
  /permission/
);
await assert.rejects(
  () => previewActivationChart(db, { ...input, csv: 'Name,Type\n"unterminated,Expense' }),
  /unterminated/
);
await assert.rejects(
  () =>
    previewActivationChart(db, {
      ...input,
      csv: 'Name,Type\n' + Array.from({ length: 251 }, (_, i) => `Test${i},Expense`).join('\n'),
    }),
  /250/
);
const stale = {
  actor,
  filename: 'Aplos.csv',
  csv: 'Account Number,Account Name,Account Type\n6903,Repairs,Expense',
  migrationSessionId: session.id,
};
preview = await previewActivationChart(db, stale);
await assert.rejects(
  () =>
    commitActivationChart(db, {
      ...stale,
      csv: stale.csv.replace('Repairs', 'Changed'),
      typeMap: preview.selectedTypeMap,
      fingerprint: preview.fingerprint,
      confirmed: true,
    }),
  /preview changed/
);

const central = database();
for (const file of [
  '0021_accounting_control_plane.sql',
  '0034_accounting_provisioning_phase1b.sql',
  '0114_accounting_activation_wizard.sql',
])
  central.sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
central.sqlite.exec(
  `CREATE TABLE registrations(reference TEXT PRIMARY KEY,parish_id TEXT,data TEXT,updated_at TEXT,received_at TEXT);CREATE TABLE parish_data_closures(parish_id TEXT,state TEXT,job_id TEXT);`
);
const registration = {
  status: 'verified',
  subscriptionTier: 'parish',
  subscriptionStatus: 'trialing',
  subscriptionTrialEndsAt: new Date(Date.now() + 86400000).toISOString(),
};
central.sqlite
  .prepare('INSERT INTO registrations(reference,parish_id,data) VALUES(?,?,?)')
  .run('reg-a', 'parish-a', JSON.stringify(registration));
central.sqlite
  .prepare('INSERT INTO registrations(reference,parish_id,data) VALUES(?,?,?)')
  .run('reg-b', 'parish-b', JSON.stringify(registration));
const env = { AGAPAY_DB: central, AGAPAY_ENVIRONMENT: 'test', PARISH_PORTABILITY_ENABLED: 'true' };
const reserved = await reserveActivation(env, 'parish-a', { startDate: '2026-08-30', fiscalYearStartMonth: 1 });
const duplicate = await reserveActivation(env, 'parish-a', { startDate: '2026-08-29', fiscalYearStartMonth: 7 });
assert.equal(reserved.id, duplicate.id);
assert.equal(JSON.parse(duplicate.options_json).fiscalYearStartMonth, 1);
const second = await reserveActivation(env, 'parish-b', { startDate: '2026-08-30', fiscalYearStartMonth: 1 });
assert.notEqual(second.database_identifier, reserved.database_identifier);
const dto = activationDto({ ...reserved, provider_id: 'private-uuid', lease_token: 'private-token' });
assert.equal(JSON.stringify(dto).includes('private-'), false);
central.sqlite.prepare('INSERT INTO parish_data_closures VALUES(?,?,?)').run('parish-a', 'closed', 'closure');
await assert.rejects(() => requireActivationParish(env, 'parish-a'), /closed/);
central.sqlite
  .prepare('UPDATE registrations SET data=? WHERE parish_id=?')
  .run(JSON.stringify({ ...registration, subscriptionTrialEndsAt: '2000-01-01' }), 'parish-b');
await assert.rejects(() => requireActivationParish(env, 'parish-b'), /eligible/);

const originalFetch = globalThis.fetch;
try {
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return Response.json({ success: true, result: [{ success: true, results: [{ value: 1 }] }] });
  };
  const adapter = createCloudflareD1ProvisioningAdapter({
    CLOUDFLARE_ACCOUNT_ID: 'test',
    CLOUDFLARE_API_TOKEN: 'fake-test-token',
  });
  assert.deepEqual((await createD1DatabaseFacade(adapter, 'test').prepare('SELECT ? value').bind(1).all()).results, [
    { value: 1 },
  ]);
  await adapter.batch('test', [{ sql: 'SELECT ?', params: [1] }]);
  assert.deepEqual(body, { batch: [{ sql: 'SELECT ?', params: [1] }] });
  globalThis.fetch = async () => Response.json({ success: true, result: [{ success: false }] });
  await assert.rejects(() => adapter.execute('test', 'SELECT 1'), /rejected/);
} finally {
  globalThis.fetch = originalFetch;
}
console.log(
  'PASS Accounting activation: full schema, fiscal calendar, retries, ownership, trial/closure gates, safe chart imports and provider contract.'
);
