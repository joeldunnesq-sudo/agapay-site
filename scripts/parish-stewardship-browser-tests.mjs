import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { openParishFixture, parish, origin } from './lib/parish-browser-fixture.mjs';

/* global loadDashboard, loadGivingMetricsPanel,
  stewardshipMonthlyReportUrl, stewardshipMonthlyFinancialReportUrl */

const year = new Date().getFullYear();
const entitled = {
  ...parish,
  subscriptionTier: 'stewardship',
  stewardshipActive: true,
  parishPlusIncludedInTier: true,
  jurisdiction: 'Synthetic jurisdiction',
  addressLine1: '123 Test Street',
  city: 'Test City',
  state: 'IL',
  postalCode: '60000',
  onboarding: { enabled: true, state: 'LIVE' },
};
const activeStatus = { status: 'active', active: true, includedInParishTier: true };
const financialData = {
  snapshot: null,
  contributionTotals: { agapayContributionsCents: 20000, outsideContributionsCents: 5000 },
  agapayRestrictedFunds: [
    {
      id: 'building',
      name: 'Building <fund>',
      receivedCents: 25000,
      agapayReceivedCents: 20000,
      outsideReceivedCents: 5000,
      openingBalanceCents: 10000,
      deductionsCents: 0,
      endingBalanceCents: 35000,
    },
  ],
  externalAssets: [],
};
const defaults = {
  '/library/settings': { body: {} },
  '/api/tax-exemption/state-guidance': { body: {} },
  '/stewardship': { body: { stewardship: activeStatus, meetings: [] } },
  '/stewardship/giving/summary': {
    body: { total_actual_cents: 25000, total_pledged_cents: 100000, run_rate_cents: 50000 },
  },
  '/stewardship/giving/funds': { body: { funds: [{ fund_name: 'Building <fund>', total_cents: 25000 }] } },
  '/stewardship/giving/health-score': { body: { score: 75, components: [] } },
  '/stewardship/giving/distribution': { body: { total_donors: 0, tiers: [] } },
  '/stewardship/giving/retention': { body: { retained: 0, lapsed: 0, new_donors: 0, retention_rate_pct: null } },
  '/stewardship/giving/concentration': { body: { total_donors: 0 } },
  '/stewardship/giving/recurring': { body: { recurring_donor_count: 2 } },
  '/stewardship/financials': { body: financialData },
  '/stewardship/financials/accounting-summary': { body: { available: false, reason: 'not_provisioned' } },
  '/stewardship/income/manual': { body: { entries: [] } },
};
const browser = await chromium.launch({ headless: true });

async function scenario(name, run, overrides = {}, dashboardResponse = () => ({ parish: entitled })) {
  const fixture = await openParishFixture(browser, dashboardResponse, { ...defaults, ...overrides });
  try {
    await fixture.open();
    const { page } = fixture;
    await page.waitForFunction(() => document.body.classList.contains('dashboard-ready'));
    await page.locator('#nav-stewardship').click();
    await run(page);
    fixture.assertClean();
    console.log(`PASS - ${name}`);
  } finally {
    await fixture.close();
  }
}

async function settled(page) {
  await page.locator('#stewardshipRecurringPane .sw-recurring-kpi-grid').waitFor();
  await page.locator('#givingMetricsPane .sw-kpi-grid').waitFor();
  await page.locator('#stewardshipFinancialsPane .sw-fin-kpi-grid').waitFor();
  await page.locator('.sw-income-form').waitFor({ state: 'attached' });
}

function body(request, method = 'POST') {
  assert.equal(request.method(), method);
  assert.equal(request.headers().authorization, 'Bearer synthetic-session-token');
  assert.equal(request.headers()['content-type'], 'application/json');
  return request.postDataJSON();
}

