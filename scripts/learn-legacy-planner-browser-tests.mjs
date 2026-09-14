import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';

const browser = await chromium.launch({ headless: true });
try {
  for (const scenario of ['empty', 'saved', 'blocked']) {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block' });
    const requested = [];
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      requested.push(url.pathname);
      if (url.hostname !== 'agapay.test') return route.fulfill({ status: 204, body: '' });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
      const filename = url.pathname.split('/').at(-1).includes('.') ? url.pathname : `${url.pathname}.html`;
      try {
        return route.fulfill({
          body: await readFile(new URL(`../public${filename}`, import.meta.url)),
          contentType: filename.endsWith('.js')
            ? 'text/javascript'
            : filename.endsWith('.css')
              ? 'text/css'
              : 'text/html',
        });
      } catch {
        return route.fulfill({ status: 404, body: '' });
      }
    });
    const page = await context.newPage();
    const errors = captureBrowserErrors(page);
    await page.addInitScript((scenario) => {
      localStorage.setItem('agapayDonorEmail', 'member@example.test');
      localStorage.setItem('agapayDonorToken', 'test-session');
      if (scenario === 'saved') {
        localStorage.setItem('agapay.planner.v2', '{"plan":{"d0":{"dinner":"Saved meal"}}}');
        localStorage.setItem('agapay.planner.seed.v1', 'unparseable legacy value');
      }
      if (scenario === 'blocked')
        Storage.prototype.getItem = () => {
          throw new Error('Storage blocked');
        };
    }, scenario);
    await page.goto('https://agapay.test/learn/Meals.dc.html');
    await page.getByRole('heading', { name: 'Family Planner has moved' }).waitFor();
    if (scenario === 'saved') {
      await page.locator('#legacyPlannerBackup').waitFor({ state: 'visible' });
      const backup = await page.evaluate(async () =>
        (await fetch(document.getElementById('legacyPlannerDownload').href)).json()
      );
      assert.deepEqual(backup.storage, {
        'agapay.planner.v2': '{"plan":{"d0":{"dinner":"Saved meal"}}}',
        'agapay.planner.seed.v1': 'unparseable legacy value',
      });
      assert.equal(backup.format, 'agapay-legacy-planner-backup');
    } else {
      assert.equal(await page.locator('#legacyPlannerBackup').isVisible(), false);
      if (scenario === 'blocked') await page.locator('#legacyPlannerStorageNotice').waitFor({ state: 'visible' });
    }
    assert.ok(!requested.includes('/learn/support.js'), 'The retired generated runtime is never loaded');
    if (scenario !== 'blocked') {
      await page.getByRole('link', { name: 'Open Family Planner', exact: true }).click();
      await page.waitForURL('**/learn/planner?scope=meals&tool=plan&view=week');
      await page.getByRole('heading', { name: 'Best experienced on a larger screen' }).waitFor();
      if (scenario === 'saved')
        assert.equal(
          await page.evaluate(() => localStorage.getItem('agapay.planner.seed.v1')),
          'unparseable legacy value'
        );
    }
    errors.assertClean();
    await context.close();
  }
  console.log(
    'PASS - retired planner preserves exact local data, exports a backup, handles blocked storage, and opens the maintained planner'
  );
} finally {
  await browser.close();
}
