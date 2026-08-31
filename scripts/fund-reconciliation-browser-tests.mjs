import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { openParishFixture } from './lib/parish-browser-fixture.mjs';
import { createFundReconciliationFixture } from './lib/fund-reconciliation-fixture.mjs';
import { fundReportPeriod, loadFundGiftActivity } from '../src/lib/fund-reporting.js';

const browser = await chromium.launch({ headless: true });
let count = 0;
async function scenario(name, run, configure = () => {}) {
  const finance = await createFundReconciliationFixture();
  finance.installStripeMock();
  configure(finance);
  const fixture = await openParishFixture(browser, () => ({ parish: finance.dashboard() }), {
    '/reconciliation': async (request) => {
      const response = await finance.report(new URL(request.url()).searchParams.get('month'));
      return { status: response.status, body: await response.json() };
    },
    '/reconciliation/close': async (request) => {
      const response = await finance.close(request.postDataJSON());
      return { status: response.status, body: await response.json() };
    },
    '/giving-summary': async (request) => ({
      body:
        new URL(request.url()).searchParams.get('view') === 'weekly-funds'
          ? {
              weeklyFunds: await loadFundGiftActivity(
                finance.env,
                finance.registration.parishId,
                fundReportPeriod({ week: true, timezone: finance.registration.timezone }),
                finance.registration
              ),
            }
          : { summary: { giftCount: 20, giverCount: 5 } },
    }),
    '/settlement-profiles': { body: { profiles: [] } },
  });
  try {
    await fixture.open();
    await fixture.page.locator('body.dashboard-ready').waitFor();
    await run(fixture.page, finance);
    fixture.assertClean();
    count++;
    console.log('PASS - ' + name);
  } finally {
    await fixture.close();
    finance.dispose();
  }
}
async function openReport(page) {
  await page.locator('#nav-reconcile').click();
  await page.locator('#reconcileResults').waitFor({ state: 'visible' });
}
async function download(page, name) {
  const menu = page.locator('.fr-export-menu');
  if (!(await menu.getAttribute('open'))) {
    // An open details has an empty attribute, so check its DOM boolean instead.
    if (!(await menu.evaluate((node) => node.open))) await menu.locator('summary').click();
  }
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const file = await pending;
  return readFile(await file.path(), 'utf8');
}

