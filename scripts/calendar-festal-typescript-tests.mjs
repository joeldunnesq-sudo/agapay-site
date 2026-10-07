import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as calendar from '../src/liturgical-calendar.js';
import { activeFestalAlmsCampaigns, festalAlmsVisibilityWindow } from '../src/festal-alms.js';
const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../public/liturgical-calendar.js', import.meta.url), 'utf8'), context);
const browser = context.window.AGAPAYLiturgicalCalendar;
const plain = (value) => JSON.parse(JSON.stringify(value));
assert.deepEqual(
  Object.keys(calendar).sort(),
  [
    'FIXED_FEASTS',
    'MOVEABLE_FEASTS',
    'addDaysToIso',
    'calendarLabel',
    'displayDate',
    'fixedFeastDateForCivilYear',
    'fixedFeastsForYear',
    'gregorianToJdn',
    'isoFromGregorianDate',
    'jdnToGregorian',
    'julianToJdn',
    'liturgicalFeastsForYear',
    'moveableFeastsForYear',
    'nextLiturgicalFeast',
    'orthodoxPascha',
  ].sort()
);
for (let year = 1900; year <= 2199; year++) {
  assert.deepEqual(calendar.orthodoxPascha(year), plain(browser.orthodoxPascha(year)));
  for (const key of ['julian', 'gregorian']) {
    assert.deepEqual(calendar.liturgicalFeastsForYear(year, key), plain(browser.liturgicalFeastsForYear(year, key)));
    for (let month = 1; month <= 12; month++) {
      const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
      assert.deepEqual(calendar.jdnToGregorian(calendar.gregorianToJdn(year, month, day)), { year, month, day });
    }
  }
}
assert.equal(calendar.addDaysToIso('2024-02-28', 1), '2024-02-29');
assert.equal(calendar.addDaysToIso('2023-12-31', 1), '2024-01-01');
assert.equal(calendar.calendarLabel(), 'Julian');
assert.equal(calendar.calendarLabel('revised-gregorian'), 'Revised-Julian');
assert.equal(calendar.fixedFeastDateForCivilYear({ month: 12, day: 25 }, 2026).sourceYear, 2025);
assert.deepEqual(
  calendar.nextLiturgicalFeast('julian', new Date(2026, 11, 31, 12)),
  plain(browser.nextLiturgicalFeast('julian', new Date(2026, 11, 31, 12)))
);
for (const invalid of [null, undefined, {}, 'campaign']) assert.deepEqual(activeFestalAlmsCampaigns(invalid), []);
assert.equal(festalAlmsVisibilityWindow({}, 'julian', '2026-01-01'), null);
assert.equal(festalAlmsVisibilityWindow({ id: 'unknown' }, 'julian', '2026-01-01'), null);
for (const status of ['hidden', 'paused', 'cancelled', 'ended', 'inactive', 'HIDDEN'])
  assert.deepEqual(activeFestalAlmsCampaigns([{ id: 'nativity-christ', status }], 'julian', '2026-01-07'), []);
const custom = {
  id: 'patron',
  patronal: true,
  feastDate: '2026-12-19',
  name: 'Patron',
  destinationFundId: 'benevolence',
  metadata: { preserved: true },
};
const snapshot = structuredClone(custom);
const active = activeFestalAlmsCampaigns([custom, { id: 'dormition' }], 'gregorian', new Date('2026-08-10T12:00:00Z'));
assert.deepEqual(custom, snapshot);
assert.equal(active[0].id, 'patron');
assert.equal(active[0].destinationFundId, 'benevolence');
assert.equal(active[0].metadata, custom.metadata);
assert.equal(active[0].visibility.startsAt, '0001-01-01');
assert.equal(active[0].visibility.endsAt, '9999-12-31');
assert.equal(active[0].visibility.alwaysVisible, true);
assert.equal(active[1].visibility.startsAt, '2026-08-01');
const fallback = activeFestalAlmsCampaigns([{ id: 'unlisted', patronal: true }], 'julian', '2026-04-01')[0];
assert.equal(fallback.visibility.feastDate, '2026-04-01');
assert.equal(fallback.visibility.fastStartId, null);
assert.equal(festalAlmsVisibilityWindow({ id: 'custom', feastDate: '12/19' }, 'julian', '2026-12-19'), null);
console.log(
  'PASS - server/browser calendar parity across 300 years, date boundaries, public exports, campaign statuses, custom/patronal visibility, ordering and metadata preservation'
);
