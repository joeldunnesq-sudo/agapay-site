import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { handleDonorGroups } from "../src/handlers/donor-groups.js";
import { issueDonorSession } from "../src/handlers/donor.js";
import { handleKoinoniaAccess, verifiedHouseholdAccess } from "../src/handlers/koinonia-access.js";
import { handleDonorFeed } from "../src/handlers/parish-communications.js";
import { handleDonorTeaching } from "../src/handlers/parish-teaching.js";
import { handleDonorVideo } from "../src/handlers/parish-video.js";
import { saveDonor } from "../src/lib/core.js";
import {
  HOUSEHOLD_VERIFICATION_REQUIRED_CODE,
  HOUSEHOLD_VERIFICATION_REQUIRED_MESSAGE,
  householdVerificationStatus,
  isHouseholdVerificationCurrent,
} from "../src/lib/household-verification.js";
import { ensurePlatformUser } from "../src/lib/identity.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = (name) => readFileSync(path.join(repoRoot, "migrations", name), "utf8");
const BACKFILL_MIGRATION = "0083_koinonia_household_verification_backfill.sql";
const DAY_MS = 86400000;

function makeEnvironment() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  for (const name of [
    "0001_production_records.sql",
    "0020_platform_identity.sql",
    "0022_directory_canonical_foundation.sql",
    "0023_directory_contact_privacy_publication.sql",
    "0032_directory_phase5b_skills_completion.sql",
  ]) sqlite.exec(migration(name));

  function prepare(sql) {
    return {
      params: [],
      bind(...params) { this.params = params; return this; },
      async first() { return sqlite.prepare(sql).get(...this.params) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...this.params), success: true }; },
      async run() {
        const info = sqlite.prepare(sql).run(...this.params);
        return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
      },
    };
  }

  const AGAPAY_DB = {
    prepare,
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, env: { AGAPAY_DB, DB: AGAPAY_DB, AGAPAY_ENVIRONMENT: "test" } };
}

async function seedMember({ sqlite, env, suffix, approved = true }) {
  const parishId = "st-fiacre";
  const email = `${suffix}@example.org`;
  const user = await ensurePlatformUser(env, { email, displayName: `Member ${suffix}` });
  const personId = `person_${suffix}`;
  const householdId = `household_${suffix}`;
  const timestamp = Date.now();
  sqlite.prepare("INSERT INTO directory_people (id, created_by_parish_id, preferred_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(personId, parishId, `Member ${suffix}`, timestamp, timestamp);
  sqlite.prepare("INSERT INTO directory_households (id, parish_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(householdId, parishId, `Household ${suffix}`, timestamp, timestamp);
  sqlite.prepare("INSERT INTO directory_household_members (id, household_id, person_id, relationship, created_at, updated_at) VALUES (?, ?, ?, 'head', ?, ?)")
    .run(`member_${suffix}`, householdId, personId, timestamp, timestamp);
  sqlite.prepare("INSERT INTO directory_person_links (id, person_id, link_type, external_id, created_at, updated_at) VALUES (?, ?, 'platform_user', ?, ?, ?)")
    .run(`link_${suffix}`, personId, user.id, timestamp, timestamp);
  if (approved) {
    sqlite.prepare(`INSERT INTO directory_publication_profiles
      (id, parish_id, owner_type, owner_id, status, approval_status, approved_by_user_id, approved_at, active, created_at, updated_at)
      VALUES (?, ?, 'household', ?, 'approved', 'approved', 'seed-admin', ?, 1, ?, ?)`)
      .run(`publication_${suffix}`, parishId, householdId, timestamp, timestamp, timestamp);
  }
  const donor = {
    email,
    donorName: `Member ${suffix}`,
    defaultParishId: parishId,
    emailVerifiedAt: new Date(timestamp).toISOString(),
    createdAt: new Date(timestamp).toISOString(),
    updatedAt: new Date(timestamp).toISOString(),
  };
  await saveDonor(env, donor);
  const session = await issueDonorSession(env, donor);
  const request = (pathname) => new Request(`https://agapay.test${pathname}`, {
    headers: {
      Authorization: `Bearer ${session.token}`,
      "X-AGAPAY-Donor-Email": email,
    },
  });
  return { parishId, householdId, personId, request };
}

function setVerification(sqlite, householdId, { status = "current", dueAt = Date.now() + DAY_MS } = {}) {
  const timestamp = Date.now();
  sqlite.prepare(`INSERT INTO directory_household_verifications
    (household_id, parish_id, verification_status, verification_due_at, last_verified_at,
     verification_started_at, verified_by_user_id, verification_policy_version, created_at, updated_at)
    VALUES (?, 'st-fiacre', ?, ?, ?, ?, 'test', 'test-v1', ?, ?)
    ON CONFLICT(household_id) DO UPDATE SET verification_status = excluded.verification_status,
      verification_due_at = excluded.verification_due_at, updated_at = excluded.updated_at`)
    .run(householdId, status, dueAt, timestamp, timestamp, timestamp, timestamp);
}

async function assertVerificationDenial(response, label) {
  assert.equal(response.status, 403, `${label} must return 403, not 401`);
  const body = await response.json();
  assert.equal(body.code, HOUSEHOLD_VERIFICATION_REQUIRED_CODE, `${label} must expose a distinct verification code`);
  assert.equal(body.error, HOUSEHOLD_VERIFICATION_REQUIRED_MESSAGE, `${label} must use the shared parish-office message`);
}

assert.equal(householdVerificationStatus(null, 1000), "due");
assert.equal(householdVerificationStatus({ verification_status: "current", verification_due_at: 999 }, 1000), "overdue");
assert.equal(householdVerificationStatus({ verification_status: "current", verification_due_at: 1001 }, 1000), "current");
assert.equal(householdVerificationStatus({ verification_status: "current", verification_due_at: "invalid" }, 1000), "overdue");
assert.equal(isHouseholdVerificationCurrent({ verification_status: "due", verification_due_at: 2000 }, 1000), false);

const { sqlite, env } = makeEnvironment();
sqlite.prepare(`INSERT INTO directory_parish_settings
  (parish_id, reconfirmation_interval_days, household_verification_interval_days, created_at, updated_at)
  VALUES ('st-fiacre', 60, 90, 1, 1)`).run();
const legacy = await seedMember({ sqlite, env, suffix: "legacy" });
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_household_verifications").get().count, 0,
  "the legacy fixture must match production: approved household, no verification row");

const beforeBackfill = Date.now();
sqlite.exec(migration(BACKFILL_MIGRATION));
const afterBackfill = Date.now();
const backfilled = sqlite.prepare("SELECT * FROM directory_household_verifications WHERE household_id = ?").get(legacy.householdId);
assert.equal(backfilled.verification_status, "current", "backfill must keep existing approved households online");
assert.equal(backfilled.verification_policy_version, "koinonia-gate-backfill-v1");
assert.ok(backfilled.verification_due_at >= beforeBackfill + (90 * DAY_MS) - 1000);
assert.ok(backfilled.verification_due_at <= afterBackfill + (90 * DAY_MS));
sqlite.exec(migration(BACKFILL_MIGRATION));
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_household_verifications WHERE household_id = ?").get(legacy.householdId).count, 1,
  "backfill must be idempotent");

