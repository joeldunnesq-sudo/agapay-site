import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onboardingFixtures } from './fixtures/accounting-onboarding.mjs';
import { loginGateParish } from './lib/release-gate-mfa.mjs';
import { writeArtifact } from './lib/accounting-release-gates.mjs';

const baseUrl = 'https://agapay-site-staging.joeldunnesq.workers.dev';
const evidence = { target: baseUrl, generatedAt: new Date().toISOString(), status: 'running', cases: [] };
const fresh = process.env.ACCOUNTING_ONBOARDING_FRESH_SESSIONS_FILE
  ? JSON.parse(readFileSync(process.env.ACCOUNTING_ONBOARDING_FRESH_SESSIONS_FILE, 'utf8'))
  : null;
try {
  for (const [index, fixture] of onboardingFixtures.entries()) {
    const side = index ? 'B' : 'A';
    const supplied = fresh?.find((item) => item.source === fixture.sourceSystem);
    const parishId = supplied?.parishId || process.env[`ACCOUNTING_GATE_PARISH_${side}_ID`];
    assert.equal(
      parishId,
      fresh ? `st-accounting-${fixture.sourceSystem}-rehearsal-marvin` : index ? 'st-tester-san-antonio' : 'st-fiacre'
    );
    const root = `/api/parish/dashboard/${encodeURIComponent(parishId)}`;
    const item = { source: fixture.sourceSystem, parishId, status: 'running', checks: [] };
    evidence.cases.push(item);
    const { payload: login } = supplied
      ? { payload: { token: supplied.token } }
      : await loginGateParish({
          baseUrl,
          parishId,
          parishPassword: process.env[`ACCOUNTING_GATE_PARISH_${side}_PASSWORD`],
        });
    const headers = { authorization: `Bearer ${login.token}` };
    async function request(path, body, expected = 200) {
      assert.ok(path.startsWith(root + '/'));
      const r = await fetch(baseUrl + path, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
        headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const p = await r.json();
      assert.equal(r.status, expected, `${path} HTTP ${r.status}: ${p.message || p.error || ''}`);
      return p;
    }
    const staff = await request(root + '/accounting-access/verify', {
      profileId: supplied?.profileId || process.env[`ACCOUNTING_GATE_STAFF_${side}_PROFILE_ID`],
      pin: supplied?.pin || process.env[`ACCOUNTING_GATE_STAFF_${side}_PIN`],
    });
    headers['X-AGAPAY-Accounting-Profile'] = staff.profile.id;
    headers['X-AGAPAY-Accounting-Token'] = staff.token;
    const api = (path, body, expected) => request(root + '/accounting' + path, body, expected);
    let setup = (await api('/setup')).overview;
    if (fresh && !setup.initialization.operational) {
      await api('/setup/initialize', {}, 201);
      setup = (await api('/setup')).overview;
    }
    assert.equal(setup.database.status, 'ready');
    assert.equal(setup.database.health, 'healthy');
    const date = new Date().toISOString().slice(0, 10);
    const effectiveDate = new Date(Date.parse(date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    const openingPeriod = setup.periods.find(
      (period) => period.startDate <= effectiveDate && period.endDate >= effectiveDate
    );
    assert.ok(openingPeriod, 'The opening balance needs a fiscal period for the day before cutover.');
    if (openingPeriod.status === 'future')
      await api('/periods/open', { periodId: openingPeriod.id, expectedVersion: openingPeriod.version });
    else assert.equal(openingPeriod.status, 'open', 'Do not bypass a closed opening-balance period.');
    const before = (await api(`/reports/statement-of-financial-position?asOf=${date}`)).report;
    const beforeCash = (await api(`/reports/statement-of-cash-flows?from=${date}&to=${date}`)).report;
    const beforeActivities = (await api(`/reports/statement-of-activities?from=${date}&to=${date}`)).report;
    const beforeGeneral = (await api(`/reports/statement-of-financial-position?asOf=${date}&fundId=fund_general`))
      .report;
    item.before = before.totals;
    const sessions = (await api('/migration/sessions')).sessions;
    let session = sessions.find((s) => s.sourceSystem === fixture.sourceSystem && s.status === 'in_progress');
    if (!session) {
      assert.ok(
        !sessions.some((s) => s.sourceSystem === fixture.sourceSystem && s.status === 'completed'),
        'This source has already completed its rehearsal. Inspect existing evidence before another import.'
      );
      session = (await api('/migration/sessions', { sourceSystem: fixture.sourceSystem }, 201)).session;
    }
    item.sessionId = session.id;
    const common = { migrationSessionId: session.id, acknowledgeExistingActivity: true };
    const chart = (await api('/migration/chart-of-accounts/preview', fixture.chart)).preview;
    assert.equal(chart.invalidRows, 0);
    await api('/migration/chart-of-accounts/commit', { ...common, preview: chart, typeMap: fixture.chart.typeMap });
    item.checks.push('chart reviewed and imported');
    const vendors = (await api('/migration/vendors/preview', fixture.vendors)).preview;
    assert.equal(vendors.invalidRows, 0);
    const vendorResult = (await api('/migration/vendors/commit', { ...common, preview: vendors })).result;
    assert.equal(vendorResult.created + vendorResult.skipped, 2);
    item.checks.push('vendor duplicates skipped');
    const funds = (await api('/migration/funds/preview', fixture.funds)).preview;
    assert.equal(funds.invalidRows, 0);
    await api('/migration/funds/commit', {
      ...common,
      mappings: funds.rows
        .filter((r) => r.status === 'matched')
        .map((r) => ({ sourceFundRef: r.sourceFundRef, agapayFundId: r.agapayFundId })),
      newFunds: funds.rows
        .filter((r) => r.status !== 'matched')
        .map((r) => ({
          sourceFundRef: r.sourceFundRef,
          displayName: r.name,
          restrictionType: 'donor_restricted_temporary',
          donorRestricted: true,
          accountNumber: 'ONBOARD-BLDG',
        })),
    });
    item.checks.push('general and restricted fund mappings committed through Funds & Alms');
    const invalid = (
      await api('/migration/opening-balance/preview', {
        ...fixture.opening,
        migrationSessionId: session.id,
        csv: fixture.opening.csv.replace('18000.00', '17000.00'),
      })
    ).preview;
    assert.equal(invalid.eligibleToCommit, false);
    await api('/migration/opening-balance/commit', { ...common, preview: invalid, effectiveDate: date }, 400);
    const negative = (
      await api('/migration/opening-balance/preview', {
        filename: 'negative.csv',
        csv: 'Account,Debit,Credit\nbank,-100.00,\nunrestricted,,-100.00',
        migrationSessionId: session.id,
      })
    ).preview;
    assert.equal(negative.eligibleToCommit, false);
    await api('/migration/opening-balance/commit', { ...common, preview: negative, effectiveDate: date }, 400);
    item.checks.push('unbalanced and negative amounts rejected');
    const opening = (
      await api('/migration/opening-balance/preview', { ...fixture.opening, migrationSessionId: session.id })
    ).preview;
    assert.equal(opening.eligibleToCommit, true);
    assert.equal(opening.totalDebits, 3000000);
    assert.equal(opening.totalCredits, 3000000);
    const input = { ...common, preview: opening, effectiveDate };
    const entry = (await api('/migration/opening-balance/commit', input)).entry;
    assert.equal(entry.status, 'posted');
    item.journalId = entry.id;
    const retry = (await api('/migration/opening-balance/commit', { ...input, acknowledgeExistingActivity: false }))
      .entry;
    assert.equal(retry.id, entry.id);
    item.checks.push('identical retry returned original posted journal');
    const after = (await api(`/reports/statement-of-financial-position?asOf=${date}`)).report;
    item.after = after.totals;
    for (const [key, delta] of Object.entries({ assets: 3000000, liabilities: 200000, netAssets: 2800000 }))
      assert.equal(after.totals[key] - before.totals[key], delta, key);
    assert.equal(after.totals.difference, before.totals.difference);
    const afterGeneral = (await api(`/reports/statement-of-financial-position?asOf=${date}&fundId=fund_general`))
      .report;
    for (const [key, delta] of Object.entries({ assets: 2000000, liabilities: 200000, netAssets: 1800000 }))
      assert.equal(afterGeneral.totals[key] - beforeGeneral.totals[key], delta, `general ${key}`);
    const reference = await api('/workspace-reference');
    const building = reference.funds.find((fund) => fund.name === 'Rehearsal Building Fund');
    assert.ok(building);
    assert.equal(building.restrictionType, 'donor_restricted_temporary');
    const restricted = (
      await api(`/reports/statement-of-financial-position?asOf=${date}&fundId=${encodeURIComponent(building.id)}`)
    ).report;
    assert.deepEqual(restricted.totals, { assets: 1000000, liabilities: 0, netAssets: 1000000, difference: 0 });
    item.restrictedFund = { id: building.id, totals: restricted.totals };
    const tb = (await api(`/reports/trial-balance?from=${date.slice(0, 4)}-01-01&to=${date}`)).report;
    assert.equal(tb.totals.difference, 0);
    const cash = (await api(`/reports/statement-of-cash-flows?from=${date}&to=${date}`)).report;
    const activities = (await api(`/reports/statement-of-activities?from=${date}&to=${date}`)).report;
    assert.deepEqual(activities.totals, beforeActivities.totals);
    assert.equal(cash.totals.beginningCash - beforeCash.totals.beginningCash, 2500000);
    assert.equal(cash.totals.endingCash - beforeCash.totals.endingCash, 2500000);
    assert.equal(cash.totals.netCashChange, beforeCash.totals.netCashChange);
    assert.equal(cash.validation.status, 'validated');
    item.cashFlow = cash.totals;
    const completed = (await api(`/migration/sessions/${session.id}`)).session;
    assert.equal(completed.status, 'completed');
    item.checks.push('trial balance, balance sheet delta and completed migration session verified');
    const settings = (await api('/settings')).settings;
    // Use the same versioned Settings action as the dashboard Finish setup button.
    const finishResponse = await fetch(baseUrl + root + '/accounting/settings', {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ expectedVersion: settings.version, patch: { completeSetup: true } }),
    });
    assert.equal(finishResponse.status, 200);
    assert.equal((await finishResponse.json()).settings.setupCompleted, true);
    const finished = (await api('/setup')).overview;
    assert.ok(finished.checklist.every((check) => check.complete));
    item.checks.push('Accounting setup completion recorded with all checklist items complete');
    item.status = 'passed';
    console.log(`PASS - ${fixture.sourceSystem} staging imports, opening balances, retry and reports`);
  }
  evidence.status = 'passed';
} catch (error) {
  evidence.status = 'failed';
  evidence.failure = error.message;
  process.exitCode = 1;
} finally {
  await writeArtifact('artifacts/accounting-onboarding-staging/results.json', evidence);
  console.log(JSON.stringify(evidence));
}
