#!/usr/bin/env node
// scripts/migration-integrity.mjs
//
// Package 0.75A (CI Safety) — a safe, non-destructive pre-flight check that
// runs in CI before any production D1 migration is applied. This does NOT
// connect to Cloudflare, does NOT open a database, and does NOT apply any
// migration. It only inspects the migrations/ directory on disk.
//
// What this checks (deliberately conservative, per Package 0.75A's "do not
// invent brittle validation" instruction):
//   1. Every file in migrations/ is non-empty and readable as UTF-8 text.
//   2. Every migration filename ends in .sql (Wrangler's D1 migrations
//      tooling only picks up .sql files; a non-.sql file sitting in this
//      directory would silently never be applied, which is worth flagging).
//   3. The wrangler.toml database name referenced by the deploy workflow
//      ("agapay-production") actually matches wrangler.toml's configured
//      database_name, so a copy-paste/typo mismatch between the workflow
//      and the Wrangler config fails loudly in CI instead of silently
//      targeting the wrong (or no) database at deploy time.
//   4. Duplicate numeric filename prefixes fail unless the exact set of
//      filenames is grandfathered below. The allowlist preserves migrations
//      already recorded in production's D1 ledger while ensuring a new file
//      cannot silently reuse any existing prefix.
//
// This script intentionally does NOT attempt full SQL syntax validation.
// A subset of migrations are already exercised against a real SQLite
// database by scripts/tax-exemption-tests.mjs and
// scripts/settlement-profiles-tests.mjs (via Node's built-in node:sqlite) —
// that is real, meaningful validation for the files it covers, and this
// script does not try to duplicate or replace it. Full migration-by-
// migration local D1 validation (applying every migration file, in order,
// against a throwaway local D1/SQLite database) is a larger piece of work
// deferred to Package 0.75G (Staging and Local Development) per the
// Package 0.75A brief — see docs/accounting/03-package-0.75a-ci-safety-report.md,
// section 6, for that deferral and its rationale.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const migrationsDir = path.join(repoRoot, "migrations");
const wranglerTomlPath = path.join(repoRoot, "wrangler.toml");

// D1 records applied migrations by filename. These exact collisions are
// already present in production and therefore cannot be safely renamed.
// Matching exact filename sets (rather than allowing a prefix wholesale)
// ensures that any additional reuse of one of these prefixes still fails.
const ALLOWED_DUPLICATE_PREFIXES = new Map([
  ["0003", new Set(["0003_agapay_learn_phase1.sql", "0003_stewardship.sql"])],
  ["0004", new Set(["0004_agapay_learn_phase2.sql", "0004_household_pledges_pk.sql", "0004_stewardship_seed.sql"])],
  ["0005", new Set(["0005_agapay_learn_phase3.sql", "0005_donor_notifications.sql", "0005_stewardship_annual_meetings.sql"])],
  ["0006", new Set(["0006_agapay_learn_high_school_records.sql", "0006_st_fiacre_demo.sql"])],
  ["0041", new Set(["0041_stewardship_accounting_import.sql", "0041_stripe_nonprofit_volume_tracking.sql"])],
  ["0042", new Set(["0042_accounting_migration_import_capability.sql", "0042_nonprofit_pricing_applications.sql"])]
]);

let failed = false;
function fail(message) {
  failed = true;
  console.error(`FAIL - ${message}`);
}
function warn(message) {
  console.warn(`WARN - ${message}`);
}
function pass(message) {
  console.log(`PASS - ${message}`);
}

// --- 1 & 2: every migration file is non-empty, readable, and .sql ---
const entries = readdirSync(migrationsDir);
if (!entries.length) {
  fail(`migrations/ directory is empty (expected at least one .sql file)`);
}

const sqlFiles = [];
for (const entry of entries) {
  const fullPath = path.join(migrationsDir, entry);
  const stat = statSync(fullPath);
  if (!stat.isFile()) continue;

  if (!entry.endsWith(".sql")) {
    warn(`migrations/${entry} does not end in .sql -- Wrangler's D1 migration tooling will not pick this file up. If this is intentional (e.g. a README), ignore this warning.`);
    continue;
  }

  sqlFiles.push(entry);

  let content;
  try {
    content = readFileSync(fullPath, "utf8");
  } catch (error) {
    fail(`migrations/${entry} could not be read as UTF-8 text: ${error.message}`);
    continue;
  }

  if (!content.trim().length) {
    fail(`migrations/${entry} is empty`);
  }
}

if (sqlFiles.length) {
  pass(`${sqlFiles.length} migration file(s) found in migrations/, all non-empty and UTF-8 readable`);
}

// --- 3: workflow target database name matches wrangler.toml ---
const deployWorkflowPath = path.join(repoRoot, ".github", "workflows", "deploy.yml");
let wranglerToml = "";
try {
  wranglerToml = readFileSync(wranglerTomlPath, "utf8");
} catch (error) {
  fail(`Could not read wrangler.toml: ${error.message}`);
}

const databaseNameMatch = wranglerToml.match(/database_name\s*=\s*"([^"]+)"/);
if (!databaseNameMatch) {
  fail(`wrangler.toml does not declare a database_name for the [[d1_databases]] binding -- cannot verify the deploy workflow targets the correct database`);
} else {
  const configuredDatabaseName = databaseNameMatch[1];
  let deployWorkflow = "";
  try {
    deployWorkflow = readFileSync(deployWorkflowPath, "utf8");
  } catch (error) {
    fail(`Could not read .github/workflows/deploy.yml: ${error.message}`);
  }
  if (deployWorkflow && !deployWorkflow.includes(`migrations apply ${configuredDatabaseName}`)) {
    fail(
      `.github/workflows/deploy.yml's "d1 migrations apply" command does not reference wrangler.toml's configured database_name ("${configuredDatabaseName}"). ` +
      `This would mean CI is silently applying migrations to the wrong database, or to no database at all.`
    );
  } else if (deployWorkflow) {
    pass(`Deploy workflow's migration target matches wrangler.toml's database_name ("${configuredDatabaseName}")`);
  }
}

// --- 4: duplicate numeric prefixes (exact production-history allowlist) ---
const prefixCounts = new Map();
for (const file of sqlFiles) {
  const match = file.match(/^(\d+)_/);
  if (!match) continue; // files without a numeric prefix (e.g. legacy one-off migration files) are not evaluated here
  const prefix = match[1];
  prefixCounts.set(prefix, [...(prefixCounts.get(prefix) || []), file]);
}
let duplicatesFound = false;
for (const [prefix, files] of prefixCounts) {
  if (files.length > 1) {
    duplicatesFound = true;
    const allowedFiles = ALLOWED_DUPLICATE_PREFIXES.get(prefix);
    const actualFiles = new Set(files);
    const exactAllowedSet = allowedFiles
      && allowedFiles.size === actualFiles.size
      && [...allowedFiles].every((file) => actualFiles.has(file));
    if (exactAllowedSet) {
      warn(`Numeric prefix "${prefix}" is used by the grandfathered production migration set: ${files.join(", ")}.`);
    } else {
      fail(
        `Numeric prefix "${prefix}" is used by ${files.length} migration files: ${files.join(", ")}. ` +
        "Only exact filename sets already recorded in production may share a prefix; assign a new unused prefix."
      );
    }
  }
}
if (!duplicatesFound) {
  pass("No duplicate numeric migration-filename prefixes found");
}

if (failed) {
  console.error("\nMigration integrity check FAILED. See FAIL lines above.");
  process.exit(1);
} else {
  console.log("\nMigration integrity check passed (see WARN lines above, if any, for non-blocking notes).");
}
