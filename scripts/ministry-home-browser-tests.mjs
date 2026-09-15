import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';

const parish = {
  id: 'parish',
  name: 'St. Fiacre Orthodox Church',
  communicationsEnabled: true,
  parishLifeAvailable: true,
  parishLifeLabel: 'Koinonia',
};
const donor = {
  email: 'member@example.test',
  donorName: 'Test Member',
  defaultParishId: parish.id,
  defaultParish: parish,
};
const group = {
  id: 'hospitality',
  name: 'Hospitality Ministry',
  role: 'leader',
  description:
    'A warm welcome, a shared meal, and a place to belong. Serve together through the everyday work of parish hospitality.',
};
const members = [
  { personId: 'anna', name: 'Anna K.', role: 'leader', mine: true },
  { personId: 'maria', name: 'Maria T.', role: 'member' },
  { personId: 'james', name: 'James P.', role: 'member' },
];
const messages = Array.from({ length: 35 }, (_, index) => ({
  id: `message-${index}`,
  body: `Team update ${index + 1}: thank you for welcoming our newest parish families this Sunday.`,
  authorName: 'Anna K.',
  messageType: 'text',
  createdAt: '2026-09-15T10:00:00Z',
  read: true,
}));
const event = {
  id: 'coffee',
  title: 'Sunday coffee hour',
  starts_at: 1790008200000,
  location: 'Parish hall',
  description: 'Gather after Divine Liturgy for coffee and fellowship.',
};
const resource = {
  id: 'checklist',
  title: 'Sunday setup checklist',
  resource_type: 'checklist',
  notes: 'Set the tables, prepare refreshments, and welcome visitors.',
};
const overview = {
  event,
  resource,
  latestMessage: { ...messages.at(-1), created_at: event.starts_at },
  signup: { id: 'coffee-signup', title: 'Sunday hospitality team', openings: 2 },
  myCommitments: Array.from({ length: 5 }, (_, index) => ({
    sheetId: `sheet-${index}`,
    title: 'Sunday coffee hour',
    label: 'Set up & welcome',
    slot_date: event.starts_at + index * 604800000,
  })),
  coverageRequests: [
    {
      id: 'coverage',
      requester_name: 'Maria',
      title: 'Coffee hour',
      label: 'Cleanup',
      slot_date: event.starts_at,
      note: 'Could someone stay for thirty minutes?',
    },
  ],
};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  let empty = false;
  let failOverview = false;
  let failMembers = false;
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'agapay.test') return route.fulfill({ status: 204, body: '' });
    if (url.pathname.startsWith('/api/')) {
      let payload = {};
      if (url.pathname === '/api/donor/dashboard') payload = { donor, parish };
      if (url.pathname === '/api/donor/groups') payload = { groups: [group] };
      if (url.pathname.endsWith('/messages')) payload = { group, messages };
      if (url.pathname.endsWith('/overview')) {
        if (failOverview) return route.fulfill({ status: 503, json: { error: 'Please try again.' } });
        payload = empty ? {} : overview;
      }
      if (url.pathname.endsWith('/members')) {
        if (failMembers) return route.fulfill({ status: 503, json: { error: 'Members unavailable' } });
        payload = { members };
      }
      if (url.pathname.endsWith('/schedule'))
        payload = { events: Array.from({ length: 12 }, (_, index) => ({ ...event, id: `event-${index}` })) };
      if (url.pathname.endsWith('/resources')) payload = { resources: [resource] };
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
            : filename.endsWith('.html')
              ? 'text/html'
              : 'application/octet-stream',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  await context.addInitScript(
    ({ donor }) => {
      localStorage.setItem('agapayDonorEmail', donor.email);
      localStorage.setItem('agapayDonorToken', 'test-session');
      localStorage.setItem('agapayDonorProfile', JSON.stringify(donor));
    },
    { donor }
  );
  const page = await context.newPage();
  const errors = captureBrowserErrors(page);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('https://agapay.test/myagapay/groups?group=hospitality');
    await page.locator('.ministry-home-footer').waitFor();
    assert.equal(await page.locator('body').evaluate((el) => el.classList.contains('is-group-thread-open')), false);
    assert.equal(
      await page.locator('.ministry-home-grid').getByRole('heading', { name: 'Sunday coffee hour' }).count(),
      1
    );
    assert.equal(await page.locator('.ministry-home-commitment').count(), 5);
    assert.ok(await page.locator('.ministry-home-next').getByRole('button', { name: 'View schedule' }).isVisible());
    assert.ok(
      (await page.locator('.ministry-home-need a').getAttribute('href')) === '/myagapay/signups?sheet=coffee-signup'
    );
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `No horizontal page overflow at ${width}px`
    );
    await page.mouse.move(Math.min(width - 30, 300), 500);
    await page.mouse.wheel(0, 10000);
    await page.waitForFunction(() => window.scrollY > 0);
    await page.locator('.ministry-home-footer').scrollIntoViewIfNeeded();
    assert.ok(
      await page.locator('.ministry-home-footer').evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
      'End of homepage is reachable'
    );
    if (process.env.MINISTRY_SCREENSHOTS && (width === 390 || width === 1280)) {
      await page.screenshot({
        path: process.env.MINISTRY_SCREENSHOTS.replace('.png', `-${width}.png`),
        fullPage: true,
      });
    }
    await page.getByRole('button', { name: 'View schedule', exact: true }).click();
    await page.locator('.ministry-event-list article').last().waitFor();
    await page.locator('.ministry-event-list article').last().scrollIntoViewIfNeeded();
    assert.ok(
      await page
        .locator('.ministry-event-list article')
        .last()
        .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
      'Last schedule entry is reachable'
    );
    await page.locator('[data-group-tab="messages"]').click();
    assert.equal(await page.locator('body').evaluate((el) => el.classList.contains('is-group-thread-open')), true);
    assert.ok(
      await page.locator('#groupMessageSubmit').evaluate((el) => {
        const box = el.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= innerHeight;
      }),
      'Conversation composer stays inside the viewport'
    );
    assert.ok(
      await page.locator('#groupMessageList').evaluate((el) => el.scrollHeight > el.clientHeight),
      'Messages have a scrollable region'
    );
    await page.locator('[data-group-tab="overview"]').click();
    await page.locator('.ministry-home-footer').waitFor();
    assert.equal(await page.locator('body').evaluate((el) => el.classList.contains('is-group-thread-open')), false);
    await page.getByRole('button', { name: 'Back to ministry groups', exact: true }).click();
    await page.locator('.group-list-item').waitFor();
    assert.equal(new URL(page.url()).searchParams.has('group'), false);
    errors.assertClean();
  }
  empty = true;
  await page.goto('https://agapay.test/myagapay/groups?group=hospitality');
  await page.getByText('You have no upcoming commitments. Browse signups to find a way to serve.').waitFor();
  assert.ok(await page.getByText('There are no open signups right now.').isVisible());
  empty = false;
  failMembers = true;
  await page.reload();
  await page.locator('.ministry-home-footer').waitFor();
  assert.ok(await page.getByText('Meet your fellow members and share your availability.').isVisible());
  failMembers = false;
  failOverview = true;
  await page.reload();
  await page.getByText('Unable to load overview').waitFor();
  assert.ok(
    await page.locator('[data-group-tab="schedule"]').isVisible(),
    'Navigation remains usable after an overview error'
  );
  console.log(
    'PASS - ministry homes and schedules scroll at four widths, conversation fits its viewport, return navigation works, and empty/error states remain useful'
  );
} finally {
  await browser.close();
}
