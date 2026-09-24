import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFundReconciliationFixture } from './lib/fund-reconciliation-fixture.mjs';
import { councilReportPeriod } from '../src/stewardship/council-reports.js';
import {
  handleStewardshipMonthlyReport,
  handleStewardshipMonthlyFinancialReport,
} from '../src/handlers/stewardship-reports.js';
import {
  handleStewardshipGivingSummary,
  handleStewardshipGivingHealthScore,
} from '../src/handlers/stewardship-giving.js';
import { readStewardshipAccountingSnapshot } from '../src/handlers/stewardship-accounting-bridge.js';

const period = (query) => councilReportPeriod(new URL('https://test/?' + query));
assert.equal(period('month=2024-02').monthEnd, '2024-02-29');
assert.equal(period('month=2026-12').nextMonthStart, '2027-01-01');
for (const query of ['month=2026-13', 'month=2026-00', 'year=2025&month=2026-07', 'year=bad'])
  assert.equal(period(query), null);

const f = await createFundReconciliationFixture({ month: '2026-07' });
try {
  // Keep the real authentication, report modules, giving handlers, and SQL.
  f.db.exec(`ALTER TABLE donor_offerings ADD COLUMN donor_email TEXT;
    ALTER TABLE donor_offerings ADD COLUMN stripe_subscription_id TEXT;
    UPDATE donor_offerings SET donor_email=json_extract(data,'$.donorEmail');
    CREATE TABLE parish_stewardship_settings(parish_id TEXT PRIMARY KEY,has_stewardship_suite INTEGER);
    INSERT INTO parish_stewardship_settings VALUES('synthetic-parish',1);
    CREATE TABLE household_pledges(parish_id TEXT,donor_email TEXT,fiscal_year INTEGER,target_amount_cents INTEGER);
    CREATE TABLE giving_funds(id TEXT,parish_id TEXT,name TEXT,code TEXT,sort_order INTEGER);
    INSERT INTO giving_funds VALUES('general','synthetic-parish','General','general',0);`);
  for (const migration of [
    '0005_stewardship_annual_meetings.sql',
    '0016_manual_income_entries.sql',
    '0049_authoritative_stewardship_financial_snapshots.sql',
    '0050_financial_snapshot_external_assets.sql',
    '0052_restricted_fund_snapshot_adjustments.sql',
    '0127_agapay_service_costs.sql',
  ]) {
    f.db.exec(readFileSync(new URL('../migrations/' + migration, import.meta.url), 'utf8'));
  }
  const request = (query = 'year=2026&month=2026-07', token = f.token) =>
    new Request('https://test/api/parish/dashboard/synthetic-parish/stewardship/report/monthly?' + query, {
      headers: { Authorization: 'Bearer ' + token },
    });
  const pid = f.registration.parishId;
  const summary = await handleStewardshipGivingSummary(request(), f.env, pid);
  assert.equal(summary.status, 200);
  assert.ok((await summary.json()).total_actual_cents > 0, 'real summary must resolve its manual income helper');
  assert.equal((await handleStewardshipGivingHealthScore(request(), f.env, pid)).status, 200);
  const calls = [];
  const accounting = async (_env, parishId, _registration, dates) => {
    assert.equal(parishId, pid);
    calls.push(dates);
    return {
      available: true,
      totalIncomeCents: dates.startDate.endsWith('01-01') ? 200099 : 100099,
      totalExpenseCents: 10025,
      netCents: dates.startDate.endsWith('01-01') ? 190074 : 90074,
      restrictedFunds: [
        {
          fundName: 'Building <fund>',
          beginningBalanceCents: 2000,
          totalReceivedCents: 500,
          totalDisbursedCents: 175,
          endingBalanceCents: 2325,
        },
      ],
    };
  };
  let response = await handleStewardshipMonthlyFinancialReport(request(), f.env, pid, accounting);
  assert.equal(response.status, 200);
  let html = await response.text();
  assert.match(html, /July 2026/);
  assert.match(html, /\$1,000\.99/);
  assert.match(html, /\$2,000\.99/);
  assert.match(html, /Building &lt;fund&gt;/);
  assert.match(html, /\$23\.25/);
  assert.deepEqual(calls, [
    { startDate: '2026-07-01', endDate: '2026-07-31' },
    { startDate: '2026-01-01', endDate: '2026-07-31' },
  ]);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  response = await handleStewardshipMonthlyReport(request(), f.env, pid, accounting);
  assert.equal(response.status, 200, 'all real giving handlers imported by the monthly report must execute');
  html = await response.text();
  assert.match(html, /Monthly Stewardship Report/);
  assert.match(html, /Building &lt;fund&gt;/);
  const beforeMonth = Number(
    f.db
      .prepare(
        "SELECT SUM(COALESCE(json_extract(data,'$.giftAmountCents'),json_extract(data,'$.amountCents'),0)) n FROM donor_offerings WHERE created_at >= '2026-07-01' AND created_at < '2026-08-01'"
      )
      .get().n
  );
  f.addOffering({
    id: 'last-day',
    parishId: pid,
    stripePaymentIntentId: 'pi_last_day',
    donorEmail: 'boundary@example.test',
    giftAmountCents: 12300,
    giftType: 'general',
    paymentStatus: 'succeeded',
    createdAt: '2026-07-31T23:59:59.999Z',
  });
  f.addOffering({
    id: 'next-month',
    parishId: pid,
    stripePaymentIntentId: 'pi_next_month',
    donorEmail: 'boundary@example.test',
    giftAmountCents: 9999900,
    giftType: 'general',
    createdAt: '2026-08-01T00:00:00Z',
  });
  const boundaryHtml = await (await handleStewardshipMonthlyReport(request(), f.env, pid, accounting)).text();
  const expectedMonth = '$' + ((beforeMonth + 12300) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
  assert.ok(
    boundaryHtml.includes(expectedMonth),
    'selected month includes succeeded gifts on its last day and excludes next month'
  );
  f.registration.subscriptionTier = 'parish';
  f.registration.accountingEnabled = false;
  f.updateRegistration();
  response = await handleStewardshipMonthlyFinancialReport(request(), f.env, pid);
  assert.equal(response.status, 200, 'non-accounting parishes retain the actual fiscal-year snapshot path');
  assert.match(await response.text(), /Accounting is not active for this parish/);
  response = await handleStewardshipMonthlyReport(request(), f.env, pid);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Fiscal-year balances from Stewardship Financial Snapshots/);
  for (const handler of [handleStewardshipMonthlyReport, handleStewardshipMonthlyFinancialReport]) {
    assert.equal((await handler(request('', 'invalid'), f.env, pid, accounting)).status, 401);
    assert.equal((await handler(request('month=bad'), f.env, pid, accounting)).status, 422);
    assert.equal(
      (await handler(request(), f.env, pid, async () => ({ available: false, reason: 'unavailable' }))).status,
      503
    );
    f.db.exec('UPDATE parish_stewardship_settings SET has_stewardship_suite=0');
    assert.equal((await handler(request(), f.env, pid, accounting)).status, 403);
    f.db.exec('UPDATE parish_stewardship_settings SET has_stewardship_suite=1');
  }
  const unavailable = await readStewardshipAccountingSnapshot(
    {},
    pid,
    {},
    {},
    {
      accountingEnabledFor: () => true,
      resolveAccountingDatabaseForParish: async () => ({
        entity: { entityStatus: 'ready' },
        registry: { provisioningStatus: 'ready', healthStatus: 'unhealthy' },
      }),
    }
  );
  assert.equal(unavailable.reason, 'unavailable');
  assert.equal(
    f.db.prepare('SELECT COUNT(*) n FROM stewardship_authoritative_financial_snapshots').get().n,
    0,
    'report generation must not save or overwrite meeting snapshots'
  );
  console.log(
    'PASS - council reports: real giving handlers, authentication, periods, accounting source, exact cents, escaping, unavailable accounting, and read-only snapshots'
  );
} finally {
  f.dispose();
}
