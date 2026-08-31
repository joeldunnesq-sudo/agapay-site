import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { openParishFixture, parish, origin } from './lib/parish-browser-fixture.mjs';

/* global loadGivingHistory, loadGivingSummary, loadCommemorations */

const now = new Date();
const year = now.getFullYear();
const recent = now.toISOString();
const gifts = [
  {
    id: 'a',
    donorName: 'Zoe <giver>',
    donorEmail: 'zoe@example.test',
    date: recent,
    fund: 'General',
    amountCents: 10000,
    parishNetCents: 9700,
    giftAmountCents: 10000,
    totalFeeCents: 300,
    recurring: true,
  },
  {
    id: 'b',
    donorName: 'Amy "Test"',
    donorEmail: 'amy@example.test',
    date: recent,
    fund: 'Candles',
    amountCents: 2500,
    parishNetCents: 2500,
    coverFees: true,
    type: 'candle',
    commemorationNames: ['Test Intention'],
  },
  {
    id: 'c',
    donorName: 'Zoe <giver>',
    donorEmail: 'zoe@example.test',
    date: `${year - 2}-01-01T00:00:00.000Z`,
    fund: 'General',
    amountCents: 5000,
    recurring: false,
  },
];
let savedParish;
const givingParish = {
  ...parish,
  subscriptionTier: 'giving',
  subscriptionTierLabel: 'Give +',
  onboarding: { enabled: true, state: 'LIVE' },
  funds: [...parish.funds, { id: 'benevolence-fund', name: 'Benevolence Fund', enabled: true }],
  campaigns: [
    { id: 'outreach', name: 'Outreach', description: 'Original', customMetadata: 'preserve', goalCents: 50000 },
  ],
};
const defaults = {
  '/giving-history': { body: { gifts, manualAccountingGifts: [] } },
  '/giving-summary': {
    body: {
      summary: { year, ytdCents: 12200, grossGiftCents: 12500, giverCount: 2, giftCount: 2, lastGiftAt: recent },
    },
  },
  '/recurring-health': {
    body: { health: { activeCount: 1, failedThisMonthCount: 0, lapsedCount: 0, monthlyRecurringCents: 10000 } },
  },
  '/commemorations': {
    body: {
      entries: [
        { donorName: 'Synthetic donor', createdAt: recent, living: ['Living <name>'], departed: ['Departed name'] },
      ],
    },
  },
  '/settlement-profiles': { body: { profiles: [] } },
};
const browser = await chromium.launch({ headless: true });

async function scenario(name, run, overrides = {}, dashboardResponse = () => ({ parish: givingParish })) {
  const fixture = await openParishFixture(browser, dashboardResponse, { ...defaults, ...overrides });
  try {
    await fixture.open();
    const { page } = fixture;
    await page.waitForFunction(() => document.body.classList.contains('dashboard-ready'));
    // Wait for the boot's delayed history load before typing into forms it redraws.
    await page.locator('#historyTableWrap tbody tr').first().waitFor({ state: 'attached' });
    await run(page, fixture);
    fixture.assertClean();
    console.log(`PASS - ${name}`);
  } finally {
    await fixture.close();
  }
}

function payload(request) {
  assert.equal(request.headers().authorization, 'Bearer synthetic-session-token');
  assert.equal(request.headers()['content-type'], 'application/json');
  return request.postDataJSON();
}

async function downloadedText(page, action) {
  const downloaded = page.waitForEvent('download');
  await action();
  const download = await downloaded;
  const text = await readFile(await download.path(), 'utf8');
  return { name: download.suggestedFilename(), text };
}

