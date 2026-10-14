import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const script = await readFile(new URL('../public/myagapay/ministry-home.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 873 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setContent('<main id="home"></main>');
  await page.addScriptTag({ content: script });
  await page.evaluate(() => {
    window.ministryCalls = { tabs: [], coverage: [], statuses: [] };
    window.switchGroupWorkspace = async (tab) => {
      window.ministryCalls.tabs.push(tab);
    };
    window.acceptMinistryCoverage = (id) => {
      window.ministryCalls.coverage.push(id);
      return new Promise((resolve, reject) => {
        window.finishCoverage = { resolve, reject };
      });
    };
    window.groupStatus = (message) => window.ministryCalls.statuses.push(message);
    window.ministryOptions = {
      group: { name: '<img src=x onerror=alert(1)>' },
      members: [
        { name: 'Alice Example', role: 'leader' },
        ...Array.from({ length: 5 }, (_, i) => ({ name: `Member ${i}`, role: 'member' })),
      ],
      messages: [{ id: 'latest', authorName: '<Leader>' }],
      escape: (value) => {
        const span = document.createElement('span');
        span.textContent = String(value ?? '');
        return span.innerHTML.replaceAll('"', '&quot;');
      },
      formatDate: (value) => `Date ${value ?? ''}`,
    };
    window.ministryData = {
      event: { title: '<Gathering>', starts_at: 100, location: 'Hall' },
      latestMessage: { id: 'latest', body: '<script>bad()</script>', created_at: 100 },
      signup: { id: 'signup/a?', title: 'Serve', openings: '3' },
      myCommitments: [{ sheet_id: 'legacy/a?', title: 'Coffee', label: 'Setup', slot_date: 100 }],
      coverageRequests: [
        { id: 'cover', requester_name: 'Teammate', title: 'Coffee', label: 'Cleanup', note: '<Please help>' },
      ],
    };
    window.MinistryHome.render(document.getElementById('home'), window.ministryData, window.ministryOptions);
  });
  assert.equal(await page.evaluate(() => Object.isFrozen(window.MinistryHome)), true);
  assert.equal(await page.locator('#home img, #home script').count(), 0);
  assert.equal(await page.locator('#ministryNextHeading').textContent(), '<Gathering>');
  assert.match(await page.locator('.ministry-home-note').textContent(), /<Leader>/);
  assert.match(await page.locator('.ministry-home-avatars').textContent(), /\+2/);
  assert.equal(
    await page.locator('.ministry-home-commitment').getAttribute('href'),
    '/myagapay/signups?sheet=legacy%2Fa%3F'
  );
  assert.match(await page.locator('.ministry-home-need').textContent(), /3 open serving spots/);
  await page.locator('[data-ministry-tab="schedule"]').click();
  assert.deepEqual(await page.evaluate(() => window.ministryCalls.tabs), ['schedule']);
  await page.locator('[data-ministry-coverage]').click();
  assert.equal(await page.locator('[data-ministry-coverage]').isDisabled(), true);
  await page.evaluate(() => window.finishCoverage.reject(new Error('Try again')));
  await page.waitForFunction(() => !document.querySelector('[data-ministry-coverage]').disabled);
  assert.deepEqual(await page.evaluate(() => window.ministryCalls.statuses), ['Try again']);
  await page.locator('[data-ministry-coverage]').click();
  await page.evaluate(() => window.finishCoverage.resolve());
  await page.waitForFunction(() => !document.querySelector('[data-ministry-coverage]').disabled);
  assert.deepEqual(await page.evaluate(() => window.ministryCalls.coverage), ['cover', 'cover']);
  // Re-rendering replaces the delegated handler instead of accumulating actions.
  await page.evaluate(() =>
    window.MinistryHome.render(document.getElementById('home'), {}, { ...window.ministryOptions, members: null })
  );
  assert.match(await page.locator('#home').textContent(), /no upcoming commitments/);
  assert.match(await page.locator('#home').textContent(), /Meet your fellow members/);
  await page.locator('[data-ministry-tab="schedule"]').click();
  assert.deepEqual(await page.evaluate(() => window.ministryCalls.tabs), ['schedule', 'schedule']);
  assert.deepEqual(errors, []);
  console.log(
    'PASS - Ministry Home escaping, legacy IDs, optional data, member overflow, frozen API, delegated navigation, coverage busy/error/retry and rerender behavior'
  );
} finally {
  await browser.close();
}
