import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';

const donor = { email: 'member@example.test', donorName: 'Test Member', defaultParishId: 'test-parish' };
const slot = {
  date: '2026-10-01',
  time: '10:00',
  label: '10:00 AM',
  priestName: 'Test Priest',
  priestEmail: 'priest@example.test',
};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block' });
  const bookings = [];
  let requests = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'agapay.test') return route.fulfill({ status: 204, body: '' });
    if (url.pathname.startsWith('/api/')) {
      let payload = {};
      if (url.pathname === '/api/donor/dashboard')
        payload = { donor, parish: { id: 'test-parish', name: 'Test Parish' } };
      if (url.pathname === '/api/donor/sacraments')
        payload = { available: true, requests, offerings: { types: ['confession', 'baptism'], custom: [] } };
      if (url.pathname === '/api/donor/sacraments/availability') payload = { slots: requests.length ? [] : [slot] };
      if (url.pathname === '/api/donor/sacraments/book') {
        bookings.push(route.request().postDataJSON());
        requests = [
          {
            id: 'request-1',
            sacramentType: 'confession',
            status: 'scheduled',
            confirmedDate: slot.date,
            confirmedTime: slot.time,
          },
        ];
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
    ({ donor }) => {
      localStorage.setItem('agapayDonorEmail', donor.email);
      localStorage.setItem('agapayDonorToken', 'test-session');
      localStorage.setItem('agapayDonorProfile', JSON.stringify(donor));
    },
    { donor }
  );
  await page.goto('https://agapay.test/myagapay/sacraments');
  const confession = page.locator('#sacramentAccordion').getByRole('button', { name: /Confession/ });
  await confession.waitFor();
  assert.equal(
    await page.locator('#sacramentAccordion .sac-accordion-trigger').count(),
    2,
    'Only parish-enabled sacraments appear'
  );
  await confession.click();
  const modal = page.locator('#sacramentServiceModal');
  await modal.locator('.sac-slot-chip').waitFor();
  await modal.getByRole('button', { name: 'Book selected time' }).click();
  assert.equal(bookings.length, 0, 'A slot must be selected before booking');
  await modal.locator('.sac-slot-chip').click();
  await modal.getByRole('button', { name: 'Book selected time' }).click();
  await modal.locator('.sac-booked-panel').waitFor();
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].parishId, 'test-parish');
  assert.equal(bookings[0].sacramentType, 'confession');
  assert.equal(bookings[0].date, slot.date);
  assert.equal(bookings[0].time, slot.time);
  assert.equal(bookings[0].priestEmail, slot.priestEmail);
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'hidden' });
  await page
    .locator('#sacramentAccordion')
    .getByRole('button', { name: /Baptism/ })
    .click();
  await modal.waitFor({ state: 'visible' });
  assert.match(await modal.textContent(), /Candidate/);
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.reload();
  await page
    .locator('#sacramentUpcomingStrip')
    .getByText(/Confession/)
    .first()
    .waitFor();
  errors.assertClean();
  console.log(
    'PASS - mobile sacraments preserve parish offerings, slot validation, booking payloads, modal controls, and reloads'
  );
} finally {
  await browser.close();
}
