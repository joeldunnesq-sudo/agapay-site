// scripts/settlement-profiles-tests.mjs
//
// Exercises the real src/lib/settlement-profiles.js module (no
// reimplementation) against a D1-shaped SQLite database, using node's
// built-in node:sqlite so this runs with zero extra dependencies. The shim
// implements exactly the subset of the D1 client API this codebase's
// d1First/d1All/d1Run helpers call: prepare(sql).bind(...params).first()/
// .all()/.run().
//
// Run directly: node scripts/settlement-profiles-tests.mjs
// (Requires Node >= 22 for node:sqlite -- npm run check enforces this via
// scripts/require-node-22.mjs before reaching this script.)

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  ensureDefaultGivingProfile,
  ensureDefaultCommerceProfile,
  resolveSettlementProfileId,
  listSettlementProfiles,
  createSettlementProfile,
  setProfileActive,
  setDefaultGivingProfile,
  setDefaultCommerceProfile,
  assignModuleProfile,
} from "../src/lib/settlement-profiles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeD1Env(seedFn) {
  const db = new DatabaseSync(":memory:");

  // Minimal prerequisite schema (subset of the real migrations, just enough
  // for settlement-profiles.js and its FKs/lookups to operate against).
  db.exec(`
    CREATE TABLE registrations (
      reference TEXT PRIMARY KEY, parish_id TEXT, status TEXT, parish_name TEXT
    );
    CREATE TABLE parish_stewardship_settings (
      parish_id TEXT PRIMARY KEY, has_stewardship_suite INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE donor_offerings (
      id TEXT PRIMARY KEY, donor_email TEXT NOT NULL, parish_id TEXT,
      checkout_session_id TEXT, payment_intent_id TEXT, stripe_subscription_id TEXT,
      status TEXT, payment_status TEXT,
      created_at TEXT, updated_at TEXT NOT NULL, data TEXT NOT NULL
    );
    CREATE TABLE commerce_orders (
      id TEXT PRIMARY KEY, commerce_module TEXT NOT NULL DEFAULT 'bookstore',
      parish_id TEXT NOT NULL, payment_status TEXT NOT NULL DEFAULT 'pending',
      total_charged_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT, updated_at TEXT
    );
  `);

  // Seed BEFORE the migration runs when a caller wants to test the
  // migration's own backfill logic against pre-existing parishes — mirrors
  // how this migration would actually run against a production database
  // that already has registrations in it.
  if (seedFn) seedFn(db);

  // Real migration content, applied verbatim.
  const migration = readFileSync(
    path.join(__dirname, "..", "migrations", "0010_settlement_profiles.sql"),
    "utf8"
  );
  db.exec(migration);

  function toD1Result(rows) {
    return { results: rows, success: true };
  }

  function wrap(sql) {
    return {
      _params: [],
      bind(...params) { this._params = params; return this; },
      async first() {
        const stmt = db.prepare(sql);
        const row = stmt.get(...this._params);
        return row === undefined ? null : row;
      },
      async all() {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...this._params);
        return toD1Result(rows);
      },
      async run() {
        const stmt = db.prepare(sql);
        const info = stmt.run(...this._params);
        return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
      }
    };
  }

  const AGAPAY_DB = { prepare: (sql) => wrap(sql), _raw: db };
  return { env: { AGAPAY_DB }, db };
}

