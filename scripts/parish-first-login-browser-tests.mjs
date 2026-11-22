import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openParishFixture, parish } from './lib/parish-browser-fixture.mjs';
const browser = await chromium.launch({ headless: true });
try {
  let saved = false,
    failSave = true,
    writes = 0;
  const fixture = await openParishFixture(browser, (count, request) => {
    if (request.method() === 'PATCH') {
      writes++;
      assert.deepEqual(request.postDataJSON(), { newDashboardPassword: 'synthetic-password-123' });
      if (failSave) return { status: 503, body: { error: 'Synthetic save unavailable' } };
      saved = true;
      return {
        body: {
          ok: true,
          token: 'rotated-synthetic-session',
          parish: {
            ...parish,
            parishDashboardTokenTemporary: false,
            onboarding: { enabled: true, state: 'SETUP', blockers: [], canGoLive: true },
          },
        },
      };
    }
    return {
      parish: {
        ...parish,
        parishDashboardTokenTemporary: !saved,
        onboarding: {
          enabled: true,
          state: 'SETUP',
          blockers: saved ? [] : [{ key: 'credential' }, { key: 'generalFund' }],
          canGoLive: saved,
        },
      },
    };
  });
  try {
    await fixture.open();
    const dialog = fixture.page.locator('#parishPermanentPasswordDialog');
    await dialog.waitFor({ state: 'visible' });
    assert.match(await fixture.page.locator('#setupWizardPane').textContent(), /Set your permanent dashboard password/);
    await dialog.getByRole('button', { name: 'Later', exact: true }).click();
    assert.equal(await fixture.page.locator('#dashboardPasswordNotice').isVisible(), true);
    await fixture.page
      .locator('#dashboardPasswordNotice')
      .getByRole('button', { name: 'Set permanent password', exact: true })
      .click();
    await dialog.locator('[name=password]').fill('synthetic-password-123');
    await dialog.locator('[name=confirmation]').fill('different-password');
    await dialog.getByRole('button', { name: 'Save permanent password', exact: true }).click();
    assert.equal(writes, 0);
    assert.match(await dialog.locator('[role=status]').textContent(), /matching passwords/);
    await dialog.locator('[name=confirmation]').fill('synthetic-password-123');
    await dialog.getByRole('button', { name: 'Save permanent password', exact: true }).click();
    await fixture.page.getByText('Synthetic save unavailable', { exact: true }).waitFor();
    assert.equal(await dialog.isVisible(), true);
    failSave = false;
    await dialog.getByRole('button', { name: 'Save permanent password', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await fixture.page.waitForFunction(() => document.getElementById('dashboardPasswordNotice').hidden);
    assert.equal(
      await fixture.page.evaluate(() => sessionStorage.getItem('agapay_parish_session_token')),
      'rotated-synthetic-session'
    );
    assert.equal(writes, 2);
    fixture.assertClean();
    console.log(
      'PASS - temporary-password prompt, persistent reminder, validation, failed-save retry and session rotation'
    );
  } finally {
    await fixture.close();
  }

  let profilesReads = 0,
    verified = false;
  const profile = {
    id: 'synthetic-profile',
    displayName: 'Synthetic Treasurer',
    roleTemplate: 'treasurer',
    capabilities: ['accounting.configure'],
  };
  const accounting = await openParishFixture(
    browser,
    () => ({
      parish: {
        ...parish,
        subscriptionTier: 'parish',
        accountingAvailable: true,
        entitlements: { modules: { accounting: { included: true, enabled: true } } },
      },
    }),
    {
      '/accounting-access/activation': (request) => ({
        body: {
          status: 'ready',
          completed: false,
          staffReady: verified && request.headers()['x-agapay-accounting-token'] === 'synthetic-accounting-token',
        },
      }),
      '/accounting-access/profiles': () =>
        ++profilesReads === 1
          ? { status: 503, body: { error: 'Synthetic profile lookup unavailable' } }
          : { body: { profiles: [] } },
      '/accounting-access/bootstrap': { body: { profile } },
      '/accounting-access/verify': () => {
        verified = true;
        return {
          body: {
            token: 'synthetic-accounting-token',
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            profile,
          },
        };
      },
      '/accounting/migration/sessions': { body: { sessions: [] } },
    }
  );
  try {
    await accounting.open();
    await accounting.page.locator('#nav-accounting').click();
    await accounting.page.getByRole('button', { name: 'Check access and continue', exact: true }).waitFor();
    assert.match(
      await accounting.page.locator('#accountingPane').textContent(),
      /Synthetic profile lookup unavailable/
    );
    await accounting.page.getByRole('button', { name: 'Check access and continue', exact: true }).click();
    await accounting.page.getByRole('button', { name: 'Activate Accounting access', exact: true }).waitFor();
    assert.equal(
      await accounting.page.locator('.acct-wizard-steps [aria-current=step]').textContent(),
      '2Secure your workspace'
    );
    await accounting.page.locator('#accountingPane [name=displayName]').fill('Synthetic Treasurer');
    await accounting.page.locator('#accountingPane [name=pin]').fill('123456');
    await accounting.page.getByRole('button', { name: 'Activate Accounting access', exact: true }).click();
    await accounting.page.getByRole('heading', { name: 'Bring your chart of accounts.' }).waitFor();
    assert.equal(accounting.requests(), 1, 'step 2 advances without reloading the parish dashboard');
    accounting.assertClean();
    console.log(
      'PASS - Accounting step 2 retries profile lookup and advances to step 3 after PIN setup without page refresh'
    );
  } finally {
    await accounting.close();
  }
} finally {
  await browser.close();
}
