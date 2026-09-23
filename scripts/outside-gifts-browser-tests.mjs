import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openParishFixture } from './lib/parish-browser-fixture.mjs';
import { createOutsideGiftsFixture } from './lib/outside-gifts-fixture.mjs';
import { handleParishGivingHistory } from '../src/handlers/parish-giving-reports.js';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 390]) {
    const finance = await createOutsideGiftsFixture();
    if (width === 1280) finance.registration.subscriptionTier = 'giving';
    const fixture = await openParishFixture(browser, () => ({ parish: finance.dashboard() }), {
      '/settlement-profiles': { body: { profiles: [] } },
      ...Object.fromEntries(
        [
          '/library/settings',
          '/bookstore/products/low-stock',
          '/stewardship',
          '/stewardship/attendance',
          '/reports/diocesan-statistics',
          '/stewardship/giving/health-score',
          '/stewardship/giving/distribution',
          '/stewardship/giving/retention',
          '/stewardship/giving/summary',
          '/stewardship/giving/funds',
          '/stewardship/financials',
          '/stewardship/financials/accounting-summary',
          '/stewardship/income/manual',
          '/stewardship/giving/concentration',
          '/stewardship/giving/recurring',
        ].map((path) => [path, { status: 503, body: { error: 'Report temporarily unavailable in this fixture' } }])
      ),
      '/stewardship': { body: { stewardship: { status: 'included', active: true, includedInParishTier: true } } },
    });
    const { page } = fixture;
    await page.route('**/stewardship/income/manual?*', async (route) => {
      const entries = finance.db
        .prepare(
          'SELECT id,entry_date entryDate,amount_cents amountCents,fund_code fundCode,source,source_label sourceLabel FROM manual_income_entries WHERE contribution_eligible=1'
        )
        .all();
      await route.fulfill({ json: { entries } });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/parish/dashboard/*/outside-gifts**', async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const suffix = url.pathname.split('/outside-gifts')[1] + url.search;
      const response = await finance.outside(suffix, request.method() === 'POST' ? request.postDataJSON() : undefined);
      await route.fulfill({ status: response.status, json: await response.json() });
    });
    await page.route('**/giving-history**', async (route) => {
      const response = await handleParishGivingHistory(
        new Request(route.request().url(), { headers: { Authorization: 'Bearer ' + finance.token } }),
        finance.env,
        finance.registration.parishId
      );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
    try {
      await fixture.open();
      await page.locator('body.dashboard-ready').waitFor();
      if (width === 1280) {
        await page.evaluate(() => {
          return prefetchStewardshipBadge();
        });
        await page.evaluate(() => {
          if (!stewardshipState.loaded || !isParishTier() || isParishPlusActive()) {
            throw new Error('Expected preloaded, tier-included Stewardship without the legacy add-on');
          }
          switchTab('stewardship');
        });
        await page.getByRole('button', { name: 'Record a donor’s gift', exact: true }).click();
      } else {
        await page.locator('.mobile-tab-link[data-nav-tab="givers"]').click();
        await page.getByRole('button', { name: '＋ Record outside gift', exact: true }).click();
      }
      await page
        .getByRole('combobox', { name: 'Attach to giver', exact: true })
        .selectOption({ label: 'Anna Martin · giver0@example.test' });
      await page.getByRole('textbox', { name: 'Gift amount', exact: true }).fill('125.50');
      await page.getByRole('combobox', { name: 'Giving purpose', exact: true }).selectOption('pledge');
      assert.equal(await page.locator('#outsidePledgeYear').isVisible(), true);
      await page.getByRole('combobox', { name: 'Fund', exact: true }).selectOption('general');
      await page.getByRole('combobox', { name: 'Source', exact: true }).selectOption('check');
      await page
        .getByRole('textbox', { name: 'Check / deposit reference (optional)', exact: true })
        .fill('Synthetic pledge check');
      await page.locator('[name="confirmedNotDuplicate"]').check();
      await page.getByRole('button', { name: 'Record gift', exact: true }).click();
      await page.locator('#outsideGiftDialog').waitFor({ state: 'hidden' });
      if (width === 1280) await page.locator('#nav-givers').click();
      await page.getByText('1 contribution recorded for ' + new Date().getFullYear(), { exact: false }).waitFor();
      assert.match(await page.locator('.og-record summary').innerText(), /Anna Martin[\s\S]*Pledge[\s\S]*\$125\.50/);
      assert.match(await page.locator('#giversPane').innerText(), /outside/);
      await page.locator('.og-record summary').click();
      await page.getByRole('button', { name: 'Correct gift', exact: true }).click();
      await page.getByRole('combobox', { name: 'Giving purpose', exact: true }).selectOption('other');
      assert.equal(await page.locator('#outsidePledgeYear').isVisible(), false);
      await page.locator('#outsideCorrectionReason textarea').fill('Actually a special collection gift');
      await page.getByRole('button', { name: 'Save correction', exact: true }).click();
      await page.locator('#outsideGiftDialog').waitFor({ state: 'hidden' });
      await page.getByText('Other giving · General Operating Fund', { exact: false }).waitFor();
      await page.locator('.og-record summary').click();
      await page.getByRole('button', { name: 'View audit trail', exact: true }).click();
      await page.getByText('Revision 2 · corrected', { exact: true }).waitFor();
      if (width === 1280) {
        await page.locator('#nav-stewardship').click();
        await page.getByRole('button', { name: 'Record a collection total', exact: true }).click();
        const batch = page.locator('.sw-income-form');
        await batch.locator('[name="amountCents"]').fill('250.25');
        assert.equal(await batch.locator('[name="fundId"]').inputValue(), '');
        await batch.locator('[name="fundId"]').selectOption('building');
        await batch.locator('[name="confirmedNotDuplicate"]').check();
        await batch.getByRole('button', { name: 'Record contribution', exact: true }).click();
        await page.getByText('Contribution recorded. You can add another collection.', { exact: true }).waitFor();
        const saved = finance.db
          .prepare(
            'SELECT m.id,d.fund_id,d.giver_reference_id,m.amount_cents FROM manual_income_entries m JOIN outside_gift_details d ON d.gift_id=m.id WHERE m.amount_cents=25025'
          )
          .get();
        assert.equal(saved.fund_id, 'building');
        assert.equal(saved.giver_reference_id, null);
        assert.equal(await batch.locator('[name="fundId"]').inputValue(), 'building');
        await page.route('**/outside-gifts/*/accounting', (route) =>
          route.fulfill({ json: { lines: [], note: 'Record a posted deposit for this fund first.' } })
        );
        await page
          .locator('.sw-income-row')
          .filter({ hasText: '250.25' })
          .getByRole('button', { name: 'Review / link Accounting', exact: true })
          .click();
        await page.getByText('Record a posted deposit for this fund first.', { exact: true }).waitFor();
        assert.match(await page.locator('#outsideAccountingContext').textContent(), /Building & Restoration/);
        await page.getByRole('button', { name: 'Close Accounting link', exact: true }).click();
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
        'mobile layout must not overflow'
      );
      fixture.assertClean();
      console.log(
        'PASS outside giving UI ' +
          width +
          'px: all-tier recording, giver/fund selection, pledge fields, correction, audit and no overflow'
      );
    } finally {
      await fixture.close();
      finance.dispose();
    }
  }
} finally {
  await browser.close();
}