try {
  let summaryFails = false,
    commemorationFails = false;
  await scenario(
    'overview, recurring health, commemorations, and QR fallback survive refresh failures',
    async (page) => {
      await page.waitForFunction(() => document.getElementById('pdxKpiDonors').textContent === '2');
      assert.ok((await page.locator('#pdxHeroSub').textContent()).includes('Gross $125'));
      assert.equal(await page.locator('.pdx-commemoration-names').first().textContent(), 'Living <name>');
      assert.equal(await page.locator('#commemorationQueuePane img').count(), 0);
      assert.equal(await page.locator('#givingUrlHeroInput').inputValue(), `${origin}/give/synthetic-parish`);
      assert.ok((await page.locator('#qrCodeHero').textContent()).includes('Load dashboard'));
      summaryFails = true;
      await page.evaluate(() => loadGivingSummary());
      await page.locator('#givingSummaryStatus').waitFor({ state: 'visible' });
      assert.ok((await page.locator('#givingSummaryStatus').textContent()).includes('Unable to refresh giving totals'));
      assert.ok((await page.locator('#pdxHeroSub').textContent()).includes('Gross $125'));
      summaryFails = false;
      await page.getByRole('button', { name: 'Retry totals', exact: true }).click();
      await page.locator('#givingSummaryStatus').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#givingSummaryStatus').isHidden(), true);
      commemorationFails = true;
      await page.evaluate(() => loadCommemorations());
      assert.equal(await page.locator('#commemorationQueuePane').textContent(), 'Synthetic names unavailable');
      commemorationFails = false;
      await page.evaluate(() => loadCommemorations());
      assert.equal(await page.locator('.pdx-commemoration-card').count(), 2);
    },
    {
      '/giving-summary': () =>
        summaryFails ? { status: 503, body: { error: 'Synthetic summary unavailable' } } : defaults['/giving-summary'],
      '/commemorations': () =>
        commemorationFails
          ? { status: 503, body: { error: 'Synthetic names unavailable' } }
          : defaults['/commemorations'],
    }
  );

  let historyFails = false;
  await scenario(
    'history filters, net totals, escaped donors, CSV, and recovery; givers search and sort',
    async (page) => {
      await page.locator('#nav-history').click();
      const rows = page.locator('#historyTableWrap tbody tr');
      await page.locator('#histRangeFilter').selectOption('all');
      assert.equal(await rows.count(), 3);
      assert.equal(await page.locator('#histStatAmount').textContent(), '$172');
      assert.equal(await rows.locator('img').count(), 0);
      await page.locator('#histTypeFilter').selectOption('recurring');
      assert.equal(await rows.count(), 1);
      await page.locator('#histTypeFilter').selectOption('all');
      await page.locator('#histFundFilter').selectOption('Candles');
      assert.equal(await rows.count(), 1);
      await page.locator('#histSearch').fill('Test Intention');
      const csv = await downloadedText(page, () =>
        page
          .locator('#tab-history')
          .getByRole('button', { name: /export.*csv/i })
          .first()
          .click()
      );
      assert.match(csv.name, /^synthetic-parish-giving-history-/);
      assert.ok(csv.text.includes('"Amy ""Test"""'));
      assert.ok(csv.text.includes('"25.00"'));
      assert.equal(csv.text.split('\n').length, 2);
      await page.locator('#histSearch').fill('no such giver');
      assert.ok((await page.locator('#historyTableWrap').textContent()).includes('No gifts match'));
      await page.locator('#histSearch').fill('');
      historyFails = true;
      await page.evaluate(() => loadGivingHistory());
      assert.ok((await page.locator('#historyTableWrap').textContent()).includes('Synthetic history unavailable'));
      historyFails = false;
      await page.evaluate(() => loadGivingHistory());
      assert.equal(await rows.count(), 3);
      await page.locator('#nav-givers').click();
      const cards = page.locator('.pdx-gv-dir-card');
      assert.equal(await cards.count(), 2);
      assert.equal(await cards.first().locator('.pdx-gv-dir-name').textContent(), 'Zoe <giver>');
      await page.locator('[data-sort="name"]').click();
      assert.equal(await cards.first().locator('.pdx-gv-dir-name').textContent(), 'Amy "Test"');
      await page.locator('#pdxGvSearch').fill('zoe@');
      assert.equal(await cards.count(), 1);
      await page.locator('#pdxGvSearch').fill('absent');
      assert.ok((await page.locator('#giversPane').textContent()).includes('No givers match'));
    },
    {
      '/giving-history': () =>
        historyFails ? { status: 503, body: { error: 'Synthetic history unavailable' } } : defaults['/giving-history'],
    }
  );

  const saves = [];
  savedParish = structuredClone(givingParish);
  await scenario(
    'fund editing, validation, festal destinations, and catalog save failure/retry preserve shared data',
    async (page) => {
      await page.locator('#nav-options').click();
      await page
        .locator('.options-progress-row')
        .filter({ hasText: 'Benevolence Fund' })
        .getByRole('button', { name: 'Edit', exact: true })
        .click();
      const edit = page.locator('.option-edit-form');
      await edit.locator('[name="name"]').fill('Benevolence renamed');
      await edit.locator('[name="accountNumber"]').fill('out reach-12!');
      await edit.getByRole('button', { name: 'Apply changes' }).click();
      await page.locator('#fundName').fill('Benevolence renamed');
      await page.getByRole('button', { name: 'Add designated fund', exact: true }).click();
      await page.getByText('A fund with that name already exists.', { exact: true }).waitFor();
      await page.locator('#fundName').fill('Synthetic fund');
      await page.locator('#fundDescription').fill('Synthetic need');
      await page.getByRole('button', { name: 'Add designated fund', exact: true }).click();
      assert.equal(await page.locator('.options-progress-row').filter({ hasText: 'Synthetic fund' }).count(), 1);
      const pascha = page.locator('input[onchange*="toggleFeastCampaign(\'pascha\'"]');
      await page.locator('label[aria-label="Toggle Pascha"]').click();
      assert.equal(await pascha.isChecked(), true);
      await page.locator('select[onchange*="updateFeastCampaignFund(\'pascha\'"]').selectOption('general');
      await page.getByRole('button', { name: 'Save giving options', exact: true }).click();
      await page.getByText('Synthetic catalog unavailable', { exact: true }).waitFor();
      assert.equal(await page.locator('.options-progress-row').filter({ hasText: 'Synthetic fund' }).count(), 1);
      await page.getByRole('button', { name: 'Save giving options', exact: true }).click();
      await page.getByText('Parish settings saved.', { exact: true }).waitFor();
      assert.deepEqual(saves[0], saves[1]);
      assert.deepEqual(saves[1].campaigns, givingParish.campaigns);
      assert.deepEqual(saves[1].funds[0], givingParish.funds[0]);
      assert.equal(saves[1].funds[1].id, 'benevolence-fund');
      assert.equal(saves[1].funds[1].accountNumber, 'OUTREACH-12');
      assert.equal(saves[1].funds[2].name, 'Synthetic fund');
      assert.equal(saves[1].feastCampaigns.find((f) => f.id === 'pascha').destinationFundId, 'general');
      assert.equal(saves[1].givingCatalogChanged, true);
      assert.equal(saves[1].accountingCatalogChanged, true);
    },
    {},
    (_count, request) => {
      if (request.method() !== 'PATCH') return { parish: savedParish };
      const data = payload(request);
      saves.push(data);
      if (saves.length === 1) return { status: 503, body: { error: 'Synthetic catalog unavailable' } };
      savedParish = { ...savedParish, ...data };
      return { parish: savedParish };
    }
  );

  const period = `${year}-01`;
  let closeRecord = null,
    reconFails = false;
  const closes = [];
  const recon = {
    available: true,
    period: { month: period },
    summary: {
      depositedCents: 10000,
      grossActivityCents: 10500,
      totalFeeCents: 500,
      matchedNetCents: 10000,
      matchedPercent: 100,
      paidPayoutCount: 1,
    },
    allocations: [
      { category: 'Giving', label: 'Building', netCents: 10000, grossCents: 10500, feeCents: 500, transactionCount: 1 },
    ],
    transferWorksheet: {
      available: true,
      depositedCents: 10000,
      lines: [{ key: 'building', label: 'Building', netCents: 10000, recommendedAction: 'retain' }],
    },
  };
  await scenario(
    'reconciliation errors, transfer instructions, difference validation, close retry, reopen, and CSV',
    async (page) => {
      await page.locator('.mobile-tab-link[data-nav-tab="reconcile"]').evaluate((el) => el.click());
      await page.locator('#reconcileBankAmount').waitFor();
      await page.waitForFunction(() => document.getElementById('reconcileBankAmount').value === '100.00');
      assert.equal(await page.locator('#pdxRcStatusPill').textContent(), 'Ready to close');
      await page.locator('#reconcileBankAmount').fill('99');
      await page.getByRole('button', { name: 'Mark month closed' }).click();
      await page
        .getByText('Add a treasurer note explaining the bank difference before closing.', { exact: true })
        .waitFor();
      assert.equal(closes.length, 0);
      await page.locator('#reconcileNotes').fill('Synthetic timing difference');
      const row = page.locator('[data-transfer-row]');
      await row.locator('[data-transfer-action]').selectOption('transfer');
      await row.locator('[data-transfer-destination]').fill(' Building savings ');
      await row.locator('[data-transfer-completed]').check();
      await row.locator('[data-transfer-reference]').fill(' TEST-123 ');
      await page.getByRole('button', { name: 'Mark month closed' }).click();
      await page.getByText('Synthetic close unavailable', { exact: true }).waitFor();
      assert.equal(await page.locator('#reconcileNotes').inputValue(), 'Synthetic timing difference');
      await page.getByRole('button', { name: 'Mark month closed' }).click();
      await page.locator('#pdxRcStatusPill').filter({ hasText: 'Month closed' }).waitFor();
      assert.deepEqual(closes[0], closes[1]);
      assert.equal(closes[1].bankStatementCents, 9900);
      assert.deepEqual(closes[1].transferInstructions, [
        {
          key: 'building',
          action: 'transfer',
          destination: 'Building savings',
          completed: true,
          reference: 'TEST-123',
        },
      ]);
      const csv = await downloadedText(page, () =>
        page
          .locator('#tab-reconcile')
          .getByRole('button', { name: /export.*csv/i })
          .click()
      );
      assert.equal(csv.name, `synthetic-parish-reconciliation-${period}.csv`);
      assert.ok(csv.text.includes('Building savings'));
      await page.getByRole('button', { name: 'Reopen month' }).click();
      await page.locator('#pdxRcStatusPill').filter({ hasText: 'Ready to close' }).waitFor();
      assert.equal(closes.at(-1).closed, false);
      reconFails = true;
      await page.locator('#reconcileMonth').selectOption({ index: 1 });
      await page.locator('.toast').filter({ hasText: 'Synthetic reconciliation unavailable' }).waitFor();
    },
    {
      '/reconciliation': () =>
        reconFails
          ? { status: 503, body: { error: 'Synthetic reconciliation unavailable' } }
          : { body: { ...recon, closeRecord } },
      '/reconciliation/close': (request) => {
        const data = payload(request);
        closes.push(data);
        if (closes.length === 1) return { status: 503, body: { error: 'Synthetic close unavailable' } };
        closeRecord = { ...data, status: data.closed ? 'closed' : 'open' };
        return { body: { record: closeRecord } };
      },
    }
  );

  let previews = 0,
    jobs = 0;
  await scenario(
    'statement preview failure, cancelled batch, synthetic batch retry, polling, and job history',
    async (page) => {
      await page.locator('#nav-givers').click();
      await page.locator('#gsFiscalYear').selectOption(String(year - 1));
      await page.locator('#gsPreviewDonor').selectOption('amy@example.test');
      await page.getByRole('button', { name: 'Preview PDF', exact: true }).click();
      await page.getByText('Synthetic preview unavailable', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Preview PDF', exact: true }).isEnabled(), true);
      assert.equal(previews, 1);
      const send = page.getByRole('button', { name: 'Generate & email all donors', exact: true });
      page.once('dialog', (dialog) => dialog.dismiss());
      await send.click();
      assert.equal(jobs, 0);
      page.once('dialog', (dialog) => dialog.accept());
      await send.click();
      await page.getByText('Synthetic job unavailable', { exact: true }).waitFor();
      assert.equal(await send.isEnabled(), true);
      page.once('dialog', (dialog) => dialog.accept());
      await send.click();
      await page.locator('#gsJobProgressText').filter({ hasText: '2/2 processed' }).waitFor();
      await page.locator('#gsJobHistory tbody tr').waitFor();
      assert.equal(jobs, 2);
    },
    {
      '/giving-statements/preview': (request) => {
        assert.deepEqual(payload(request), { fiscalYear: year - 1, donorEmail: 'amy@example.test' });
        previews++;
        return { status: 503, body: { error: 'Synthetic preview unavailable' } };
      },
      '/giving-statements/jobs': (request) => {
        if (request.method() === 'POST') {
          assert.deepEqual(payload(request), { fiscalYear: year - 1 });
          jobs++;
          return jobs === 1
            ? { status: 503, body: { error: 'Synthetic job unavailable' } }
            : { body: { jobId: 'synthetic-job', totalDonors: 2 } };
        }
        return {
          body: {
            jobs:
              jobs > 1
                ? [
                    {
                      fiscalYear: year - 1,
                      status: 'completed',
                      sentCount: 2,
                      totalDonors: 2,
                      failedCount: 0,
                      createdAt: recent,
                    },
                  ]
                : [],
          },
        };
      },
      '/giving-statements/jobs/synthetic-job': {
        body: { status: 'completed', processedDonors: 2, totalDonors: 2, sentCount: 2, failedCount: 0 },
      },
    }
  );
} finally {
  await browser.close();
}
