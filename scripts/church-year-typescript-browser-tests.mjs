import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const script = await readFile(new URL('../public/myagapay/church-year.js', import.meta.url), 'utf8');
const calendar = await readFile(new URL('../public/liturgical-calendar.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setContent(
    '<section id="calendarChurchYear" hidden><div role="progressbar"></div><span data-year-day></span><span data-year-calendar></span></section>'
  );
  await page.addScriptTag({ content: script });
  assert.equal(
    await page.evaluate(() => window.KoinoniaChurchYear.progressFor('2026-09-01')),
    null,
    'Missing calendar API stays unavailable'
  );
  await page.addScriptTag({ content: calendar });
  for (const [date, calendarName, elapsed, length] of [
    ['2026-09-01', 'gregorian', 0, 365],
    ['2026-08-31', 'gregorian', 364, 365],
    ['2024-02-29', 'gregorian', 181, 366],
    ['2024-08-31', 'gregorian', 365, 366],
    ['2024-09-01', 'gregorian', 0, 365],
    ['2026-09-14', 'julian', 0, 365],
    ['2026-09-13', 'julian', 364, 365],
  ]) {
    const result = await page.evaluate(
      ({ date, calendarName }) => window.KoinoniaChurchYear.progressFor(date, calendarName),
      { date, calendarName }
    );
    assert.deepEqual(result, { elapsed, day: elapsed + 1, length, percent: (elapsed / length) * 100 });
    await page.evaluate(({ date, calendarName }) => window.KoinoniaChurchYear.render(date, calendarName), {
      date,
      calendarName,
    });
    const actual = await page.locator('#calendarChurchYear').evaluate((card) => {
      const track = card.querySelector('[role="progressbar"]');
      return {
        hidden: card.hidden,
        max: track.getAttribute('aria-valuemax'),
        now: track.getAttribute('aria-valuenow'),
        aria: track.getAttribute('aria-valuetext'),
        day: card.querySelector('[data-year-day]').textContent,
        calendar: card.querySelector('[data-year-calendar]').textContent,
        css: card.style.getPropertyValue('--year-progress'),
      };
    });
    const label = calendarName === 'julian' ? 'Julian' : 'Revised-Julian';
    assert.deepEqual(actual, {
      hidden: false,
      max: String(length),
      now: String(elapsed),
      aria: `Day ${elapsed + 1} of ${length} · ${label} calendar`,
      day: `Day ${elapsed + 1} of ${length}`,
      calendar: `${label} calendar`,
      css: `${(elapsed / length) * 100}%`,
    });
  }
  for (const date of ['', 'not-a-date', '2026-9-01', '2026-09-01T00:00:00Z']) {
    assert.equal(await page.evaluate((date) => window.KoinoniaChurchYear.progressFor(date), date), null);
    await page.evaluate((date) => window.KoinoniaChurchYear.render(date), date);
    assert.equal(await page.locator('#calendarChurchYear').evaluate((card) => card.hidden), true);
  }
  // Preserve the existing format-only check rather than silently adding calendar validation.
  assert.notEqual(await page.evaluate(() => window.KoinoniaChurchYear.progressFor('2026-02-31')), null);
  await page.evaluate(() => window.KoinoniaChurchYear.render('2026-09-01'));
  assert.equal(
    await page.locator('#calendarChurchYear').evaluate((card) => card.hidden),
    false,
    'Valid dates recover after invalid input'
  );
  await page.evaluate(() => {
    document.body.replaceChildren();
    window.KoinoniaChurchYear.render('2026-09-01');
  });
  assert.deepEqual(errors, []);
  console.log(
    'PASS - church-year September rollover, Gregorian/Julian boundaries, leap year, accessible progress, invalid-format recovery, legacy date normalization and missing API/DOM'
  );
} finally {
  await browser.close();
}
