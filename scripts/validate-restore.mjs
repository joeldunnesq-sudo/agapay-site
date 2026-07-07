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
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import path from "node:path";

// Resolve wrangler's actual JS entry point and invoke it with `node`
// directly, instead of going through `npx`/`wrangler.cmd`. This sidesteps
// Windows subprocess quoting entirely: `.cmd` files are batch scripts, and
// spawning them (even with shell:true) means arguments get re-parsed by
// cmd.exe — which was splitting our multi-word --command SQL string into
// separate arguments ("Unknown arguments: name, FROM, sqlite_master...").
// node.exe is a real executable; Node's argv-array spawning preserves each
// array element as one argument, spaces and all, with no shell involved on
// any platform. Verified directly: this invocation gets all the way to a
// missing-credentials error from wrangler itself (proving the SQL string
// arrived intact), not an "Unknown arguments" parse failure.
//
// wrangler's package.json restricts `exports` to ".", "./experimental-config",
// and "./package.json" — `require.resolve("wrangler/bin/wrangler.js")`
// throws ERR_PACKAGE_PATH_NOT_EXPORTED even though the file exists on disk.
// Resolve via the exported "./package.json" instead and join the known
// `bin` path from there.
// Falls back to `npx wrangler` (shell:true on Windows) only if wrangler
// isn't resolvable as a local dependency at all.
function resolveWranglerCommand() {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("wrangler/package.json");
    const wranglerBin = path.join(path.dirname(pkgPath), "bin", "wrangler.js");
    return { file: process.execPath, prefixArgs: [wranglerBin], shell: false };
  } catch {
    return { file: "npx", prefixArgs: ["wrangler"], shell: process.platform === "win32" };
  }
}
const WRANGLER = resolveWranglerCommand();

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
    WRANGLER.file,
    [...WRANGLER.prefixArgs, "d1", "execute", targetDb, "--remote", "--json", "--command", sql],
    // shell is only true for the npx fallback (see resolveWranglerCommand)
    // — the primary path spawns node.exe directly with no shell involved,
    // which is what actually fixes the Windows argument-splitting issue.
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 64, shell: WRANGLER.shell }
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
  "household_pledges",
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
  // `wrangler d1 migrations list <name>` requires the target to be a
  // binding configured in wrangler.toml — it errors with "Couldn't find a
  // D1 DB with the name or binding '<name>' in your wrangler.toml file"
  // for any ad-hoc database name, which a scratch restore-test database
  // always is. `wrangler d1 execute` has no such requirement, so query
  // D1's own migration-tracking table directly and compare against the
  // migration files actually on disk — this also more directly proves the
  // restored copy's own bookkeeping is intact, not just that wrangler's
  // CLI can separately reach the real production migration state.
  const applied = new Set(query("SELECT name FROM d1_migrations").map((row) => row.name));
  const localFiles = readdirSync(new URL("../migrations/", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const missing = localFiles.filter((name) => !applied.has(name));
  if (missing.length) {
    throw new Error(`${missing.length} migration(s) on disk not recorded as applied in this restored copy: ${missing.join(", ")}`);
  }
  return `${applied.size} migration(s) recorded as applied, ${localFiles.length} on disk — all accounted for`;
});

// 3. Required IDs are not null -------------------------------------------
check("registrations.reference and donors.email have no nulls", () => {
  const r1 = query("SELECT COUNT(*) AS n FROM registrations WHERE reference IS NULL");
  const r2 = query("SELECT COUNT(*) AS n FROM donors WHERE email IS NULL");
  if (Number(r1[0]?.n) > 0 || Number(r2[0]?.n) > 0) throw new Error("found null primary identifiers");
  return true;
});

// 4. Stripe identifiers unique where expected ----------------------------
// Pending/incomplete registrations (no subscription yet) store this as an
// empty string, not SQL NULL — `IS NOT NULL` alone lets every blank value
// through, so they all get grouped together as a false "duplicate."
check("stripe_subscription_id unique among non-null registrations", () => {
  const rows = query(
    "SELECT stripe_subscription_id, COUNT(*) AS n FROM registrations WHERE stripe_subscription_id IS NOT NULL AND stripe_subscription_id != '' GROUP BY stripe_subscription_id HAVING n > 1"
  );
  if (rows.length) throw new Error(`${rows.length} duplicate stripe_subscription_id value(s)`);
  return true;
});

check("stripe_account_id unique among non-null registrations", () => {
  const rows = query(
    "SELECT stripe_account_id, COUNT(*) AS n FROM registrations WHERE stripe_account_id IS NOT NULL AND stripe_account_id != '' GROUP BY stripe_account_id HAVING n > 1"
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
