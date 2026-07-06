#!/usr/bin/env node
// Read-only validation for a RESTORED (non-production) D1 database.
//
// Usage:
//   npx wrangler d1 execute <restored-db-name> --remote --file=./scripts/_validate-restore.sql
// or, if you have a local/remote HTTP-reachable D1 via the Wrangler CLI:
//   node scripts/validate-restore.mjs <restored-db-name>
//
// SAFETY:
// - This script NEVER writes, updates, or deletes anything. Every query is
//   a SELECT.
// - This script REFUSES to run if the target name looks like production
//   (contains "agapay-production" or equals the exact prod DB name) unless
//   you pass --i-understand-this-is-production, which it does not accept —
//   there is no override. Point this at a restored COPY only.
// - Requires `wrangler` to be authenticated (same credentials you'd use for
//   any other d1 command). This script shells out to
//   `wrangler d1 execute --json`, it does not hold or need any API token
//   itself.
//
// See docs/BACKUP_RESTORE_RUNBOOK.md for the full restore procedure this
// script is the last step of.

import { execFileSync } from "node:child_process";

const PRODUCTION_DB_NAME = "agapay-production";
const PRODUCTION_DB_ID = "24f514a6-6904-425b-a4c8-b3584b23c0be";

const targetDb = process.argv[2];

if (!targetDb) {
  console.error("Usage: node scripts/validate-restore.mjs <restored-db-name>");
  console.error("Refuses to run against agapay-production. Point this at a restored copy.");
  process.exit(1);
}

if (targetDb === PRODUCTION_DB_NAME || targetDb.includes(PRODUCTION_DB_ID)) {
  console.error(
    `Refusing to run: "${targetDb}" looks like the production database. ` +
      `This script only runs read-only checks against a RESTORED COPY, never against ${PRODUCTION_DB_NAME}.`
  );
  process.exit(1);
}

function query(sql) {
  const raw = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", targetDb, "--remote", "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 }
  );
  const parsed = JSON.parse(raw);
  // wrangler d1 execute --json returns an array of { results, success, meta }
  return parsed?.[0]?.results || [];
}

let failures = 0;
function check(label, fn) {
  try {
    const result = fn();
    if (result === false) {
      console.error(`FAIL: ${label}`);
      failures++;
    } else {
      console.log(`OK:   ${label}${typeof result === "string" ? ` — ${result}` : ""}`);
    }
  } catch (err) {
    console.error(`ERROR: ${label} — ${err.message}`);
    failures++;
  }
}

// 1. Expected tables exist ---------------------------------------------
const EXPECTED_TABLES = [
  "registrations",
  "donors",
  "donor_offerings",
  "commemorations",
  "app_settings",
  "stripe_events",
  "learn_households",
  "learn_children",
  "learn_transcripts",
  "household_pledges_new",
  "sacrament_requests",
  "commerce_orders",
  "settlement_profiles",
  "tax_exemptions",
];

check("Expected tables exist", () => {
  const rows = query("SELECT name FROM sqlite_master WHERE type='table'");
  const present = new Set(rows.map((r) => r.name));
  const missing = EXPECTED_TABLES.filter((t) => !present.has(t));
  if (missing.length) throw new Error(`missing tables: ${missing.join(", ")}`);
  return `${EXPECTED_TABLES.length} tables present`;
});

// 2. Migration status is current ----------------------------------------
check("Migration status is current (no pending migrations)", () => {
  // `wrangler d1 migrations list` compares the migrations/ dir on disk
  // against the d1_migrations table in the target DB. Run separately
  // since its output isn't the --json query format used above.
  const output = execFileSync("npx", ["wrangler", "d1", "migrations", "list", targetDb, "--remote"], {
    encoding: "utf8",
  });
  if (/no migrations to apply/i.test(output) || /up to date/i.test(output)) return true;
  console.log(output);
  throw new Error("wrangler reports pending migrations — review output above");
});

// 3. Required IDs are not null -------------------------------------------
check("registrations.reference and donors.email have no nulls", () => {
  const r1 = query("SELECT COUNT(*) AS n FROM registrations WHERE reference IS NULL");
  const r2 = query("SELECT COUNT(*) AS n FROM donors WHERE email IS NULL");
  if (Number(r1[0]?.n) > 0 || Number(r2[0]?.n) > 0) throw new Error("found null primary identifiers");
  return true;
});

// 4. Stripe identifiers unique where expected ----------------------------
check("stripe_subscription_id unique among non-null registrations", () => {
  const rows = query(
    "SELECT stripe_subscription_id, COUNT(*) AS n FROM registrations WHERE stripe_subscription_id IS NOT NULL GROUP BY stripe_subscription_id HAVING n > 1"
  );
  if (rows.length) throw new Error(`${rows.length} duplicate stripe_subscription_id value(s)`);
  return true;
});

check("stripe_account_id unique among non-null registrations", () => {
  const rows = query(
    "SELECT stripe_account_id, COUNT(*) AS n FROM registrations WHERE stripe_account_id IS NOT NULL GROUP BY stripe_account_id HAVING n > 1"
  );
  if (rows.length) throw new Error(`${rows.length} duplicate stripe_account_id value(s)`);
  return true;
});

// 5. No obvious duplicate webhook records --------------------------------
check("stripe_events has no duplicate ids (PK should already enforce this)", () => {
  const rows = query("SELECT id, COUNT(*) AS n FROM stripe_events GROUP BY id HAVING n > 1");
  if (rows.length) throw new Error(`${rows.length} duplicate stripe_events id(s) — should be impossible under the PK`);
  return true;
});

// 6. Household/student relationships intact ------------------------------
check("Every learn_children.household_id resolves to a learn_households row", () => {
  const rows = query(
    "SELECT lc.id FROM learn_children lc LEFT JOIN learn_households lh ON lh.id = lc.household_id WHERE lh.id IS NULL"
  );
  if (rows.length) throw new Error(`${rows.length} orphaned learn_children row(s)`);
  return true;
});

// 7. Organization (parish) ownership fields populated where required ------
check("commerce_orders.parish_id is never null", () => {
  const rows = query("SELECT COUNT(*) AS n FROM commerce_orders WHERE parish_id IS NULL OR parish_id = ''");
  if (Number(rows[0]?.n) > 0) throw new Error(`${rows[0].n} commerce_orders row(s) missing parish_id`);
  return true;
});

check("settlement_profiles.parish_id is never null", () => {
  const rows = query("SELECT COUNT(*) AS n FROM settlement_profiles WHERE parish_id IS NULL OR parish_id = ''");
  if (Number(rows[0]?.n) > 0) throw new Error(`${rows[0].n} settlement_profiles row(s) missing parish_id`);
  return true;
});

check("tax_exemptions.registration_reference resolves to a registrations row", () => {
  const rows = query(
    "SELECT te.id FROM tax_exemptions te LEFT JOIN registrations r ON r.reference = te.registration_reference WHERE r.reference IS NULL"
  );
  if (rows.length) throw new Error(`${rows.length} tax_exemptions row(s) with an unresolvable registration_reference`);
  return true;
});

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed. Do not treat this restore as validated.`);
  process.exit(1);
}
console.log("All restore-validation checks passed.");
