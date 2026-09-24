import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openParishFixture, parish } from './lib/parish-browser-fixture.mjs';

const browser = await chromium.launch({ headless: true });
const year = new Date().getFullYear();
let failSummary = false;
const fixture = await openParishFixture(
  browser,
  () => ({
    parish: {
      ...parish,
      subscriptionTier: 'giving',
      parishPlusIncludedInTier: true,
    },
  }),
  {
    '/stewardship/giving/summary': () =>
      failSummary
        ? { status: 503, body: { error: 'Unavailable' } }
        : { body: { total_actual_cents: 100000, manual_income_cents: 25000 } },
    '/stewardship/giving/health-score': (request) => {
      const reportYear = Number(new URL(request.url()).searchParams.get('year'));
      const totals = {
        actualStripeFeeCents: 3000,
        donorFundedStripeFeeCents: 2000,
        parishFundedStripeFeeCents: 1000,
        confirmedCount: 3,
        donorFeeContributionCents: 2000,
        pendingCount: 0,
      };
      return {
        body: {
          processing_fees: {
            year: reportYear,
            annual: { ...totals, label: String(reportYear) },
            quarterly: [{ ...totals, label: 'Q1' }],
            monthly: [{ ...totals, label: 'January' }],
          },
        },
      };
    },
    '/library/settings': { body: {} },
    '/bookstore/products/low-stock': { body: {} },
    '/stewardship': { body: {} },
  }
);
try {
  const { page } = fixture;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await fixture.open();
  await page.locator('#givingOverviewFees .sw-fees').waitFor();
  assert.equal(await page.locator('#tab-giving .sw-giving-comparison').count(), 1);
  assert.match(await page.locator('#givingOverviewComparison').textContent(), /\$750\.00 · 75\.0%/);
  assert.equal(await page.locator('#tab-stewardship .sw-giving-comparison, #tab-stewardship .sw-fees').count(), 0);
  const sourceBox = await page.locator('#givingOverviewComparison').boundingBox();
  const feeBox = await page.locator('#givingOverviewFees').boundingBox();
  assert.equal(sourceBox.y, feeBox.y, 'Desktop cards must share a top edge');
  assert.ok(feeBox.x > sourceBox.x + sourceBox.width, 'Desktop cards must sit side by side');
  assert.ok(Math.abs(sourceBox.height - feeBox.height) < 2, 'Desktop cards must have matching heights');
  await page.locator('#givingOverviewInsightYear').fill(String(year - 1));
  await page.locator('#givingOverviewInsightYear').press('Tab');
  await page.waitForFunction(
    (y) => document.querySelector('#givingOverviewFees .sw-fees-year')?.textContent === String(y),
    year - 1
  );
  await page.getByText('Explore fee breakdown', { exact: true }).click();
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  assert.equal(await page.locator('[data-fee-period="monthly"]').isVisible(), true);
  assert.match(await page.locator('[data-fee-period="monthly"]').textContent(), /January/);
  // A failure in the source comparison must not remove confirmed fee data.
  failSummary = true;
  await page.evaluate(() => loadGivingOverviewInsights());
  assert.match(await page.locator('#givingOverviewComparison').textContent(), /temporarily unavailable/);
  assert.equal(await page.locator('#givingOverviewFees .sw-fees').count(), 1);
  failSummary = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.locator('#givingOverviewComparison .sw-source-row').first().waitFor();
  await page.evaluate(() => {
    document.getElementById('givingMetricsPane').innerHTML = renderGivingMetrics({}, { funds: [] }, 2026);
    document.getElementById('stewardshipHealthScorePane').innerHTML = renderStewardshipHealthScore({});
  });
  assert.equal(await page.locator('#tab-stewardship .sw-giving-comparison, #tab-stewardship .sw-fees').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileSource = await page.locator('#givingOverviewComparison').boundingBox();
  const mobileFees = await page.locator('#givingOverviewFees').boundingBox();
  assert.ok(mobileFees.y >= mobileSource.y + mobileSource.height, 'Mobile cards must stack');
  await page.getByText('Explore fee breakdown', { exact: true }).click();
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  fixture.assertClean();
  console.log(
    'PASS - Giving Overview owns comparison and fees, loads on entry, changes reporting year, preserves fee period controls, retries independently and fits mobile'
  );
} finally {
  await fixture.close();
  await browser.close();
}
