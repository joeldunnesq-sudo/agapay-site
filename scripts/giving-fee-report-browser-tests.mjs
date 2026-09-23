import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { summarizeGivingFees } from '../src/lib/giving-fee-report.js';
import { givingFeeReportHtml } from '../src/stewardship/giving-fee-presentation.js';

const records = Array.from({ length: 9 }, (_, month) =>
  Array.from({ length: 40 }, (_, index) => ({
    paymentStatus: 'paid',
    completedAt: `2026-${String(month + 1).padStart(2, '0')}-15`,
    giftAmountCents: 10000,
    chargeCents: index < 28 ? 10330 : 10000,
    coverFees: index < 28,
    stripeFeeCents: index < 28 ? 330 : 320,
    stripeFeeSource: month === 8 && index > 36 ? 'estimated' : 'balance_transaction',
    stripeBalanceTransactionId: `txn_${month}_${index}`,
  }))
).flat();
const report = summarizeGivingFees(records, 2026);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setContent(
    '<style>body{background:#f6f1e8;margin:32px auto;padding:0 20px;max-width:980px}h1{font:36px Georgia,serif;color:#0d2933}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}</style><h1>Stewardship health</h1><div id="fees"></div>'
  );
  await page.addStyleTag({
    content: await readFile(new URL('../public/styles/stewardship-fees.css', import.meta.url), 'utf8'),
  });
  await page.evaluate(() => {
    window.escapeHtml = (value) =>
      String(value).replace(
        /[&<>"']/g,
        (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
      );
  });
  await page.addScriptTag({
    content: await readFile(new URL('../public/parish/features/stewardship/fees.js', import.meta.url), 'utf8'),
  });
  await page.evaluate((data) => {
    document.querySelector('#fees').innerHTML = renderStewardshipFees(data);
  }, report);
  assert.match(await page.locator('.sw-fees-kpis').textContent(), /Confirmed Stripe fees/);
  assert.equal(await page.locator('[data-fee-period="yearly"]').isVisible(), true);
  await page.getByRole('button', { name: 'Quarterly', exact: true }).click();
  assert.equal(await page.locator('[data-fee-period="quarterly"] tbody tr').count(), 4);
  assert.equal(await page.locator('[data-fee-period="yearly"]').isVisible(), false);
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  assert.equal(await page.locator('[data-fee-period="monthly"] tbody tr').count(), 12);
  assert.equal(await page.getByRole('button', { name: 'Monthly', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.sw-fees-note').textContent(), /3 gifts await reconciliation/);
  if (process.env.GIVING_FEE_SCREENSHOT) {
    await page.getByRole('button', { name: 'Quarterly', exact: true }).click();
    await mkdir('tmp/pdfs', { recursive: true });
    await page.screenshot({ path: 'tmp/pdfs/stewardship-fees-desktop.png', fullPage: true });
    await writeFile(
      'tmp/pdfs/stewardship-fees-report.html',
      `<html><head><meta charset="utf-8"></head><body>${givingFeeReportHtml(report)}</body></html>`
    );
  }
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    'Mobile fee card must not overflow the page'
  );
  assert.equal(
    await page
      .locator('.sw-fees-scroll')
      .first()
      .evaluate((node) => getComputedStyle(node).overflowX),
    'auto'
  );
  await page.evaluate(() => {
    document.querySelector('#fees').innerHTML = renderStewardshipFees(null);
  });
  assert.match(await page.locator('#fees').textContent(), /not available/);
  await page.addScriptTag({
    content: await readFile(new URL('../public/parish/features/accounting/banking.js', import.meta.url), 'utf8'),
  });
  await page.evaluate(() => {
    window.accountingApi = (path) => path;
    window.authHeaders = () => ({});
    window.accountingMoney = (cents) => '$' + (cents / 100).toFixed(2);
    window.repairRequests = [];
    window.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      window.repairRequests.push(body);
      return Response.json({
        feeCoverage: {
          year: body.year,
          scanned: 2,
          totalCents: 330,
          nextCursor: null,
          additions: [{ offeringId: 'gift-1', amountCents: 330, status: body.apply ? 'posted' : 'not_recorded' }],
        },
      });
    };
    document.querySelector('#fees').innerHTML = '';
    renderAccountingFeeCoverageRepair(document.querySelector('#fees'));
  });
  await page.getByRole('button', { name: 'Preview historical gifts' }).click();
  await page.getByRole('button', { name: 'Recognize reviewed additions' }).waitFor();
  assert.match(await page.locator('[data-fee-repair-output]').textContent(), /\$3.30/);
  await page.getByRole('button', { name: 'Recognize reviewed additions' }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-fee-repair-output]').textContent.includes('1 additions posted')
  );
  const requests = await page.evaluate(() => window.repairRequests);
  assert.equal(requests[0].apply, false);
  assert.equal(requests[1].expectedAdditions[0].amountCents, 330);
  assert.deepEqual(errors, []);
  console.log(
    'PASS - stewardship fee visual totals, quarterly/monthly/yearly controls, pending fees, mobile layout and missing data'
  );
} finally {
  await browser.close();
}
