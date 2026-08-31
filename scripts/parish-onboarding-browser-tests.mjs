import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openParishFixture, parish } from './lib/parish-browser-fixture.mjs';

const browser = await chromium.launch({ headless: true });
const setup = {
  ...parish,
  onboarding: { enabled: true, state: 'SETUP', blockers: [{ key: 'givingConfiguration' }] },
};
const readyToLaunch = {
  ...setup,
  onboarding: {
    enabled: true,
    state: 'READY',
    canGoLive: true,
    materialVersion: 'v1-snapshot',
    summary: { treasurerEmail: 'treasurer@example.test' },
  },
};

async function scenario(name, response, run, apiResponses) {
  const fixture = await openParishFixture(browser, response, apiResponses);
  try {
    await fixture.open();
    await fixture.page.waitForFunction(() => document.body.classList.contains('dashboard-ready'));
    await run(fixture.page);
    fixture.assertClean();
    console.log(`PASS - ${name}`);
  } finally {
    await fixture.close();
  }
}

async function openWizard(page) {
  await page.getByRole('button', { name: 'Review giving setup', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Review giving setup', exact: true });
  await modal.waitFor();
  return modal;
}

async function confirmations(page, checked) {
  for (const checkbox of await page.locator('.treasurer-affirmation').all()) await checkbox.setChecked(checked);
  await page.locator('#goLiveAuthority').setChecked(checked);
}

try {
  await scenario(
    'starter wizard validates input, preserves draft across steps, and discards it on cancel',
    () => ({ parish: setup }),
    async (page) => {
      const modal = await openWizard(page);
      await modal.locator('#givingSetupGeneralName').fill('');
      await modal.getByRole('button', { name: 'Continue', exact: true }).click();
      assert.equal(await modal.getByText('Step 1 of 3', { exact: true }).count(), 1);
      assert.ok((await page.locator('#toastContainer').textContent()).includes('Enter the primary giving destination'));
      await modal.locator('#givingSetupGeneralName').fill('Parish operating draft');
      await modal.locator('#givingSetupGeneralDescription').fill('Draft description');
      await modal.locator('#givingSetupRecurring').uncheck();
      await modal.locator('#givingSetupCandles').uncheck();
      await modal.getByRole('button', { name: 'Continue', exact: true }).click();
      assert.equal(await modal.locator('#givingSetupCustomCampaign').count(), 0, 'starter must not offer campaigns');
      await modal.locator('#givingSetupCustomFund').fill('Outreach');
      await modal.getByRole('button', { name: 'Add fund', exact: true }).click();
      await modal.locator('#givingSetupCustomFund').fill('Second fund');
      await modal.getByRole('button', { name: 'Add fund', exact: true }).click();
      assert.equal(await modal.locator('.giving-setup-selected-row').count(), 1, 'starter permits one designated fund');
      assert.ok((await page.locator('#toastContainer').textContent()).includes('supports one active designated fund'));
      await modal.getByRole('button', { name: 'Back', exact: true }).click();
      assert.equal(await modal.locator('#givingSetupGeneralName').inputValue(), 'Parish operating draft');
      assert.equal(await modal.locator('#givingSetupGeneralDescription').inputValue(), 'Draft description');
      assert.equal(await modal.locator('#givingSetupRecurring').isChecked(), false);
      assert.equal(await modal.locator('#givingSetupCandles').isChecked(), false);
      await modal.getByRole('button', { name: 'Continue', exact: true }).click();
      assert.equal(await modal.getByRole('button', { name: 'Remove Outreach', exact: true }).count(), 1);
      await modal.getByRole('button', { name: 'Continue', exact: true }).click();
      await modal.locator('input[value="requested"]').check();
      await modal.getByRole('button', { name: 'Back', exact: true }).click();
      await modal.getByRole('button', { name: 'Continue', exact: true }).click();
      assert.equal(await modal.locator('input[value="requested"]').isChecked(), true);
      await modal.getByRole('button', { name: 'Close giving setup' }).click();
      assert.equal(await modal.count(), 0);
      await openWizard(page);
      assert.equal(await modal.locator('#givingSetupGeneralName').inputValue(), 'General Operating Fund');
      await modal.getByRole('button', { name: 'Continue', exact: true }).click();
      assert.equal(await modal.locator('.giving-setup-selected-row').count(), 0);
    }
  );

  for (const plus of [false, true]) {
    const initial = {
      ...setup,
      subscriptionTier: plus ? 'giving' : 'starter',
      subscriptionTierLabel: plus ? 'Give +' : 'Give',
      funds: [
        ...parish.funds,
        { id: 'candles', name: 'Candles', enabled: true },
        { id: 'archived-fund', name: 'Archived fund', enabled: false },
      ],
      campaigns: [{ id: 'archived-campaign', name: 'Archived campaign', active: false }],
    };
    const patches = [];
    let reads = 0;
    await scenario(
      `${plus ? 'Give +' : 'starter'} save preserves catalog entries, survives failure, and reloads saved state`,
      (_count, request) => {
        if (request.method() === 'PATCH') {
          assert.equal(request.headers().authorization, 'Bearer synthetic-session-token');
          assert.equal(request.headers()['content-type'], 'application/json');
          patches.push(request.postDataJSON());
          return patches.length === 1
            ? { status: 503, body: { error: 'Synthetic save unavailable' } }
            : { body: { ok: true } };
        }
        reads++;
        return { parish: reads === 1 ? initial : { ...initial, ...patches.at(-1) } };
      },
      async (page) => {
        const modal = await openWizard(page);
        await modal.locator('#givingSetupGeneralName').fill('Saved operating fund');
        await modal.locator('#givingSetupRecurring').uncheck();
        await modal.getByRole('button', { name: 'Continue', exact: true }).click();
        await modal.locator('#givingSetupCustomFund').fill('Outreach');
        await modal.getByRole('button', { name: 'Add fund', exact: true }).click();
        if (plus) {
          await modal.locator('#givingSetupCustomFund').fill('Education');
          await modal.getByRole('button', { name: 'Add fund', exact: true }).click();
          await modal.locator('#givingSetupCustomCampaign').fill('Roof repair');
          await modal.getByRole('button', { name: 'Add campaign', exact: true }).click();
          await modal.getByRole('button', { name: 'Remove Roof repair', exact: true }).click();
          await modal.locator('#givingSetupCustomCampaign').fill('Roof repair');
          await modal.getByRole('button', { name: 'Add campaign', exact: true }).click();
        }
        await modal.getByRole('button', { name: 'Continue', exact: true }).click();
        await modal.locator('input[value="requested"]').check();
        const save = modal.getByRole('button', { name: 'Save giving setup', exact: true });
        await save.click();
        await modal.locator('#givingSetupSaveStatus.error').waitFor();
        assert.equal(await save.isEnabled(), true);
        assert.equal(await modal.locator('#givingSetupSaveStatus').textContent(), 'Synthetic save unavailable');
        assert.ok((await modal.locator('.giving-setup-review').textContent()).includes('Saved operating fund'));
        assert.equal(await modal.locator('input[value="requested"]').isChecked(), true);
        assert.equal(reads, 1, 'failed saves must not reload the dashboard');
        const payload = patches[0];
        assert.deepEqual(
          Object.keys(payload).sort(),
          [
            'funds',
            'recurringGivingEnabled',
            'candlesEnabled',
            'givingCatalogChanged',
            'accountingCatalogChanged',
            'givingSetupReviewed',
            'importDecision',
            ...(plus ? ['campaigns'] : []),
          ].sort()
        );
        assert.equal(payload.givingSetupReviewed, true);
        assert.equal(payload.givingCatalogChanged, true);
        assert.equal(payload.accountingCatalogChanged, true);
        assert.equal(payload.importDecision, 'requested');
        assert.equal(payload.recurringGivingEnabled, false);
        assert.equal(payload.candlesEnabled, true);
        assert.deepEqual(
          payload.funds.map((fund) => fund.id),
          ['general', 'outreach', ...(plus ? ['education'] : []), 'candles', 'archived-fund']
        );
        assert.equal(payload.funds.at(-1).enabled, false);
        assert.equal(payload.funds[0].name, 'Saved operating fund');
        assert.equal(payload.funds[0].restrictionType, 'unrestricted');
        if (plus)
          assert.deepEqual(
            payload.campaigns.map((campaign) => campaign.id),
            ['roof-repair', 'archived-campaign']
          );
        await save.click();
        await modal.waitFor({ state: 'detached' });
        await page.waitForFunction(() => !document.body.classList.contains('dashboard-refreshing'));
        assert.deepEqual(patches[1], payload, 'retry must send the same reviewed configuration');
        assert.equal(reads, 2);
        await openWizard(page);
        assert.equal(await modal.locator('#givingSetupGeneralName').inputValue(), 'Saved operating fund');
      }
    );
  }

  const submissions = [];
  await scenario(
    'signoff failures preserve the form; changed snapshots require fresh confirmations before launch',
    () => ({ parish: readyToLaunch }),
    async (page) => {
      const goLive = page.getByRole('button', { name: 'Go Live', exact: true });
      await page.locator('#goLiveSignerName').fill('Synthetic Treasurer');
      await page.locator('#goLiveSignerTitle').fill('Treasurer');
      assert.equal(await page.locator('#goLiveSignerEmail').getAttribute('readonly'), '');
      // Validation is server-owned: submit unchecked confirmations and retain its error.
      await goLive.click();
      await page.getByText('Confirm all launch affirmations.', { exact: true }).first().waitFor();
      assert.equal(await goLive.isEnabled(), true);
      assert.equal(await page.locator('#goLiveSignerName').inputValue(), 'Synthetic Treasurer');
      assert.equal(submissions[0].authorityConfirmed, false);
      assert.ok(Object.values(submissions[0].affirmations).every((value) => value === false));
      await confirmations(page, true);
      await goLive.click();
      await page.getByText('Synthetic signoff unavailable', { exact: true }).first().waitFor();
      assert.equal(await goLive.isEnabled(), true);
      assert.equal(await page.locator('.treasurer-affirmation:checked').count(), 8);
      assert.equal(await page.locator('#goLiveAuthority').isChecked(), true);
      await goLive.click();
      await page.locator('.onboarding-snapshot').filter({ hasText: 'v2-snapsho' }).waitFor();
      assert.equal(await page.locator('.treasurer-affirmation:checked').count(), 0);
      assert.equal(await page.locator('#goLiveAuthority').isChecked(), false);
      assert.equal(await page.locator('#goLiveSignerName').inputValue(), 'Synthetic Treasurer');
      assert.equal(await page.locator('#goLiveSignerTitle').inputValue(), 'Treasurer');
      assert.ok((await page.locator('#goLiveError').textContent()).includes('check the confirmations again'));
      assert.equal(await goLive.isEnabled(), true);
      await confirmations(page, true);
      await goLive.click();
      await page.locator('#treasurerSignoff').waitFor({ state: 'detached' });
      assert.equal(await page.locator('#setupWizardPane').textContent(), '');
      assert.equal(submissions.length, 4);
      assert.deepEqual(
        submissions.map((body) => body.snapshotVersion),
        ['v1-snapshot', 'v1-snapshot', 'v1-snapshot', 'v2-snapshot']
      );
      assert.deepEqual(
        Object.keys(submissions[3]).sort(),
        ['snapshotVersion', 'affirmations', 'signerName', 'signerTitle', 'authorityConfirmed'].sort()
      );
      assert.deepEqual(
        Object.keys(submissions[3].affirmations).sort(),
        [
          'stripeAccount',
          'payoutBank',
          'organizationName',
          'generalFund',
          'designatedFunds',
          'recurringGiving',
          'receiptDetails',
          'agapayPlan',
        ].sort()
      );
      assert.ok(Object.values(submissions[3].affirmations).every(Boolean));
      assert.equal(submissions[3].authorityConfirmed, true);
    },
    {
      '/onboarding': (request) => {
        assert.equal(request.method(), 'POST');
        assert.equal(request.headers().authorization, 'Bearer synthetic-session-token');
        assert.equal(request.headers().accept, 'application/json');
        assert.equal(request.headers()['content-type'], 'application/json');
        submissions.push(request.postDataJSON());
        if (submissions.length === 1) return { status: 400, body: { errors: ['Confirm all launch affirmations.'] } };
        if (submissions.length === 2) return { status: 503, body: { error: 'Synthetic signoff unavailable' } };
        if (submissions.length === 3)
          return {
            status: 409,
            body: {
              code: 'onboarding_snapshot_changed',
              onboarding: { ...readyToLaunch.onboarding, materialVersion: 'v2-snapshot' },
            },
          };
        return { body: { parish: { givingStatus: 'live' }, onboarding: { enabled: true, state: 'LIVE' } } };
      },
    }
  );
} finally {
  await browser.close();
}