try {
  await scenario(
    'visual reports show budget pace, fund shares, and responsive charts',
    async (page) => {
      await settled(page);
      const reports = page.locator('#tab-stewardship .sw-reports-intelligence');
      assert.equal(await reports.locator('.sw-report-collected > strong').textContent(), '$162,000');
      assert.ok((await reports.locator('.sw-report-pace-note').textContent()).includes('$18,000'));
      assert.equal(await reports.locator('.sw-report-chart-metric > strong').first().textContent(), '54%');
      assert.equal(await reports.locator('.sw-report-budget-chart [aria-hidden="true"]').count(), 3);
      assert.equal(await reports.locator('.sw-report-fund').count(), 3);
      assert.equal(await reports.locator('.sw-report-fund-label > span').nth(1).textContent(), 'Building <fund>');
      assert.ok((await reports.locator('.sw-report-prior').textContent()).includes('Prior full-year giving'));
      assert.ok(!/undefined|NaN/.test(await reports.textContent()));
      await mkdir('artifacts/stewardship-reports', { recursive: true });
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 1100 });
        assert.equal(await reports.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
        const charts = await reports.locator('.sw-report-chart-card').all();
        const first = await charts[0].boundingBox();
        const second = await charts[1].boundingBox();
        if (width === 1440) assert.equal(first.y, second.y);
        if (width === 390) assert.ok(second.y > first.y);
        await reports.screenshot({ path: `artifacts/stewardship-reports/reports-${width}.png` });
      }
    },
    {
      '/stewardship/giving/summary': {
        body: {
          total_actual_cents: 16200000,
          total_pledged_cents: 30000000,
          run_rate_cents: 24300000,
          active_donors: 180,
          pledging_donors: 120,
          avg_per_donor_cents: 90000,
          day_of_year: 219,
          days_in_year: 365,
          prior_year_actual_cents: 28500000,
        },
      },
      '/stewardship/giving/funds': {
        body: {
          funds: [
            { fund_name: 'General Operating', total_cents: 8500000 },
            { fund_name: 'Building <fund>', total_cents: 3800000 },
            { fund_name: 'Outreach & Alms', total_cents: 1400000 },
          ],
        },
      },
    }
  );

  await scenario(
    'missing goals and fund failures stay distinct from measured zero',
    async (page) => {
      await settled(page);
      const reports = page.locator('#tab-stewardship .sw-reports-intelligence');
      assert.ok((await reports.textContent()).includes('No annual pledge goal yet'));
      assert.ok((await reports.textContent()).includes('Fund breakdown is temporarily unavailable'));
      assert.equal(await reports.locator('.sw-report-collected > strong').textContent(), '$0');
      assert.equal(await reports.locator('.sw-report-kpis .sw-kpi-value').last().textContent(), '—');
      assert.ok(!/undefined|NaN/.test(await reports.textContent()));
    },
    {
      '/stewardship/giving/summary': {
        body: {
          total_actual_cents: 0,
          total_pledged_cents: 0,
          run_rate_cents: 0,
          active_donors: 0,
          pledging_donors: 0,
        },
      },
      '/stewardship/giving/funds': { status: 503, body: { error: 'Synthetic fund failure' } },
    }
  );

  await scenario(
    'Giving intelligence charts, accessible values, health disclosure, and responsive layout',
    async (page) => {
      await settled(page);
      await page.getByRole('heading', { name: 'Giving intelligence', exact: true }).waitFor();
      assert.equal(
        await page
          .locator('#stewardshipDistributionPane .sw-distribution-bar strong')
          .allTextContents()
          .then((v) => v.join(',')),
        '48,72,36,18,6'
      );
      assert.ok((await page.locator('#stewardshipRetentionPane').textContent()).includes('80%'));
      assert.ok((await page.locator('#stewardshipRetentionPane').textContent()).includes('144 of 180'));
      assert.ok(
        (await page.locator('#stewardshipRetentionPane [role="img"]').getAttribute('aria-label')).includes(
          '144 retained, 36 new, 36 lapsed'
        )
      );
      assert.ok(
        (await page.locator('#stewardshipConcentrationPane [role="img"]').getAttribute('aria-label')).includes('42%')
      );
      assert.ok(
        (await page.locator('#stewardshipRecurringPane [role="img"]').getAttribute('aria-label')).includes('62%')
      );
      await page.locator('.sw-health-details summary').click();
      assert.equal(await page.locator('.sw-health-chips').isVisible(), true);
      await page.locator('.sw-health-details summary').click();
      await mkdir('artifacts/giving-intelligence', { recursive: true });
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 1100 });
        const distribution = await page.locator('.sw-tool-distribution').boundingBox();
        const retention = await page.locator('.sw-tool-retention').boundingBox();
        if (width === 1440) assert.equal(distribution.y, retention.y, 'desktop charts should be side by side');
        if (width === 390) assert.ok(retention.y > distribution.y, 'mobile charts should stack');
        assert.equal(
          await page.locator('.sw-suite-tool-grid--health').evaluate((el) => el.scrollWidth <= el.clientWidth),
          true,
          'chart grid must not overflow'
        );
        await page
          .locator('.sw-suite-tool-grid--health')
          .screenshot({ path: `artifacts/giving-intelligence/charts-${width}.png` });
        if (width === 1440) {
          await page.locator('.sw-intelligence-hero').scrollIntoViewIfNeeded();
          const hero = await page.locator('.sw-intelligence-hero').boundingBox();
          const grid = await page.locator('.sw-suite-tool-grid--health').boundingBox();
          await page.screenshot({
            path: 'artifacts/giving-intelligence/preview.png',
            fullPage: true,
            clip: { x: hero.x, y: hero.y, width: hero.width, height: grid.y + grid.height - hero.y },
          });
        }
      }
    },
    {
      '/stewardship/giving/health-score': {
        body: {
          score: 82,
          status: 'On Track',
          components: [
            { key: 'pledge_fulfillment', label: 'Pledge fulfillment', score: 90 },
            { key: 'donor_retention', label: 'Donor retention', score: 80 },
            { key: 'concentration_risk', label: 'Concentration risk', score: 65 },
          ],
        },
      },
      '/stewardship/giving/distribution': {
        body: {
          fiscal_year: year,
          total_donors: 180,
          tiers: [48, 72, 36, 18, 6].map((count, i) => ({ label: `Band ${i}`, count })),
        },
      },
      '/stewardship/giving/retention': {
        body: {
          fiscal_year: year,
          prior_year: year - 1,
          prior_donors: 180,
          current_donors: 180,
          retained: 144,
          new_donors: 36,
          lapsed: 36,
          retention_rate_pct: 80,
        },
      },
      '/stewardship/giving/concentration': {
        body: { total_donors: 180, top5_pct: 28, top10_pct: 42, risk_level: 'moderate' },
      },
      '/stewardship/giving/recurring': {
        body: {
          recurring_donor_count: 96,
          monthly_recurring_revenue_cents: 1240000,
          avg_recurring_gift_cents: 12917,
          pct_of_total_giving_recurring: 62,
          failed_payments_90d: 2,
          canceled_gifts_90d: 1,
        },
      },
    }
  );

  let failInsights = true;
  await scenario(
    'Giving intelligence failure retry and empty history do not imply zero retention',
    async (page) => {
      await settled(page);
      await page.locator('#stewardshipDistributionPane').getByRole('button', { name: 'Try again' }).waitFor();
      failInsights = false;
      await page.locator('#stewardshipDistributionPane').getByRole('button', { name: 'Try again' }).click();
      await page
        .locator('#stewardshipDistributionPane')
        .getByText(/No giving recorded yet/)
        .waitFor();
      const retention = await page.locator('#stewardshipRetentionPane').textContent();
      assert.ok(retention.includes('No prior-year donors to compare yet.'));
      assert.ok(!retention.includes('0%'));
      assert.equal(await page.locator('#stewardshipRecurringPane .sw-stacked-chart').count(), 0);
    },
    {
      '/stewardship/giving/distribution': () =>
        failInsights
          ? { status: 503, body: { error: 'Synthetic unavailable' } }
          : defaults['/stewardship/giving/distribution'],
    }
  );

  let statusRequests = 0;
  let latest = { ...parish, onboarding: { enabled: true, state: 'LIVE' } };
  await scenario(
    'tier lock, live entitlement refresh, status cache, and dashboard invalidation',
    async (page) => {
      assert.equal(await page.locator('#tab-stewardship > .starter-tier-paywall').count(), 1);
      assert.equal(statusRequests, 0);
      latest = entitled;
      await page.evaluate(() => loadDashboard());
      await settled(page);
      assert.equal(await page.locator('#tab-stewardship > .starter-tier-paywall').count(), 0);
      assert.equal(await page.locator('#stewardshipStatusLabel').textContent(), 'Included in Parish tier');
      const loaded = statusRequests;
      await page.locator('#nav-giving').click();
      await page.locator('#nav-stewardship').click();
      await settled(page);
      assert.equal(statusRequests, loaded, 'tab revisits should reuse the plan status');
      const refreshedStatus = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/stewardship'));
      await page.evaluate(() => loadDashboard());
      await refreshedStatus;
      assert.ok(statusRequests > loaded, 'dashboard refresh must invalidate Stewardship status');
    },
    {
      '/stewardship': () => {
        statusRequests++;
        return defaults['/stewardship'];
      },
    },
    () => ({ parish: latest })
  );

  let financialAttempts = [];
  await scenario(
    'financial snapshot year, restricted balances, assets, failed save, and retry',
    async (page) => {
      await settled(page);
      assert.ok(
        (await page.locator('#stewardshipFinancialsPane').textContent()).includes(
          'Manual financial snapshots remain available'
        )
      );
      await page.locator('#financialsYearSelect').selectOption(String(year - 1));
      await page
        .locator('#stewardshipFinancialsPane')
        .getByRole('button', { name: `Complete ${year - 1} snapshot` })
        .click();
      const form = page.locator('#financialsEditorForm');
      await form.locator('[name="title"]').fill('Synthetic snapshot');
      await form.locator('[name="otherRevenueDollars"]').fill('123.45');
      await form.locator('[name="totalExpenseDollars"]').fill('678.90');
      const fund = form.locator('.sw-fin-restricted-adjustment-row');
      await fund.locator('[data-field="openingBalance"]').fill('10.25');
      await fund.locator('[data-field="deductions"]').fill('300.50');
      assert.ok((await fund.locator('[data-field="endingBalance"]').textContent()).includes('-'));
      await fund.locator('[data-field="notes"]').fill(' Restricted expenses ');
      const asset = form.locator('.sw-fin-asset-row-edit').first();
      await asset.locator('[data-field="name"]').fill(' Synthetic endowment ');
      await asset.locator('[data-field="assetType"]').selectOption('endowment');
      await asset.locator('[data-field="value"]').fill('1234.56');
      await asset.locator('[data-field="asOfDate"]').fill(`${year - 1}-12-31`);
      await page.locator('#financialsSaveBtn').click();
      await page.getByText('Error: Synthetic snapshot unavailable', { exact: true }).waitFor();
      assert.equal(await form.locator('[name="title"]').inputValue(), 'Synthetic snapshot');
      assert.equal(await page.locator('#financialsSaveBtn').isEnabled(), true);
      await page.locator('#financialsSaveBtn').click();
      await page.locator('#stewardshipFinancialsEditorCard').waitFor({ state: 'hidden' });
      assert.deepEqual(financialAttempts[0], financialAttempts[1]);
      assert.equal(financialAttempts[1].fiscalYear, year - 1);
      assert.equal(financialAttempts[1].otherRevenueCents, 12345);
      assert.equal(financialAttempts[1].totalExpenseCents, 67890);
      assert.deepEqual(financialAttempts[1].restrictedFundAdjustments, [
        { fundId: 'building', openingBalanceCents: 1025, deductionsCents: 30050, notes: 'Restricted expenses' },
      ]);
      assert.deepEqual(financialAttempts[1].externalAssets, [
        {
          assetType: 'endowment',
          name: 'Synthetic endowment',
          valueCents: 123456,
          asOfDate: `${year - 1}-12-31`,
          notes: '',
        },
      ]);
      const report = new URL(await page.evaluate(() => stewardshipMonthlyFinancialReportUrl()), origin);
      assert.equal(report.searchParams.get('year'), String(year - 1));
      assert.equal(report.searchParams.get('t'), 'synthetic-session-token');
    },
    {
      '/stewardship/financials': (request) => {
        if (request.method() === 'GET') return { body: financialData };
        financialAttempts.push(body(request));
        return financialAttempts.length === 1
          ? { status: 503, body: { error: 'Synthetic snapshot unavailable' } }
          : { body: {} };
      },
    }
  );

  let entries = [],
    incomeAttempts = [],
    deleted = 0;
  await scenario(
    'outside giving validation, retry, refreshed listing, and deletion',
    async (page) => {
      await settled(page);
      await page.getByRole('button', { name: /Record outside.*giving/i }).click();
      const form = page.locator('.sw-income-form');
      await form.getByRole('button', { name: 'Record contribution' }).click();
      assert.equal(incomeAttempts.length, 0);
      await form.locator('[name="source"]').selectOption('other_giving_platform');
      await form.locator('[name="sourceLabel"]').fill('Synthetic platform');
      await form.locator('[name="amountCents"]').fill('12.34');
      await form.locator('[name="fundCode"]').fill('Building');
      await form.getByRole('button', { name: 'Record contribution' }).click();
      await page.getByText('Synthetic contribution unavailable', { exact: true }).waitFor();
      assert.equal(await form.locator('[name="amountCents"]').inputValue(), '12.34');
      await form.getByRole('button', { name: 'Record contribution' }).click();
      await page.locator('.sw-income-row').waitFor();
      assert.deepEqual(incomeAttempts[0], incomeAttempts[1]);
      assert.equal(incomeAttempts[1].amountCents, 1234);
      assert.equal(incomeAttempts[1].sourceLabel, 'Synthetic platform');
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByTitle('Delete entry', { exact: true }).click();
      await page.locator('.sw-income-row').waitFor({ state: 'detached' });
      assert.equal(deleted, 1);
    },
    {
      '/stewardship/income/manual': (request) => {
        if (request.method() === 'GET') return { body: { entries } };
        const payload = body(request);
        incomeAttempts.push(payload);
        if (incomeAttempts.length === 1) return { status: 503, body: { error: 'Synthetic contribution unavailable' } };
        entries = [{ ...payload, id: 'synthetic-entry' }];
        return { body: {} };
      },
      '/stewardship/income/manual/synthetic-entry': (request) => {
        assert.equal(request.method(), 'DELETE');
        assert.equal(request.headers().authorization, 'Bearer synthetic-session-token');
        deleted++;
        entries = [];
        return { body: {} };
      },
    }
  );

  let meeting = null,
    meetingAttempts = [],
    patched = null;
  await scenario(
    'meeting defaults, repeaters, failed draft save, retry, edit, ready status, and preview links',
    async (page) => {
      await settled(page);
      await page.getByRole('button', { name: 'New packet', exact: true }).click();
      const form = page.locator('#stewardshipMeetingForm');
      assert.equal(await form.locator('[name="jurisdiction"]').inputValue(), entitled.jurisdiction);
      assert.equal(await form.locator('[name="address"]').inputValue(), '123 Test Street, Test City IL 60000');
      assert.equal(await form.locator('#stewardshipReportRows .stewardship-repeat-row').count(), 4);
      await form.locator('[name="title"]').fill('Synthetic <packet>');
      await form.locator('[name="totalIncome"]').fill('123.45');
      await form.getByRole('button', { name: 'Add nominee' }).click();
      const nominees = form.locator('#stewardshipNomineeRows .stewardship-repeat-row');
      assert.equal(await nominees.count(), 2);
      await nominees.last().getByRole('button', { name: 'Remove' }).click();
      await nominees.first().locator('[data-field="fullName"]').fill('Test Nominee');
      await form.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.getByText(/Synthetic packet unavailable \[POST/).waitFor();
      assert.equal(await form.locator('[name="title"]').inputValue(), 'Synthetic <packet>');
      await form.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.getByText('Edit Annual Meeting Packet', { exact: true }).waitFor();
      assert.deepEqual(meetingAttempts[0], meetingAttempts[1]);
      assert.equal(meetingAttempts[1].financialSummary.totalIncome, 123.45);
      assert.equal(meetingAttempts[1].nominees[0].fullName, 'Test Nominee');
      const preview = new URL(
        await form.getByRole('link', { name: 'Preview', exact: true }).getAttribute('href'),
        origin
      );
      assert.equal(preview.pathname, '/parish/stewardship/annual-meetings/synthetic-meeting/preview');
      assert.equal(preview.searchParams.get('parishId'), parish.parishId);
      assert.equal(preview.searchParams.get('t'), 'synthetic-session-token');
      await page.locator('#parishPlusMeetingsPane').getByRole('button', { name: 'Edit', exact: true }).click();
      await form.locator('[name="title"]').waitFor();
      await form.getByRole('button', { name: 'Mark ready', exact: true }).click();
      await page.locator('#parishPlusPacketsState').filter({ hasText: 'Ready' }).waitFor();
      assert.equal(patched.status, 'ready');
      assert.equal(await page.locator('.pdx-pp-meeting-title').textContent(), 'Synthetic <packet>');
    },
    {
      '/stewardship': () => ({ body: { stewardship: activeStatus, meetings: meeting ? [meeting] : [] } }),
      '/stewardship/meetings': (request) => {
        const payload = body(request);
        meetingAttempts.push(payload);
        if (meetingAttempts.length === 1) return { status: 503, body: { error: 'Synthetic packet unavailable' } };
        meeting = { ...payload, id: 'synthetic-meeting', financialSummary: { totalIncomeCents: 12345 } };
        return { body: { meeting } };
      },
      '/stewardship/meetings/synthetic-meeting': (request) => {
        if (request.method() === 'PATCH') {
          patched = body(request, 'PATCH');
          meeting = { ...meeting, ...patched };
        }
        return { body: { meeting } };
      },
    }
  );

  let failMetrics = false,
    nudges = 0;
  await scenario(
    'metrics failure and recovery, report year, and synthetic donor nudge preview/retry',
    async (page) => {
      await settled(page);
      failMetrics = true;
      await page.evaluate((y) => loadGivingMetricsPanel(y), year - 1);
      assert.ok((await page.locator('#givingMetricsPane').textContent()).includes('Synthetic metrics unavailable'));
      failMetrics = false;
      await page.evaluate((y) => loadGivingMetricsPanel(y), year - 1);
      assert.equal(await page.locator('#givingMetricsPane .sw-kpi-grid').count(), 1);
      const report = new URL(await page.evaluate(() => stewardshipMonthlyReportUrl()), origin);
      assert.equal(report.searchParams.get('year'), String(year - 1));
      await page.locator('#nav-givers').click();
      await page.locator('#nudgeBtn').click();
      await page.locator('.sw-nudge-email').waitFor();
      assert.equal(await page.locator('.sw-nudge-email').textContent(), 'donor@example.test');
      await page.locator('#nudgeSendBtn').click();
      await page.getByText('Synthetic nudge unavailable', { exact: true }).waitFor();
      assert.equal(await page.locator('#nudgeSendBtn').isEnabled(), true);
      await page.locator('#nudgeSendBtn').click();
      await page
        .locator('#nudgeAdminBody')
        .getByText(/1 nudge sent/)
        .waitFor();
      assert.equal(nudges, 2);
    },
    {
      '/stewardship/giving/summary': () =>
        failMetrics
          ? { status: 503, body: { error: 'Synthetic metrics unavailable' } }
          : defaults['/stewardship/giving/summary'],
      '/stewardship/nudge': (request) => {
        if (request.method() === 'POST') {
          assert.equal(request.headers().authorization, 'Bearer synthetic-session-token');
          nudges++;
          return nudges === 1 ? { status: 503, body: { error: 'Synthetic nudge unavailable' } } : { body: { sent: 1 } };
        }
        return {
          body: {
            year,
            thresholdActive: true,
            behind: [{ donorEmail: 'donor@example.test', pledgeCents: 100000, givenCents: 1000, expectedCents: 50000 }],
          },
        };
      },
    }
  );
} finally {
  await browser.close();
}