const legacyAccess = await handleKoinoniaAccess(legacy.request("/api/donor/koinonia-access"), env);
assert.equal(legacyAccess.status, 200, "an approved pre-deploy household must retain Koinonia access after backfill");
assert.equal((await legacyAccess.json()).verificationStatus, "current");

setVerification(sqlite, legacy.householdId, { status: "current", dueAt: Date.now() + DAY_MS });
const future = await verifiedHouseholdAccess(legacy.request("/api/donor/koinonia-access"), env);
assert.equal(future.response, null, "a current future-due verification must be allowed");
assert.equal(future.context.householdId, legacy.householdId);

setVerification(sqlite, legacy.householdId, { status: "current", dueAt: Date.now() - DAY_MS });
for (const [label, response] of [
  ["Feed", await handleDonorFeed(legacy.request("/api/donor/feed"), env)],
  ["Teaching/Audio", await handleDonorTeaching(legacy.request("/api/donor/teaching"), env)],
  ["Groups", await handleDonorGroups(legacy.request("/api/donor/groups"), env)],
  ["Media/Video", await handleDonorVideo(legacy.request("/api/donor/videos"), env)],
]) await assertVerificationDenial(response, label);

const missing = await seedMember({ sqlite, env, suffix: "post-backfill-missing" });
assert.equal(sqlite.prepare("SELECT household_id FROM directory_household_verifications WHERE household_id = ?").get(missing.householdId), undefined);
await assertVerificationDenial(
  await handleKoinoniaAccess(missing.request("/api/donor/koinonia-access"), env),
  "A genuine post-backfill missing row",
);

setVerification(sqlite, missing.householdId, { status: "due", dueAt: Date.now() + DAY_MS });
await assertVerificationDenial(
  await handleKoinoniaAccess(missing.request("/api/donor/koinonia-access"), env),
  "A non-current verification",
);

const [workerSource, feedSource, teachingSource, groupsSource, videoSource, landingSource, skillsSource] = await Promise.all([
  readFile(new URL("../src/worker.js", import.meta.url), "utf8"),
  readFile(new URL("../src/handlers/parish-communications.js", import.meta.url), "utf8"),
  readFile(new URL("../src/handlers/parish-teaching.js", import.meta.url), "utf8"),
  readFile(new URL("../src/handlers/donor-groups.js", import.meta.url), "utf8"),
  readFile(new URL("../src/handlers/parish-video.js", import.meta.url), "utf8"),
  readFile(new URL("../public/myagapay/parish-life.js", import.meta.url), "utf8"),
  readFile(new URL("../src/directory/skills-service.js", import.meta.url), "utf8"),
]);
for (const [label, source] of [["Feed", feedSource], ["Teaching", teachingSource], ["Groups", groupsSource], ["Video", videoSource]]) {
  assert.match(source, /verifiedHouseholdAccess\(request, env\)/, `${label} must call the shared gate`);
}
assert.match(workerSource, /\/api\/donor\/koinonia-access[\s\S]*handleKoinoniaAccess/);
assert.match(landingSource, /fetch\("\/api\/donor\/koinonia-access"[\s\S]*household_verification_required/,
  "the landing page must render verification denial as a distinct state");
assert.match(skillsSource, /householdVerificationStatus\(row, timestamp\)/,
  "staff verification status and Koinonia enforcement must share one overdue definition");

console.log("PASS - household verification backfill preserves legacy access and every Koinonia entry point fails closed with a distinct 403");
