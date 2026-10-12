import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import {
  claimEarlyAdopterPricing,
  activateEarlyAdopterPricing,
  releaseEarlyAdopterReservation,
  retireEarlyAdopterPricing,
  EARLY_ADOPTER_RESERVATION_DAYS,
} from '../src/lib/early-adopter-pricing.js';
import { EARLY_ADOPTER_PROGRAM_ID, EARLY_ADOPTER_LIMIT } from '../src/lib/subscriptions.js';
const db = new DatabaseSync(':memory:');
db.exec(await readFile(new URL('../migrations/0102_subscription_early_adopter_slots.sql', import.meta.url), 'utf8'));
const env = {
  AGAPAY_DB: {
    prepare(sql) {
      const statement = db.prepare(sql);
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async first() {
          return statement.get(...args) || null;
        },
        async run() {
          return statement.run(...args);
        },
      };
    },
  },
};
const row = (ref) =>
  db.prepare('SELECT * FROM subscription_early_adopter_slots WHERE registration_reference=?').get(ref);
try {
  assert.equal(EARLY_ADOPTER_RESERVATION_DAYS, 45);
  assert.deepEqual(await claimEarlyAdopterPricing(env, 'standard', { subscriptionPricingProgram: 'standard' }), {
    program: 'standard',
    slot: null,
  });
  assert.equal(row('standard'), undefined);
  const first = await claimEarlyAdopterPricing(env, 'a');
  assert.equal(first.program, EARLY_ADOPTER_PROGRAM_ID);
  assert.equal(first.slot, 1);
  assert.deepEqual(await claimEarlyAdopterPricing(env, 'a'), first);
  await activateEarlyAdopterPricing(env, 'a');
  const activated = row('a').activated_at;
  await activateEarlyAdopterPricing(env, 'a');
  assert.equal(row('a').activated_at, activated);
  await releaseEarlyAdopterReservation(env, 'a');
  assert.equal(row('a').status, 'active', 'release cannot free an active slot');
  await retireEarlyAdopterPricing(env, 'a');
  assert.equal(row('a').status, 'retired');
  assert.equal((await claimEarlyAdopterPricing(env, 'b')).slot, 2);
  await retireEarlyAdopterPricing(env, 'b');
  assert.equal(row('b').status, 'reserved', 'retirement applies only to active slots');
  await releaseEarlyAdopterReservation(env, 'b');
  assert.equal(row('b'), undefined);
  assert.equal((await claimEarlyAdopterPricing(env, 'c')).slot, 2);
  db.prepare(
    "UPDATE subscription_early_adopter_slots SET reserved_at='2000-01-01T00:00:00.000Z' WHERE registration_reference='c'"
  ).run();
  assert.equal((await claimEarlyAdopterPricing(env, 'd')).slot, 2, 'expired reservations are reclaimed in slot order');
  assert.equal(row('c'), undefined);
  db.exec("UPDATE subscription_early_adopter_slots SET status='active' WHERE status='available'");
  assert.deepEqual(await claimEarlyAdopterPricing(env, 'full'), { program: 'standard', slot: null });
} finally {
  db.close();
}
const kv = (registrations) => ({
  AGAPAY_REGISTRATIONS: {
    async list() {
      return { keys: registrations.map((_, i) => ({ name: 'registration-' + i })), list_complete: true };
    },
    async get(key) {
      return JSON.stringify(registrations[Number(key.split('-').at(-1))]);
    },
  },
});
const active = { subscriptionPricingProgram: EARLY_ADOPTER_PROGRAM_ID, subscriptionStatus: 'active' };
const legacy = await claimEarlyAdopterPricing(
  kv([{ ...active, reference: 'existing', earlyAdopterSlot: '7', earlyAdopterReservedAt: '2026-01-01' }]),
  'existing'
);
assert.equal(legacy.slot, 7);
assert.equal(legacy.reservedAt, '2026-01-01');
assert.equal((await claimEarlyAdopterPricing(kv([{ ...active, reference: 'other' }]), 'new')).slot, 2);
assert.deepEqual(
  await claimEarlyAdopterPricing(
    kv(Array.from({ length: EARLY_ADOPTER_LIMIT }, (_, i) => ({ ...active, reference: 'r' + i }))),
    'new'
  ),
  { program: 'standard', slot: null }
);
assert.equal(
  (
    await claimEarlyAdopterPricing(
      kv([
        { ...active, subscriptionStatus: 'cancelled' },
        { ...active, subscriptionStatus: 'pending', earlyAdopterReservedAt: '2000-01-01' },
      ]),
      'new'
    )
  ).slot,
  1
);
assert.equal(
  (
    await claimEarlyAdopterPricing(
      kv([{ subscriptionPricingProgram: 'standard', earlyAdopterActivatedAt: '2026-01-01' }]),
      'new'
    )
  ).slot,
  2,
  'activation evidence retains the legacy claim precedence'
);
const missingTable = {
  AGAPAY_DB: {
    prepare(sql) {
      if (sql.includes('subscription_early_adopter_slots')) throw new Error('missing legacy table');
      return {
        bind() {
          return this;
        },
        async all() {
          return { results: [] };
        },
      };
    },
  },
};
assert.equal((await claimEarlyAdopterPricing(missingTable, 'legacy')).slot, 1);
for (const fn of [activateEarlyAdopterPricing, releaseEarlyAdopterReservation, retireEarlyAdopterPricing]) {
  await fn({}, 'a');
  await fn({}, null);
  await fn(
    {
      AGAPAY_DB: {
        prepare() {
          return {
            bind() {
              return this;
            },
            async run() {
              throw new Error('synthetic write failure');
            },
          };
        },
      },
    },
    'a'
  );
}
console.log(
  'PASS - early-adopter reservation, activation, expiry, release, retirement, exhaustion and legacy fallback'
);
