import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../public/liturgical-calendar.js', import.meta.url), 'utf8'), context);
const api = context.window.AGAPAYLiturgicalCalendar;
for (let year = 1900; year <= 2199; year++) {
  for (let month = 1; month <= 12; month++) {
    const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const value = api.jdnToGregorian(api.gregorianToJdn(year, month, day));
    assert.equal(value.year, year);
    assert.equal(value.month, month);
    assert.equal(value.day, day);
  }
  const pascha = api.orthodoxPascha(year);
  assert.equal(new Date(pascha.date + 'T12:00:00Z').getUTCDay(), 0);
  const moving = api.moveableFeastsForYear(year);
  assert.equal(moving.length, api.MOVEABLE_FEASTS.length);
  for (const feast of moving) assert.equal((Date.parse(feast.date) - Date.parse(pascha.date)) / 86400000, feast.offset);
  for (const calendar of ['julian', 'gregorian']) {
    const fixed = api.fixedFeastsForYear(year, calendar);
    assert.equal(fixed.length, api.FIXED_FEASTS.length);
    assert.ok(fixed.every((f) => f.date.startsWith(String(year))));
    const feasts = api.liturgicalFeastsForYear(year, calendar);
    assert.equal(feasts.length, fixed.length + moving.length);
    assert.deepEqual(
      Array.from(feasts, (f) => f.date),
      [...feasts.map((f) => f.date)].sort()
    );
  }
}
assert.equal(api.calendarLabel('revised-gregorian'), 'Revised-Julian');
assert.equal(api.calendarLabel(undefined), 'Julian');
for (const calendar of ['julian', 'gregorian']) {
  const next = api.nextLiturgicalFeast(calendar, new Date(2026, 11, 31, 12));
  assert.ok(next.date >= '2026-12-31');
  assert.ok(next.date < '2028-01-01');
  const fixed = api.fixedFeastsForYear(2026, calendar);
  const nativity = fixed.find((f) => f.id === 'nativity-christ');
  assert.equal(nativity.month, 12);
  assert.equal(nativity.day, 25);
  assert.match(nativity.sourceDate, calendar === 'julian' ? /2025$/ : /2026$/);
}
console.log(
  'PASS - liturgical calendar: 3,600 civil date round trips, 300 years of moveable offsets and fixed-year bounds, sorting, calendar aliases and next-year lookup'
);
