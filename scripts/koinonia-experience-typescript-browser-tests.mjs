import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const script = await readFile(new URL('../public/myagapay/koinonia-experience.js', import.meta.url), 'utf8');
const calendar = await readFile(new URL('../public/liturgical-calendar.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 873 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setContent(
    '<div id="koinoniaShortcuts"></div><h1 id="koinoniaParishName"></h1><a id="todayGiveLink">Give</a><div id="koinoniaChurchDate"></div><div id="chips"></div>'
  );
  await page.addScriptTag({ content: calendar });
  await page.addScriptTag({ content: script });
  const keys = ['signupsEnabled', 'exchangeEnabled', 'prayerRequestsEnabled', 'directoryEnabled'];
  const paths = ['signups', 'exchange', 'prayer-requests', 'directory'];
  for (let mask = 0; mask < 16; mask++) {
    for (const communications of [false, true]) {
      const parish = {
        id: 'p',
        name: '<img src=x onerror=alert(1)>',
        ...Object.fromEntries(keys.map((key, i) => [key, Boolean(mask & (1 << i))])),
      };
      await page.evaluate(
        ({ parish, communications }) => window.KoinoniaExperience.parishContext(parish, communications),
        { parish, communications }
      );
      const expected = paths.filter((_, i) => mask & (1 << i));
      if (communications)
        expected.splice(
          expected.indexOf('directory') < 0 ? expected.length : expected.indexOf('directory'),
          0,
          'groups'
        );
      assert.deepEqual(
        await page
          .locator('#koinoniaShortcuts a')
          .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
        expected.map((path) => `/myagapay/${path}`)
      );
      assert.equal(
        await page.locator('#koinoniaShortcuts').evaluate((el) => el.hidden),
        !communications || !expected.length
      );
      assert.equal(
        await page.locator('#koinoniaShortcuts').evaluate((el) => el.style.getPropertyValue('--shortcut-count')),
        String(expected.length || 1)
      );
      assert.equal(await page.locator('#koinoniaParishName').textContent(), '<img src=x onerror=alert(1)>');
      assert.equal(await page.locator('#koinoniaParishName img').count(), 0);
      assert.ok(
        await page
          .locator('#koinoniaShortcuts [data-community-tool-badge]')
          .evaluateAll((badges) => badges.every((badge) => badge.hidden))
      );
    }
  }
  await page.evaluate(() => window.KoinoniaExperience.parishContext(null, false));
  assert.equal(await page.locator('#koinoniaParishName').textContent(), 'Your church calendar');
  assert.equal(await page.locator('#todayGiveLink').evaluate((el) => el.hidden), true);
  for (const [rule, expected] of [
    ['No fasting', 'No fast'],
    ['Fast-free week', 'No fast'],
    ['Strict fast', 'Plant foods · no oil/wine'],
    ['Fast day', 'Plant foods · no oil/wine'],
    ['Fast — fish permitted', 'fish permitted'],
    ['Wine and oil', 'Wine and oil'],
  ]) {
    const result = await page.evaluate((rule) => {
      const chips = document.getElementById('chips');
      const pill = document.createElement('span');
      pill.textContent = rule;
      chips.replaceChildren(pill);
      window.KoinoniaExperience.compactFasting(chips, rule);
      return {
        text: pill.textContent,
        title: pill.title,
        aria: pill.getAttribute('aria-label'),
        compact: pill.classList.contains('koinonia-fasting-pill'),
      };
    }, rule);
    assert.deepEqual(result, { text: expected, title: rule, aria: rule, compact: true });
  }
  await page.evaluate(() => window.KoinoniaExperience.liturgicalDay('2026-10-14', 'julian', 'October 1'));
  assert.equal(await page.locator('#koinoniaChurchDate').textContent(), 'October 1 · Julian');
  await page.evaluate(() => {
    document.body.replaceChildren();
    window.KoinoniaExperience.parishContext(undefined, false);
    window.KoinoniaExperience.liturgicalDay('', undefined, '');
    window.KoinoniaExperience.compactFasting(document.createElement('div'), 'Missing');
  });
  assert.deepEqual(errors, []);
  console.log(
    'PASS - Koinonia shortcut capability combinations, communications visibility, safe parish labels, fasting accessibility, calendar labels and missing DOM'
  );
} finally {
  await browser.close();
}
