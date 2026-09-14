import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';

const parish = { id: 'test-parish', name: 'Test Parish' };
const initialDonor = {
  email: 'member@example.test',
  donorName: 'Test Member',
  defaultParishId: parish.id,
  pledgeAmountCents: 2550,
  pledgeCadence: 'monthly',
};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block' });
  let donor = { ...initialDonor };
  const saves = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'agapay.test') return route.fulfill({ status: 204, body: '' });
    if (url.pathname.startsWith('/api/')) {
      let payload = {};
      if (url.pathname === '/api/parishes') payload = { parishes: [parish] };
      if (url.pathname === '/api/donor/dashboard') {
        if (route.request().method() === 'PATCH') {
          const body = route.request().postDataJSON();
          saves.push(body);
          donor = { ...donor, ...body };
        }
        payload = { donor, parish };
      }
      return route.fulfill({ json: payload });
    }
    let filename = url.pathname;
    if (!filename.split('/').at(-1).includes('.')) filename += '.html';
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
  await page.addInitScript(
    ({ initialDonor }) => {
      localStorage.setItem('agapayDonorEmail', initialDonor.email);
      localStorage.setItem('agapayDonorToken', 'test-session');
      localStorage.setItem('agapayDonorProfile', JSON.stringify(initialDonor));
    },
    { initialDonor }
  );
  await page.goto('https://agapay.test/myagapay/account');
  await page.waitForFunction(() => document.getElementById('settingsName')?.value === 'Test Member');
  const amount = page.locator('#pledgeAmount');
  assert.equal(await amount.inputValue(), '25.50', 'Loading settings preserves pledge cents');
  assert.equal(await amount.evaluate((input) => input.validity.valid), true, 'Existing pledge can be submitted');
  await page.locator('#settingsName').fill('Updated Member');
  const saveSettings = async () => {
    const response = page.waitForResponse(
      (res) => res.url().endsWith('/api/donor/dashboard') && res.request().method() === 'PATCH'
    );
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await response;
    await page.waitForFunction(() => document.getElementById('settingsName')?.value === 'Updated Member');
  };
  await saveSettings();
  assert.equal(saves.at(-1).pledgeAmountCents, 2550, 'An unrelated profile edit preserves the pledge');
  await amount.fill('-1');
  assert.equal(await amount.evaluate((input) => input.validity.valid), false, 'Negative pledges remain invalid');
  await amount.fill('37.255');
  assert.equal(await amount.evaluate((input) => input.validity.valid), false, 'Fractional cents remain invalid');
  await amount.fill('37.25');
  assert.equal(
    await amount.evaluate((input) => input.validity.valid),
    true,
    'Amounts need not be multiples of fifty dollars'
  );
  await saveSettings();
  assert.equal(saves.at(-1).pledgeAmountCents, 3725);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('pledgeAmount')?.value === '37.25');
  assert.equal(await page.evaluate(() => localStorage.getItem('agapayDonorToken')), 'test-session');
  errors.assertClean();
  const legacy = await readFile(new URL('../public/donor/settings.html', import.meta.url), 'utf8');
  assert.match(legacy, /id="pledgeAmount"[^>]*step="0\.01"/);
  console.log(
    'PASS - account edits preserve pledge cents, accept cent increments, retain sessions, and survive reloads'
  );
} finally {
  await browser.close();
}
