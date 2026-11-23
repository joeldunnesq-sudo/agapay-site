import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openParishFixture, parish } from './lib/parish-browser-fixture.mjs';
const browser = await chromium.launch({ headless: true });
const bodies = [];
let releaseFirst,
  firstStarted,
  first = true,
  active = 0,
  maxActive = 0,
  failNext = false;
const started = new Promise((resolve) => {
  firstStarted = resolve;
});
const held = new Promise((resolve) => {
  releaseFirst = resolve;
});
let stored = {
  ...parish,
  subscriptionTiers: [
    { id: 'starter', label: 'Give', monthlyCents: 0 },
    { id: 'giving', label: 'Give +', monthlyCents: 1900 },
  ],
};
const fixture = await openParishFixture(browser, async (count, request) => {
  if (request.method() !== 'PATCH') return { parish: stored };
  const body = request.postDataJSON();
  assert.equal(body.newDashboardPassword, undefined);
  bodies.push(body);
  active++;
  maxActive = Math.max(maxActive, active);
  try {
    if (first) {
      first = false;
      firstStarted();
      await held;
    }
    if (failNext) {
      failNext = false;
      return { status: 503, body: { error: 'Synthetic save failed. Retry save.' } };
    }
    stored = { ...stored, ...body };
    return { body: { ok: true, parish: stored } };
  } finally {
    active--;
  }
});
try {
  await fixture.open();
  await fixture.page.locator('#nav-settings').click();
  assert.equal(await fixture.page.locator('#settings-profile').isVisible(), true);
  for (const section of ['giving', 'team', 'security', 'billing', 'backup', 'profile']) {
    const button = fixture.page.locator(`[data-settings-section="${section}"]`);
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    assert.equal(await fixture.page.locator(`#settings-${section}`).isVisible(), true);
    assert.equal(await fixture.page.locator('#settingsPane .settings-panel:visible').count(), 1);
  }
  const name = fixture.page.locator('#settingsPane #parishName');
  await name.fill('First saved name');
  await started;
  await name.fill('Latest parish name');
  releaseFirst();
  await fixture.page.waitForFunction(() => document.getElementById('settingsAutosaveText').textContent === 'Saved');
  assert.equal(bodies.at(-1).parishName, 'Latest parish name');
  assert.deepEqual(Object.keys(bodies.at(-1)), ['parishName'], 'routine autosave sends only the edited field');
  assert.equal(maxActive, 1);
  assert.equal(await name.inputValue(), 'Latest parish name');
  assert.equal(await name.evaluate((el) => el === document.activeElement), true);
  assert.equal(await fixture.page.locator('#sidebarParishName').textContent(), 'Latest parish name');
  assert.equal(fixture.requests(), 1, 'autosave updates the dashboard without a full reload');
  const beforeDrafts = bodies.length;
  await fixture.page.locator('[data-settings-section="security"]').click();
  await fixture.page.locator('#newDashboardPassword').fill('partial-password');
  await fixture.page.locator('[data-settings-section="billing"]').click();
  await fixture.page.locator('#subscriptionTierUpgrade').selectOption('giving');
  await fixture.page.waitForTimeout(1100);
  assert.equal(bodies.length, beforeDrafts, 'password and billing drafts do not trigger autosave requests');
  const before = bodies.length;
  failNext = true;
  await fixture.page.locator('[data-settings-section="profile"]').click();
  await fixture.page.locator('#city').fill('Synthetic City');
  await fixture.page.locator('#settingsAutosaveRetry').waitFor({ state: 'visible' });
  assert.match(await fixture.page.locator('#settingsAutosaveText').textContent(), /Synthetic save failed/);
  await fixture.page.locator('#settingsAutosaveRetry').click();
  await fixture.page.waitForFunction(() => document.getElementById('settingsAutosaveText').textContent === 'Saved');
  assert.equal(bodies.length, before + 2);
  assert.equal(bodies.at(-1).city, 'Synthetic City');
  assert.equal(
    await fixture.page.locator('#newDashboardPassword').inputValue(),
    'partial-password',
    'autosave does not erase a password draft'
  );
  assert.equal(bodies.at(-1).subscriptionTier, undefined, 'plan selection cannot silently change billing');
  await fixture.page.locator('#settingsLiturgicalCalendar').selectOption('gregorian');
  await fixture.page.waitForFunction(() => document.getElementById('settingsAutosaveText').textContent === 'Saved');
  assert.equal(bodies.at(-1).liturgicalCalendar, 'gregorian');
  fixture.assertClean();
  console.log(
    'PASS - Settings autosave serializes edits, preserves typing, refreshes dashboard, retries failures, and excludes password and billing drafts'
  );
} finally {
  await fixture.close();
  await browser.close();
}
