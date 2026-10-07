/* global renderFundTransferWorksheet, collectFundTransferInstructions */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setContent(
    '<button id="reconcileTransferPrintButton"></button><div id="reconcileTransferWorksheetPane"></div>'
  );
  await page.evaluate(() => {
    window.reconciliationData = { summary: { depositedCents: 10000 } };
    window.escapeHtml = window.escapeAttr = (v) =>
      String(v ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('"', '&quot;');
    window.moneyFull = (v) => '$' + (Number(v || 0) / 100).toFixed(2);
  });
  await page.addScriptTag({
    content: await readFile(new URL('../public/parish/features/giving/transfers.js', import.meta.url), 'utf8'),
  });
  await page.evaluate(() => renderFundTransferWorksheet(null));
  assert.equal(await page.locator('#reconcileTransferPrintButton').isDisabled(), true);
  assert.match(await page.locator('#reconcileTransferWorksheetPane').textContent(), /No matched/);
  await page.evaluate(() => renderFundTransferWorksheet({ requiresDetail: true }));
  assert.equal(await page.getByRole('button', { name: 'Prepare fund transfers' }).count(), 1);
  await page.evaluate(() =>
    renderFundTransferWorksheet(
      {
        available: true,
        readyToTransfer: false,
        lines: [
          { key: 'building', label: 'Building <unsafe>', netCents: 6000, recommendedAction: 'transfer' },
          { key: 'refund', label: 'Refund', netCents: -500, needsReview: true, recommendedAction: 'transfer' },
          { key: 'general', label: 'General', netCents: 4500 },
        ],
      },
      [
        { key: 'building', destination: 'Savings "north"', completed: true, reference: ' receipt ' },
        { key: 'refund', action: 'transfer', completed: true },
      ]
    )
  );
  const building = page.locator('[data-key="building"]'),
    refund = page.locator('[data-key="refund"]');
  assert.match(await building.textContent(), /Building <unsafe>/);
  assert.equal(await building.locator('unsafe').count(), 0);
  assert.equal(await building.locator('[data-transfer-destination]').inputValue(), 'Savings "north"');
  assert.equal(await refund.locator('[data-transfer-action]').isDisabled(), true);
  assert.equal(await refund.locator('[data-transfer-action]').inputValue(), 'retain');
  assert.equal(await refund.locator('[data-transfer-completed]').isChecked(), false);
  assert.equal(await page.locator('#reconcileTransferPlanned').textContent(), '$60.00');
  assert.equal(await page.locator('#reconcileTransferRetained').textContent(), '$40.00');
  let notes = await page.evaluate(() => collectFundTransferInstructions());
  assert.deepEqual(notes[0], {
    key: 'building',
    action: 'transfer',
    destination: 'Savings "north"',
    completed: true,
    reference: 'receipt',
  });
  assert.equal(notes[1].completed, false);
  await building.locator('[data-transfer-action]').selectOption('retain');
  assert.equal(await building.locator('[data-transfer-completed]').isChecked(), false);
  assert.equal(await building.locator('[data-transfer-destination]').isDisabled(), true);
  assert.equal(await page.locator('#reconcileTransferPlanned').textContent(), '$0.00');
  notes = await page.evaluate(() => collectFundTransferInstructions());
  assert.deepEqual(notes[0], { key: 'building', action: 'retain', destination: '', completed: false, reference: '' });
  await page.evaluate(() => {
    document.getElementById('reconcileTransferWorksheetPane').innerHTML = '';
    window.reconciliationData = { closeRecord: { transferInstructions: [{ key: 'saved', action: 'retain' }] } };
  });
  assert.deepEqual(await page.evaluate(() => collectFundTransferInstructions()), [{ key: 'saved', action: 'retain' }]);
  await page.evaluate(() => {
    window.reconciliationData = null;
  });
  assert.deepEqual(await page.evaluate(() => collectFundTransferInstructions()), []);
  assert.deepEqual(errors, []);
  console.log(
    'PASS - transfer worksheet: empty/detail states, escaped notes, negative-fund restrictions, totals, handling controls, trimmed collection and saved fallback'
  );
} finally {
  await browser.close();
}
