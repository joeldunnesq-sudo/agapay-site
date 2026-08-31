import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openParishFixture } from './lib/parish-browser-fixture.mjs';
import { createOutsideGiftsFixture } from './lib/outside-gifts-fixture.mjs';
import { handleParishGivingHistory } from '../src/handlers/parish-giving-reports.js';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 390]) {
    const finance = await createOutsideGiftsFixture();
    const fixture = await openParishFixture(browser, () => ({ parish: finance.dashboard() }), {
      '/settlement-profiles': { body: { profiles: [] } },
    });
    const { page } = fixture;
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
      await page.locator(width < 600 ? '.mobile-tab-link[data-nav-tab="givers"]' : '#nav-givers').click();
      await page.getByRole('button', { name: '＋ Record outside gift', exact: true }).click();
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