function seedParish(db, { parishId, verified = true, stewardship = false }) {
  db.prepare(`INSERT INTO registrations (reference, parish_id, status, parish_name) VALUES (?, ?, ?, ?)`)
    .run(`ref_${parishId}`, parishId, verified ? "verified" : "pending", parishId);
  if (stewardship) {
    db.prepare(`INSERT INTO parish_stewardship_settings (parish_id, has_stewardship_suite) VALUES (?, 1)`).run(parishId);
  }
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

await test("migration backfill creates Primary Giving for a verified parish", async () => {
  const { db } = makeD1Env((seedDb) => seedParish(seedDb, { parishId: "st-fiacre" }));
  const row = db.prepare(`SELECT * FROM settlement_profiles WHERE parish_id = 'st-fiacre' AND is_default_giving = 1`).get();
  assert.ok(row, "expected a default giving profile to exist after migration backfill");
  assert.equal(row.name, "Primary Giving");
  assert.equal(row.is_active, 1);
});

await test("migration backfill creates Parish+ Commerce only for stewardship-active parishes", async () => {
  const { db } = makeD1Env((seedDb) => {
    seedParish(seedDb, { parishId: "st-fiacre", stewardship: true });
    seedParish(seedDb, { parishId: "holy-ascension", stewardship: false });
  });
  const withCommerce = db.prepare(`SELECT * FROM settlement_profiles WHERE parish_id = 'st-fiacre' AND is_default_commerce = 1`).get();
  const withoutCommerce = db.prepare(`SELECT * FROM settlement_profiles WHERE parish_id = 'holy-ascension' AND is_default_commerce = 1`).get();
  assert.ok(withCommerce, "expected Parish+ Commerce profile for stewardship-active parish");
  assert.equal(withoutCommerce, undefined, "expected no commerce profile for a parish without Parish+");
});

await test("ensureDefaultGivingProfile is idempotent and self-heals for a brand new parish", async () => {
  const { env, db } = makeD1Env();
  // A parish with NO registrations row at all (simulating "parish created,
  // ensure hook fires before migration backfill would ever see it").
  const first = await ensureDefaultGivingProfile(env, "brand-new-parish");
  const second = await ensureDefaultGivingProfile(env, "brand-new-parish");
  assert.equal(first.id, second.id, "expected the same profile id on repeat calls");
  const count = db.prepare(`SELECT COUNT(*) AS n FROM settlement_profiles WHERE parish_id = 'brand-new-parish'`).get().n;
  assert.equal(count, 1, "expected exactly one giving profile, not a duplicate");
});

await test("donation resolves to the default giving profile", async () => {
  const { env } = makeD1Env();
  const id = await resolveSettlementProfileId(env, "new-parish-a", "giving");
  assert.ok(id, "expected a resolved profile id");
  assert.match(id, /^sp_giving_/);
});

await test("bookstore transaction resolves to the default commerce profile, self-healing if missing", async () => {
  const { env, db } = makeD1Env();
  seedParish(db, { parishId: "st-fiacre" }); // giving only, no stewardship row yet
  const id = await resolveSettlementProfileId(env, "st-fiacre", "bookstore");
  assert.ok(id, "expected a resolved commerce profile id even with no pre-existing commerce profile");
  const row = db.prepare(`SELECT * FROM settlement_profiles WHERE id = ?`).get(id);
  assert.equal(row.profile_type, "bookstore");
  assert.equal(row.is_default_commerce, 1);
});

await test("explicit module assignment overrides the default profile", async () => {
  const { env } = makeD1Env();
  await ensureDefaultGivingProfile(env, "st-fiacre");
  const festival = await createSettlementProfile(env, "st-fiacre", { name: "Festival Fund", profileType: "festival" });
  assert.ok(festival.profile, "expected profile creation to succeed");

  const beforeAssign = await resolveSettlementProfileId(env, "st-fiacre", "giving");
  assert.notEqual(beforeAssign, festival.profile.id, "sanity: giving should not resolve to the new profile yet");

  const assign = await assignModuleProfile(env, "st-fiacre", "giving", festival.profile.id);
  assert.ok(!assign.error, `expected assignment to succeed, got: ${assign.error}`);

  const afterAssign = await resolveSettlementProfileId(env, "st-fiacre", "giving");
  assert.equal(afterAssign, festival.profile.id, "expected giving to now resolve to the explicitly-assigned profile");
});

await test("inactive profiles are never used to resolve a payment", async () => {
  const { env } = makeD1Env();
  const giving = await ensureDefaultGivingProfile(env, "st-fiacre");
  const altResult = await createSettlementProfile(env, "st-fiacre", { name: "Alt Giving", profileType: "general_giving" });
  await assignModuleProfile(env, "st-fiacre", "giving", altResult.profile.id);

  // Deactivate the explicitly-assigned profile.
  const deactivate = await setProfileActive(env, "st-fiacre", altResult.profile.id, false);
  assert.ok(!deactivate.error, `expected deactivation to succeed for a non-default profile, got: ${deactivate.error}`);

  // Resolution must fall through to the (still-active) default giving
  // profile rather than the now-inactive explicit assignment.
  const resolved = await resolveSettlementProfileId(env, "st-fiacre", "giving");
  assert.equal(resolved, giving.id, "expected fallback to the active default when the assigned profile is inactive");
});

await test("cannot deactivate a parish's only active default giving profile", async () => {
  const { env } = makeD1Env();
  const giving = await ensureDefaultGivingProfile(env, "st-fiacre");
  const result = await setProfileActive(env, "st-fiacre", giving.id, false);
  assert.ok(result.error, "expected deactivation to be refused");
  assert.match(result.error, /only active giving revenue stream/i);
});

await test("cannot deactivate a parish's only active default commerce profile", async () => {
  const { env } = makeD1Env();
  const commerce = await ensureDefaultCommerceProfile(env, "st-fiacre");
  const result = await setProfileActive(env, "st-fiacre", commerce.id, false);
  assert.ok(result.error, "expected deactivation to be refused");
  assert.match(result.error, /only active commerce revenue stream/i);
});

await test("deactivating a default is allowed once another default of that kind exists", async () => {
  const { env } = makeD1Env();
  const giving = await ensureDefaultGivingProfile(env, "st-fiacre");
  const altResult = await createSettlementProfile(env, "st-fiacre", { name: "Alt Giving", profileType: "general_giving" });
  await setDefaultGivingProfile(env, "st-fiacre", altResult.profile.id);

  // Now the ORIGINAL giving profile is no longer the default, so it's safe
  // to deactivate it — the parish still has one active default (Alt Giving).
  const result = await setProfileActive(env, "st-fiacre", giving.id, false);
  assert.ok(!result.error, `expected deactivation to succeed, got: ${result.error}`);
});

await test("an inactive profile cannot be made a default", async () => {
  const { env } = makeD1Env();
  await ensureDefaultGivingProfile(env, "st-fiacre");
  const alt = await createSettlementProfile(env, "st-fiacre", { name: "Alt Giving", profileType: "general_giving" });
  await setProfileActive(env, "st-fiacre", alt.profile.id, false);
  const result = await setDefaultGivingProfile(env, "st-fiacre", alt.profile.id);
  assert.ok(result.error, "expected setting an inactive profile as default to be refused");
});

await test("setDefaultGivingProfile clears the previous default (only one default at a time)", async () => {
  const { env, db } = makeD1Env();
  const original = await ensureDefaultGivingProfile(env, "st-fiacre");
  const alt = await createSettlementProfile(env, "st-fiacre", { name: "Alt Giving", profileType: "general_giving" });
  await setDefaultGivingProfile(env, "st-fiacre", alt.profile.id);

  const defaults = db.prepare(`SELECT id FROM settlement_profiles WHERE parish_id = 'st-fiacre' AND is_default_giving = 1`).all();
  assert.equal(defaults.length, 1, "expected exactly one default giving profile");
  assert.equal(defaults[0].id, alt.profile.id);

  const originalRow = db.prepare(`SELECT is_default_giving FROM settlement_profiles WHERE id = ?`).get(original.id);
  assert.equal(originalRow.is_default_giving, 0, "expected the previous default to be cleared");
});

await test("existing parishes with no explicit settlement config keep processing payments unchanged", async () => {
  const { env, db } = makeD1Env();
  seedParish(db, { parishId: "holy-ascension-test" }); // migration backfill runs, nothing else configured
  const givingId = await resolveSettlementProfileId(env, "holy-ascension-test", "giving");
  assert.ok(givingId, "a pre-existing parish must still resolve a giving profile with zero extra setup");
});

await test("listSettlementProfiles reports which modules use each profile (report grouping)", async () => {
  const { env } = makeD1Env();
  await ensureDefaultGivingProfile(env, "st-fiacre");
  await ensureDefaultCommerceProfile(env, "st-fiacre");
  const profiles = await listSettlementProfiles(env, "st-fiacre");
  assert.equal(profiles.length, 2);
  const giving = profiles.find(p => p.isDefaultGiving);
  const commerce = profiles.find(p => p.isDefaultCommerce);
  assert.deepEqual(giving.modules, ["giving"]);
  assert.deepEqual(commerce.modules, ["bookstore"]);
});

await test("a donation and a bookstore sale for the same parish land on different profiles by default", async () => {
  const { env, db } = makeD1Env();
  seedParish(db, { parishId: "st-fiacre", stewardship: true });

  const givingProfileId = await resolveSettlementProfileId(env, "st-fiacre", "giving");
  const commerceProfileId = await resolveSettlementProfileId(env, "st-fiacre", "bookstore");
  assert.notEqual(givingProfileId, commerceProfileId, "giving and bookstore should resolve to different default profiles");

  db.prepare(`INSERT INTO donor_offerings (id, donor_email, parish_id, status, payment_status, settlement_profile_id, updated_at, data) VALUES (?, ?, ?, 'complete', 'paid', ?, ?, '{}')`)
    .run("off_1", "donor@example.com", "st-fiacre", givingProfileId, new Date().toISOString());
  db.prepare(`INSERT INTO commerce_orders (id, commerce_module, parish_id, payment_status, total_charged_cents, settlement_profile_id, created_at, updated_at) VALUES (?, 'bookstore', ?, 'paid', 2500, ?, ?, ?)`)
    .run("order_1", "st-fiacre", commerceProfileId, new Date().toISOString(), new Date().toISOString());

  const givingRows = db.prepare(`SELECT * FROM donor_offerings WHERE settlement_profile_id = ?`).all(givingProfileId);
  const commerceRows = db.prepare(`SELECT * FROM commerce_orders WHERE settlement_profile_id = ?`).all(commerceProfileId);
  assert.equal(givingRows.length, 1);
  assert.equal(commerceRows.length, 1);
});

console.log(`\n${passed} test(s) passed.`);
if (process.exitCode) {
  console.error("Some settlement profile tests FAILED.");
} else {
  console.log("All settlement profile tests passed.");
}