try {
  await scenario(
    'Give has monthly navigation, weekly entry, blank bank check, save and reopen',
    async (page, finance) => {
      await page.getByRole('heading', { name: 'Giving by fund', exact: true }).waitFor();
      assert.deepEqual(
        await page.locator('#nav-tier-give .sidebar-nav-item').evaluateAll((nodes) => nodes.map((node) => node.id)),
        ['nav-giving', 'nav-history', 'nav-givers', 'nav-reconcile', 'nav-options']
      );
      await page.getByRole('button', { name: 'Monthly reconciliation', exact: true }).last().click();
      await page.locator('#reconcileResults').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#reconcileMonth').inputValue(), finance.month);
      assert.equal(await page.locator('#reconcileDeposited').innerText(), '$12,848.54');
      assert.equal(await page.locator('#reconcileBankAmount').inputValue(), '');
      assert.equal(await page.locator('#reconcileSaveButton').isDisabled(), true);
      await page.locator('#reconcileBankAmount').fill('12848.55');
      await page.locator('#reconcileBankConfirmed').check();
      assert.equal(await page.locator('#reconcileSaveButton').isDisabled(), true);
      await page.locator('#reconcileBankAmount').fill('12848.540');
      assert.equal(await page.locator('#reconcileSaveButton').isDisabled(), true);
      await page.locator('#reconcileBankAmount').fill('12848.54');
      assert.equal(await page.locator('#reconcileSaveButton').isEnabled(), true);
      await page.getByRole('button', { name: 'Save reconciled review' }).click();
      await page.locator('#pdxRcStatusPill').getByText('Reconciled', { exact: true }).waitFor();
      assert.equal(await page.locator('#reconcileSaveButton').isDisabled(), true);
      await page.getByRole('textbox', { name: 'Treasurer notes' }).fill('Confirming posting references');
      await page.getByRole('button', { name: 'Reopen review' }).click();
      await page.locator('#pdxRcStatusPill').getByText('Awaiting bank check', { exact: true }).waitFor();
      assert.equal(await page.locator('#reconcileBankAmount').inputValue(), '');
      assert.equal(await page.locator('#reconcileSaveButton').isDisabled(), true);
    }
  );

  await scenario(
    'CSV exports preserve numeric refunds, neutralize formulas, and label drafts',
    async (page) => {
      await openReport(page);
      const funds = await download(page, 'Fund summary CSV');
      assert.match(funds, /Draft - bank review pending/);
      assert.match(funds, /Report fingerprint/);
      assert.match(funds, /Building & Restoration/);
      assert.doesNotMatch(funds, /Anna Martin|example.test/);
      const transactions = await download(page, 'Transaction detail CSV');
      assert.match(transactions, /"-50"/);
      assert.doesNotMatch(transactions, /"'-50"/);
      assert.match(transactions, /'=HYPERLINK/);
      assert.match(transactions, /"txn_refund"/);
      assert.ok(transactions.startsWith('\uFEFF'));
      const popupPromise = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'Print report', exact: true }).click();
      const popup = await popupPromise;
      await popup.getByText('DRAFT — NOT BANK-VERIFIED', { exact: true }).waitFor();
      assert.match(await popup.locator('body').innerText(), /\$12,848\.54/);
      await popup.close();
    },
    (f) => {
      f.addOffering({ ...f.offerings[0], donorName: '=HYPERLINK("bad")' });
    }
  );

  await scenario(
    'unknown net-zero activity blocks closing and appears in the draft',
    async (page) => {
      await openReport(page);
      assert.equal(await page.locator('#reconcileUnallocated').innerText(), '$0.00');
      assert.match(await page.locator('#reconcileReviewCount').innerText(), /2 unmatched/);
      await page.locator('#reconcileBankAmount').fill('12848.54');
      await page.locator('#reconcileBankConfirmed').check();
      assert.equal(await page.locator('#reconcileSaveButton').isDisabled(), true);
      assert.match(await download(page, 'Fund summary CSV'), /incomplete or unresolved/);
    },
    (f) => {
      for (const amount of [1000, -1000])
        f.transactions
          .get(f.payouts[0].id)
          .push({ id: 'txn_unknown' + amount, amount, fee: 0, net: amount, currency: 'usd', type: 'adjustment' });
    }
  );

  await scenario('mobile fund details, payout dates, exports and bank check stay within viewport', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Monthly reconciliation', exact: true }).last().click();
    await page.locator('#reconcileResults').waitFor({ state: 'visible' });
    await page.locator('#reconcileAllocationsPane summary').filter({ hasText: 'Building & Restoration' }).click();
    await page.getByText('Stripe payouts & source transactions', { exact: true }).click();
    await page.locator('.pdx-rc-payout summary').first().click();
    assert.ok((await page.locator('.pdx-rc-payout-date-badge').first().innerText()).includes('24'));
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    assert.ok(
      (await page.locator('.sidebar').boundingBox()).height < 150,
      'mobile header must not occupy a full screen'
    );
    assert.ok(widths.scroll <= widths.width + 1, JSON.stringify(widths));
    assert.match(await download(page, 'Fund summary CSV'), /7990\.12/);
    await page.getByRole('spinbutton', { name: 'Stripe deposits on your bank statement' }).fill('12848.54');
    await page.getByRole('checkbox', { name: 'I checked this amount against the bank statement.' }).check();
    assert.equal(await page.locator('#reconcileSaveButton').isEnabled(), true);
  });
  console.log(`PASS - ${count} reconciliation browser scenarios`);
} finally {
  await browser.close();
}
