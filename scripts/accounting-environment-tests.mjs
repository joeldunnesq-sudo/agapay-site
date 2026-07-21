// scripts/accounting-environment-tests.mjs
//
// Package 0.75G tests for environment/config/storage abstractions and
// migration safety. No Cloudflare resources are touched.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACCOUNTING_ENVIRONMENTS,
  normalizeAccountingEnvironment,
  detectAccountingEnvironment,
  createAccountingConfiguration,
  summarizeAccountingConfiguration,
  validateAccountingConfiguration,
  createAccountingStorageRegistry,
  validateAccountingStorageRegistry,
  resolveAccountingDatabase,
  createMigrationSafetyPlan,
  AccountingConfigurationError,
  AccountingDatabaseError
} from "../src/accounting/index.js";

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

await test("environment catalog contains local, test, staging, and production", async () => {
  assert.deepEqual(ACCOUNTING_ENVIRONMENTS, ["local", "test", "staging", "production"]);
});

await test("environment detection normalizes aliases and fails closed on unknown names", async () => {
  assert.equal(normalizeAccountingEnvironment("dev"), "local");
  assert.equal(normalizeAccountingEnvironment("preview"), "staging");
  assert.equal(normalizeAccountingEnvironment("prod"), "production");
  assert.throws(() => normalizeAccountingEnvironment("sandbox-but-which-one"), AccountingConfigurationError);
});

await test("configuration provider centralizes raw environment access", async () => {
  const config = createAccountingConfiguration({
    AGAPAY_ENVIRONMENT: "staging",
    AGAPAY_APP_URL: "https://staging.example.test"
  });
  assert.equal(config.environment, "staging");
  assert.equal(config.appUrl, "https://staging.example.test");
  assert.equal(config.centralDatabase.name, "agapay-staging");
  assert.equal(config.safeForDevelopment, true);
  assert.equal(summarizeAccountingConfiguration(config).workerName, "agapay-site-staging");
});

await test("production configuration is explicit and can be rejected for development-only operations", async () => {
  const config = createAccountingConfiguration({ AGAPAY_ENVIRONMENT: "production" });
  assert.equal(config.production, true);
  assert.throws(
    () => validateAccountingConfiguration(config, { allowProduction: false }),
    AccountingConfigurationError
  );
});

await test("database resolution is environment-aware without exposing raw database identifiers", async () => {
  const staging = await resolveAccountingDatabase({ AGAPAY_ENVIRONMENT: "staging" }, { parishId: "parish_env" });
  assert.equal(staging.environment, "staging");
  assert.equal(staging.registryRecord.registryName, "accounting-databases-staging");
  assert.equal("bindingName" in staging, false);
  assert.equal("databaseId" in staging, false);

  const production = await resolveAccountingDatabase({ AGAPAY_ENVIRONMENT: "production" }, { parishId: "parish_env" });
  assert.equal(production.registryRecord.registryName, "accounting-databases-production");
});

await test("storage abstraction reports existing and future bindings without direct Cloudflare calls", async () => {
  const env = { AGAPAY_ENVIRONMENT: "test", AGAPAY_DB: { prepare() {} }, TAX_EXEMPTION_DOCS: {}, ACCOUNTING_BACKUPS: {}, AGAPAY_REGISTRATIONS: {} };
  const config = createAccountingConfiguration(env);
  const registry = createAccountingStorageRegistry(env, config);
  assert.equal(registry.centralD1.present, true);
  assert.equal(registry.r2.taxExemptionDocs.present, true);
  assert.equal(registry.r2.accountingDocuments.implemented, false);
  assert.equal(registry.r2.accountingBackups.present, true);
  assert.equal(registry.r2.accountingBackups.implemented, true);
  assert.equal(registry.kv.nonAccountingRegistrations.present, true);
  assert.equal(validateAccountingStorageRegistry(registry), registry);
  assert.throws(
    () => validateAccountingStorageRegistry(registry, { requireAccountingD1: true }),
    AccountingConfigurationError
  );
});

await test("storage validation fails early when central D1 is missing", async () => {
  const config = createAccountingConfiguration({ AGAPAY_ENVIRONMENT: "test" });
  const registry = createAccountingStorageRegistry({}, config);
  assert.throws(() => validateAccountingStorageRegistry(registry), AccountingConfigurationError);
});

await test("migration safety refuses production without explicit confirmation", async () => {
  assert.throws(
    () => createMigrationSafetyPlan({ environment: "production", databaseName: "agapay-production", remote: true }),
    AccountingConfigurationError
  );
  const plan = createMigrationSafetyPlan({
    environment: "production",
    databaseName: "agapay-production",
    remote: true,
    confirmProduction: true
  });
  assert.equal(plan.command, "npx wrangler d1 migrations apply agapay-production --remote");
  assert.equal(plan.executeAutomatically, false);
});

await test("migration safety blocks non-production targeting production database", async () => {
  assert.throws(
    () => createMigrationSafetyPlan({ environment: "staging", databaseName: "agapay-production", remote: true }),
    AccountingConfigurationError
  );
  const staging = createMigrationSafetyPlan({ environment: "staging", databaseName: "agapay-staging", remote: true });
  assert.equal(staging.productionTarget, false);
  assert.equal(staging.command, "npx wrangler d1 migrations apply agapay-staging --remote");
});

await test("wrangler configuration declares production environment marker without staging resource fiction", async () => {
  const wrangler = readFileSync("wrangler.toml", "utf8");
  assert.match(wrangler, /AGAPAY_ENVIRONMENT\s*=\s*"production"/);
  assert.doesNotMatch(wrangler, /agapay-staging-database-id-placeholder/);
});

await test("local development example keeps secrets out and marks local environment", async () => {
  const sample = readFileSync(".dev.vars.example", "utf8");
  assert.match(sample, /AGAPAY_ENVIRONMENT=local/);
  assert.doesNotMatch(sample, /STRIPE_SECRET_KEY=sk_live/);
});

await test("database resolution rejects unsafe resolver output shape", async () => {
  const { assertAccountingDatabaseResolution } = await import("../src/accounting/index.js");
  assert.throws(
    () => assertAccountingDatabaseResolution({ status: "active", parishId: "p", databaseId: "not-safe" }),
    AccountingDatabaseError
  );
});

if (process.exitCode) {
  console.error(`${passed} accounting environment test(s) passed before failure.`);
  process.exit(process.exitCode);
}

console.log(`\n${passed} test(s) passed.`);
console.log("All accounting environment tests passed.");
