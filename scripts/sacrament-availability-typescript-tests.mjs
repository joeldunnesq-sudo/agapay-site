import assert from 'node:assert/strict';
import {
  computeAvailableSlots,
  isSlotStillOpen,
  isSchedulableOfferingKey,
  zonedTimeToUtc,
} from '../src/lib/sacrament-availability.js';
assert.equal(isSchedulableOfferingKey(' custom_visit '), true);
for (const key of ['custom_', 'custom_ABC', 'wedding', null]) assert.equal(isSchedulableOfferingKey(key), false);
assert.equal(zonedTimeToUtc('2030-01-07', '10:00', 'America/Chicago').toISOString(), '2030-01-07T16:00:00.000Z');
assert.equal(zonedTimeToUtc('2030-07-01', '10:00', 'America/Chicago').toISOString(), '2030-07-01T15:00:00.000Z');
assert.equal(zonedTimeToUtc('2030-01-07', '10:00', 'Asia/Kolkata').toISOString(), '2030-01-07T04:30:00.000Z');
assert.throws(() => zonedTimeToUtc('2030-01-07', '10:00', 'Invalid/Zone'), RangeError);
const RealDate = Date;
const instant = RealDate.parse('2030-01-07T15:00:00Z');
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super(instant);
  }
  static now() {
    return instant;
  }
};
try {
  const rule = {
    day_of_week: 1,
    start_time: '09:00',
    end_time: '12:00',
    slot_minutes: 30,
    priest_name: 'A',
    priest_email: 'a@example.test',
  };
  const options = { parishId: 'test-parish', sacramentType: 'confession', timezone: 'America/Chicago', daysAhead: 1 };
  function database({ rules = [rule], blackouts = [], bookings = [], fail = '' } = {}) {
    return {
      AGAPAY_DB: {
        prepare(sql) {
          return {
            bind(...params) {
              assert.equal(params[0], 'test-parish');
              return {
                async all() {
                  if (fail && sql.includes(fail)) throw new Error('synthetic database failure');
                  const results = sql.includes('availability_rules')
                    ? rules
                    : sql.includes('availability_blackouts')
                      ? blackouts
                      : bookings;
                  return { results };
                },
              };
            },
          };
        },
      },
    };
  }
  assert.deepEqual(await computeAvailableSlots({}, options), { slots: [], timezone: 'America/Chicago' });
  assert.deepEqual(await computeAvailableSlots(database(), { ...options, timezone: null }), {
    slots: [],
    timezone: '',
  });
  assert.equal((await computeAvailableSlots(database(), { ...options, sacramentType: 'wedding' })).slots.length, 0);
  const normal = await computeAvailableSlots(database(), options);
  assert.deepEqual(
    normal.slots.map((s) => s.time),
    ['09:30', '10:00', '10:30', '11:00', '11:30']
  );
  assert.equal(normal.slots[0].startsAt, '2030-01-07T15:30:00.000Z');
  assert.equal(normal.slots[0].priestEmail, 'a@example.test');
  assert.ok(normal.slots[0].label);
  assert.equal((await computeAvailableSlots(database(), { ...options, maxSlots: 2 })).slots.length, 2);
  assert.equal((await computeAvailableSlots(database({ fail: 'availability_rules' }), options)).slots.length, 0);
  assert.equal(
    (await computeAvailableSlots(database({ rules: [{ ...rule, start_time: 'invalid' }] }), options)).slots.length,
    0
  );
  for (const priest_name of [null, 'A']) {
    assert.equal(
      (
        await computeAvailableSlots(
          database({ blackouts: [{ date: '2030-01-06', end_date: '2030-01-08', priest_name }] }),
          options
        )
      ).slots.length,
      0
    );
  }
  assert.equal(
    (
      await computeAvailableSlots(
        database({ blackouts: [{ date: '2030-01-07', end_date: null, priest_name: 'B' }] }),
        options
      )
    ).slots.length,
    5
  );
  const bookings = [
    { confirmed_date: '2030-01-07', confirmed_time: '10:00 AM', clergy_assigned: 'A' },
    { confirmed_date: '2030-01-07', confirmed_time: '11:00', clergy_assigned: 'B' },
    { confirmed_date: '2030-01-07', confirmed_time: 'after lunch', clergy_assigned: 'A' },
  ];
  assert.deepEqual(
    (await computeAvailableSlots(database({ bookings }), options)).slots.map((s) => s.time),
    ['09:30', '10:30', '11:00', '11:30']
  );
  const check = { parishId: 'test-parish', date: '2030-01-07', time: '10:00', priestName: 'A' };
  assert.equal(await isSlotStillOpen(database({ bookings }), check), false);
  assert.equal(await isSlotStillOpen(database({ bookings }), { ...check, priestName: 'B' }), true);
  assert.equal(await isSlotStillOpen({}, check), true);
  assert.equal(await isSlotStillOpen(database({ fail: 'sacrament_requests' }), check), true);
  assert.equal((await computeAvailableSlots(database({ fail: 'sacrament_requests' }), options)).slots.length, 5);
} finally {
  globalThis.Date = RealDate;
}
console.log('Sacrament availability regressions passed.');
