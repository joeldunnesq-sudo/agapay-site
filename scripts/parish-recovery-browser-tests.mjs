import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { openParishFixture } from './lib/parish-browser-fixture.mjs';
import { DISCLOSURE } from '../src/recovery/service.js';

const browser = await chromium.launch({ headless: true });
const id = '11111111-1111-4111-8111-111111111111';
const requests = [];
let active = null;
try {
  const page = await browser.newPage();
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;margin:20px}.btn-row{display:flex;flex-wrap:wrap;gap:8px}.btn{padding:10px;border:1px solid #c2ad77;border-radius:6px}.btn-gold{background:#e0c078}</style><div class="acct-suite-header-meta"></div><div id="settings"></div><script>let currentParish={parishId:"parish-a"};function authHeaders(){return {Authorization:"Bearer synthetic"};}</script>',
      });
    if (url.pathname.startsWith('/parish/'))
      return route.fulfill({
        contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
        body: await readFile(new URL('../public' + url.pathname, import.meta.url)),
      });
    if (route.request().method() === 'GET')
      return route.fulfill({
        json: {
          enabled: true,
          snapshots: [
            {
              id,
              scope: url.searchParams.get('scope'),
              kind: 'manual',
              createdAt: Date.now() - 60000,
              verifiedAt: Date.now() - 50000,
              expiresAt: Date.now() + 86400000,
            },
          ],
          operation: active,
          disclosure: DISCLOSURE,
        },
      });
    const body = route.request().postDataJSON();
    requests.push({ path: url.pathname, body });
    if (url.pathname.endsWith('/advance')) {
      const op = { ...active, status: 'completed' };
      active = null;
      return route.fulfill({ json: { operation: op } });
    }
    active = {
      id: '22222222-2222-4222-8222-222222222222',
      scope: body.scope,
      kind: body.kind,
      status: 'running',
      phase: 'freeze',
      canCancel: true,
    };
    return route.fulfill({ json: { operation: active } });
  });
  await page.goto('https://agapay.test/');
  await page.addScriptTag({ url: 'https://agapay.test/parish/recovery.js' });
  await page.evaluate(() =>
    window.ParishRecovery.mount({
      element: document.getElementById('settings'),
      parishId: currentParish.parishId,
      headers: authHeaders,
      scope: 'parish',
    })
  );
  await page.locator('#settings [data-recovery-backup]').click();
  await page.waitForFunction(() =>
    document.querySelector('#settings [data-recovery-status]').textContent.includes('Verified restore-ready')
  );
  assert.equal(requests[0].body.scope, 'parish');
  await page.getByRole('button', { name: 'Backup & restore', exact: true }).click();
  const panel = page.locator('dialog [data-panel]');
  await panel.locator('[data-recovery-restore]').click();
  const confirm = page.locator('dialog').filter({ has: page.locator('form') });
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(
    requests.filter((r) => r.body.kind === 'restore').length,
    0,
    'opening/cancelling restore never changes records'
  );
  await panel.locator('[data-recovery-restore]').click();
  await confirm.locator('[name=acknowledged]').check();
  await confirm.locator('[name=confirmation]').fill('RESTORE PARISH');
  await confirm.getByRole('button', { name: 'Confirm restore' }).click();
  assert.match(await confirm.locator('[data-error]').textContent(), /exactly/);
  assert.equal(requests.filter((r) => r.body.kind === 'restore').length, 0, 'scope-specific phrase enforced');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await confirm.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  await mkdir('artifacts/parish-recovery', { recursive: true });
  await page.screenshot({ path: 'artifacts/parish-recovery/mobile-confirmation.png', fullPage: true });
  await confirm.locator('[name=confirmation]').fill('RESTORE ACCOUNTING');
  await confirm.getByRole('button', { name: 'Confirm restore' }).click();
  await page.waitForFunction(() =>
    document.querySelector('dialog [data-recovery-status]')?.textContent.includes('Restore verified')
  );
  const submitted = requests.find((r) => r.body.kind === 'restore').body;
  assert.equal(submitted.scope, 'accounting');
  assert.equal(submitted.snapshotId, id);
  assert.equal(submitted.acknowledged, true);
  const fixture = await openParishFixture(browser);
  try {
    await fixture.open();
    await fixture.page.waitForFunction(() => document.querySelector('#parishBackupCard [data-recovery-backup]'));
    assert.equal(await fixture.page.locator('[data-recovery-toolbar]').count(), 1);
    fixture.assertClean();
  } finally {
    await fixture.close();
  }
  console.log(
    'PASS - Settings and Accounting controls, explicit scoped restore confirmation, no restore on cancel, timestamp, mobile dialog and real dashboard mounting'
  );
} finally {
  await browser.close();
}
