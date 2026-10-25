import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activationTestDatabase } from './lib/accounting-activation-fixture.mjs';
import { onboardingFixtures } from './fixtures/accounting-onboarding.mjs';
import {
  applyAccountingMigration,
  prepareAccountingMigrationLedger,
  seedBeforeIntegrationMigration,
  initializeProvisionedCalendar,
} from '../src/accounting/provisioning/full-schema.js';
import { previewActivationChart, commitActivationChart } from '../src/accounting/provisioning/chart-import.js';
import {
  createMigrationSession,
  previewVendorCsv,
  commitVendorImport,
  commitFundMapping,
  previewOpeningBalanceCsv,
  commitOpeningBalanceImport,
} from '../src/accounting/migration/service.js';
import {
  statementOfFinancialPosition,
  trialBalance,
  statementOfActivities,
  statementOfCashFlows,
} from '../src/accounting/reports/service.js';
import { openAccountingPeriod } from '../src/accounting/setup/periods.js';
import { resolveOperationalAccountingDatabase } from '../src/accounting/source-wiring.js';
import { getAccountingSetupOverview, updateAccountingSettings } from '../src/accounting/setup/service.js';

const actor = {
  id: 'rehearsal-treasurer',
  type: 'accounting_staff_profile',
  capabilities: [
    'accounting.configure',
    'accounting.view',
    'accounting.migration.import',
    'accounting.opening_balances.manage',
  ],
};
const migrations = JSON.parse(readFileSync('accounting-migrations/manifest.json')).migrations.map((m) => ({
  ...m,
  sql: readFileSync(`accounting-migrations/${m.name}`, 'utf8'),
}));
{
  const central = activationTestDatabase();
  central.sqlite.exec(readFileSync('migrations/0021_accounting_control_plane.sql', 'utf8'));
  central.sqlite.exec(
    "INSERT INTO accounting_entities(id,parish_id,entity_status,activation_status) VALUES('entity','parish','ready','active')"
  );
  const env = {
    AGAPAY_DB: central,
    ACCOUNTING_DATABASE_BINDINGS: JSON.stringify({
      'staging-books': 'STAGING_BOOKS',
      'production-books': 'PRODUCTION_BOOKS',
    }),
  };
  for (const environment of ['staging', 'production']) {
    const books = activationTestDatabase();
    books.sqlite.exec(
      `CREATE TABLE rehearsal_identity(marker TEXT); INSERT INTO rehearsal_identity VALUES('${environment}')`
    );
    env[environment === 'staging' ? 'STAGING_BOOKS' : 'PRODUCTION_BOOKS'] = books;
    central.sqlite
      .prepare(
        "INSERT INTO accounting_databases(id,accounting_entity_id,environment,database_identifier,provisioning_status,health_status) VALUES(?,'entity',?,?,'ready','healthy')"
      )
      .run(environment, environment, environment + '-books');
  }
  for (const environment of ['staging', 'production']) {
    const resolved = await resolveOperationalAccountingDatabase({ ...env, AGAPAY_ENVIRONMENT: environment }, 'parish');
    assert.equal(
      (await resolved.prepare('SELECT marker FROM rehearsal_identity').first()).marker,
      environment,
      'Operational catalog resolution must stay in its own environment.'
    );
  }
  console.log(
    'PASS - operational fund catalogs resolve the current environment with separate staging and production records'
  );
}
for (const fixture of onboardingFixtures) {
  const db = activationTestDatabase();
  await prepareAccountingMigrationLedger(db);
  for (const m of migrations) {
    await applyAccountingMigration(db, m);
    await seedBeforeIntegrationMigration(db, m);
  }
  await initializeProvisionedCalendar(db, { startDate: '2026-10-01', fiscalYearStartMonth: 1 }, 'onboarding-rehearsal');
  const common = { actor, entitlementTier: 'parish' };
  const pendingSetup = await getAccountingSetupOverview(db, { actor });
  await assert.rejects(
    () =>
      updateAccountingSettings(db, {
        actor,
        expectedVersion: pendingSetup.settings.version,
        patch: { completeSetup: true },
      }),
    /setup checklist/
  );
  const session = await createMigrationSession(db, { ...common, sourceSystem: fixture.sourceSystem });
  const preview = await previewActivationChart(db, { actor, ...fixture.chart });
  assert.deepEqual(preview.errors, []);
  assert.deepEqual(preview.ignoredBalanceColumns, ['Balance']);
  await commitActivationChart(db, {
    actor,
    ...fixture.chart,
    migrationSessionId: session.id,
    confirmed: true,
    fingerprint: preview.fingerprint,
  });
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n, 0);
  const vendors = await previewVendorCsv(db, { ...common, ...fixture.vendors });
  assert.deepEqual(await commitVendorImport(db, { ...common, migrationSessionId: session.id, preview: vendors }), {
    created: 1,
    skipped: 1,
  });
  await commitFundMapping(db, {
    ...common,
    migrationSessionId: session.id,
    parishId: 'synthetic',
    mappings: [{ sourceFundRef: 'general', agapayFundId: 'fund_general' }],
    newFunds: [
      {
        sourceFundRef: 'building',
        displayName: 'Rehearsal Building Fund',
        restrictionType: 'donor_restricted_temporary',
        donorRestricted: true,
        accountNumber: 'BLDG',
      },
    ],
    loadCurrentRegistration: async () => ({ funds: [{ id: 'general', name: 'General Operating Fund' }] }),
    patchParishDashboard: async () => {
      db.sqlite.exec(
        "INSERT INTO accounting_funds(id,code,name,restriction_type,is_default,is_active,is_system) VALUES('fund_rehearsal_building','BLDG','Rehearsal Building Fund','donor_restricted_temporary',0,1,0)"
      );
      return { ok: true, accountingCatalog: { available: true } };
    },
  });
  const opening = await previewOpeningBalanceCsv(db, { ...common, ...fixture.opening, migrationSessionId: session.id });
  assert.equal(opening.eligibleToCommit, true);
  assert.equal(opening.totalDebits, 3000000);
  assert.equal(opening.totalCredits, 3000000);
  const unbalanced = await previewOpeningBalanceCsv(db, {
    ...common,
    ...fixture.opening,
    csv: fixture.opening.csv.replace('18000.00', '17000.00'),
    migrationSessionId: session.id,
  });
  assert.equal(unbalanced.eligibleToCommit, false);
  await assert.rejects(
    () =>
      commitOpeningBalanceImport(db, {
        ...common,
        migrationSessionId: session.id,
        preview: unbalanced,
        effectiveDate: '2026-10-01',
      }),
    /error-free and balanced/
  );
  const negative = await previewOpeningBalanceCsv(db, {
    ...common,
    filename: 'negative.csv',
    csv: 'Account,Debit,Credit\nbank,-100.00,\nunrestricted,,-100.00',
    migrationSessionId: session.id,
  });
  assert.equal(negative.eligibleToCommit, false, 'Negative debit/credit columns must never silently become positive.');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n, 0);
  const priorPeriod = db.sqlite.prepare("SELECT id,version FROM accounting_periods WHERE id='period_2026_9'").get();
  await openAccountingPeriod(db, { actor, periodId: priorPeriod.id, expectedVersion: priorPeriod.version });
  const input = { ...common, migrationSessionId: session.id, preview: opening, effectiveDate: '2026-09-30' };
  const posted = await commitOpeningBalanceImport(db, input);
  assert.equal(posted.status, 'posted');
  const tb = await trialBalance(db, { actor, startDate: '2026-10-01', endDate: '2026-10-31' });
  assert.equal(tb.totals.endingDebits, 3000000);
  assert.equal(tb.totals.endingCredits, 3000000);
  assert.equal(tb.totals.beginningDebits, 3000000);
  const activities = await statementOfActivities(db, { actor, startDate: '2026-10-01', endDate: '2026-10-31' });
  assert.deepEqual({ ...activities.totals }, { revenue: 0, expenses: 0, changeInNetAssets: 0 });
  const cash = await statementOfCashFlows(db, { actor, startDate: '2026-10-01', endDate: '2026-10-31' });
  assert.equal(cash.validation.status, 'validated');
  assert.equal(cash.totals.beginningCash, 2500000);
  assert.equal(cash.totals.endingCash, 2500000);
  assert.equal(cash.totals.netCashChange, 0);
  const position = await statementOfFinancialPosition(db, { actor, asOfDate: '2026-10-31' });
  assert.deepEqual({ ...position.totals }, { assets: 3000000, liabilities: 200000, netAssets: 2800000, difference: 0 });
  for (const [fundId, assets, liabilities, netAssets] of [
    ['fund_general', 2000000, 200000, 1800000],
    ['fund_rehearsal_building', 1000000, 0, 1000000],
  ]) {
    const report = await statementOfFinancialPosition(db, { actor, asOfDate: '2026-10-31', fundId });
    assert.deepEqual({ ...report.totals }, { assets, liabilities, netAssets, difference: 0 });
  }
  const retry = await commitOpeningBalanceImport(db, input);
  assert.equal(retry.id, posted.id);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM accounting_journal_entries WHERE status='posted'").get().n, 1);
  await assert.rejects(
    () => commitOpeningBalanceImport(db, { ...input, effectiveDate: '2026-10-02', acknowledgeExistingActivity: true }),
    /different input/
  );
  const ready = await getAccountingSetupOverview(db, { actor });
  await assert.rejects(
    () =>
      updateAccountingSettings(db, {
        actor,
        expectedVersion: ready.settings.version,
        patch: { completeSetup: true, openingBalancesDisposition: 'pending' },
      }),
    /Save setting changes/
  );
  const completed = await updateAccountingSettings(db, {
    actor,
    expectedVersion: ready.settings.version,
    patch: { completeSetup: true },
  });
  assert.equal(completed.setupCompleted, true);
  assert.equal(completed.openingBalancesDisposition, 'posted');
  assert.ok((await getAccountingSetupOverview(db, { actor })).checklist.every((item) => item.complete));
  assert.equal(
    db.sqlite.prepare('SELECT setup_completed_by_actor_id actor FROM accounting_settings').get().actor,
    actor.id
  );
  console.log(
    `PASS - ${fixture.sourceSystem}: empty books, chart, vendors, funds, opening balances, reports and retry`
  );
}
