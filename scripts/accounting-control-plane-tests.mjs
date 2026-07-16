import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  assertAccountingLifecycleTransition,
  listAccountingLifecycleEvents,
  loadAccountingDatabaseForEntity,
  loadAccountingEntityByParish,
  recordProvisioningCompleted,
  registerAccountingEntity,
  resolveAccountingControlPlaneDatabase,
  transitionAccountingEntity,
  updateAccountingSchemaVersion,
  validateAccountingEntityForUse,
  validateAccountingRegistry,
  ValidationError,
  AccountingDatabaseError
} from "../src/accounting/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeD1Env() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(path.join(__dirname, "..", "migrations", "0014_audit_log.sql"), "utf8"));
  db.exec(readFileSync(path.join(__dirname, "..", "migrations", "0021_accounting_control_plane.sql"), "utf8"));

  function wrap(sql) {
    return {
      _params: [],
      bind(...params) { this._params = params; return this; },
      async first() {
        const row = db.prepare(sql).get(...this._params);
        return row === undefined ? null : row;
      },
      async all() {
        return { results: db.prepare(sql).all(...this._params), success: true };
      },
      async run() {
        const info = db.prepare(sql).run(...this._params);
        return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
      }
    };
  }

  return { env: { AGAPAY_DB: { prepare: (sql) => wrap(sql) }, AGAPAY_ACCOUNTING_ENV: "test" }, db };
}

function auditRows(db, action) {
  return db.prepare("SELECT * FROM audit_log WHERE action = ? ORDER BY created_at ASC").all(action);
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

await test("registry creation creates one entity, one database row, one lifecycle row, and one audit row", async () => {
  const { env, db } = makeD1Env();
  const entity = await registerAccountingEntity(env, {
    parishId: "st-phase-1a",
    subscriptionTier: "mission",
    environment: "test",
    databaseIdentifier: "acct_test_st_phase_1a",
    actorUserId: "user_1",
    actorType: "platform_user",
    correlationId: "corr-register"
  });

  assert.equal(entity.parishId, "st-phase-1a");
  assert.equal(entity.entityStatus, "provisioning");
  assert.equal(entity.activationStatus, "inactive");
  const database = await loadAccountingDatabaseForEntity(env, entity.id, "test");
  assert.equal(database.provisioningStatus, "provisioning");
  assert.equal(database.healthStatus, "unknown");

  const events = await listAccountingLifecycleEvents(env, entity.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "accounting.enabled");
  assert.equal(auditRows(db, "accounting.enabled").length, 1);
});

await test("lifecycle state machine allows only explicit transitions", async () => {
  assert.equal(assertAccountingLifecycleTransition("not_enabled", "provisioning"), true);
  assert.equal(assertAccountingLifecycleTransition("provisioning", "provisioned"), true);
  assert.throws(() => assertAccountingLifecycleTransition("not_enabled", "ready"), ValidationError);
});

await test("provisioning completion and schema update move registry to safe ready state", async () => {
  const { env, db } = makeD1Env();
  await registerAccountingEntity(env, { parishId: "st-ready", environment: "test" });
  let entity = await recordProvisioningCompleted(env, { parishId: "st-ready", environment: "test", correlationId: "corr-prov" });
  assert.equal(entity.entityStatus, "provisioned");

  entity = await transitionAccountingEntity(env, { parishId: "st-ready", toState: "migrating" });
  assert.equal(entity.entityStatus, "migrating");
  entity = await transitionAccountingEntity(env, { parishId: "st-ready", toState: "ready" });
  assert.equal(entity.entityStatus, "ready");
  assert.equal(entity.activationStatus, "active");

  const database = await updateAccountingSchemaVersion(env, {
    parishId: "st-ready",
    environment: "test",
    schemaVersion: 1,
    migrationVersion: "phase-1a-control-plane",
    actorUserId: "user_schema"
  });
  assert.equal(database.schemaVersion, 1);
  assert.equal(database.provisioningStatus, "ready");
  assert.equal(database.healthStatus, "healthy");
  assert.equal(auditRows(db, "accounting.schema_updated").length, 1);
});

await test("server-side resolver returns safe metadata and never exposes database identifiers", async () => {
  const { env } = makeD1Env();
  await registerAccountingEntity(env, {
    parishId: "st-resolve",
    environment: "test",
    databaseIdentifier: "acct_secret_physical_identifier"
  });
  await recordProvisioningCompleted(env, { parishId: "st-resolve", environment: "test" });
  await transitionAccountingEntity(env, { parishId: "st-resolve", toState: "migrating" });
  await transitionAccountingEntity(env, { parishId: "st-resolve", toState: "ready" });
  await updateAccountingSchemaVersion(env, {
    parishId: "st-resolve",
    environment: "test",
    schemaVersion: 1,
    migrationVersion: "phase-1a-control-plane"
  });

  const resolved = await resolveAccountingControlPlaneDatabase(env, {
    parishId: "st-resolve",
    authenticatedParishId: "st-resolve",
    environment: "test",
    user: { id: "user_resolver" }
  });
  assert.equal(resolved.status, "active");
  assert.equal(resolved.parishId, "st-resolve");
  assert.equal(resolved.registryRecord.schemaVersion, 1);
  assert.equal("databaseIdentifier" in resolved.registryRecord, false);
  assert.equal(JSON.stringify(resolved).includes("acct_secret_physical_identifier"), false);
});

await test("resolver denies cross-parish access and unknown entities", async () => {
  const { env } = makeD1Env();
  await registerAccountingEntity(env, { parishId: "st-a", environment: "test" });
  await assert.rejects(
    () => resolveAccountingControlPlaneDatabase(env, {
      parishId: "st-a",
      authenticatedParishId: "st-b",
      environment: "test"
    }),
    AccountingDatabaseError
  );
  await assert.rejects(
    () => resolveAccountingControlPlaneDatabase(env, {
      parishId: "missing-parish",
      authenticatedParishId: "missing-parish",
      environment: "test"
    }),
    AccountingDatabaseError
  );
});

await test("suspended and archived entities are rejected as unsafe", async () => {
  const { env } = makeD1Env();
  await registerAccountingEntity(env, { parishId: "st-suspended", environment: "test" });
  await recordProvisioningCompleted(env, { parishId: "st-suspended", environment: "test" });
  await transitionAccountingEntity(env, { parishId: "st-suspended", toState: "migrating" });
  await transitionAccountingEntity(env, { parishId: "st-suspended", toState: "ready" });
  await updateAccountingSchemaVersion(env, {
    parishId: "st-suspended",
    environment: "test",
    schemaVersion: 1,
    migrationVersion: "phase-1a-control-plane"
  });
  await transitionAccountingEntity(env, { parishId: "st-suspended", toState: "suspended" });
  let validation = await validateAccountingRegistry(env, { parishId: "st-suspended", environment: "test" });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.code === "entity_suspended"));

  await transitionAccountingEntity(env, { parishId: "st-suspended", toState: "archived" });
  validation = await validateAccountingRegistry(env, { parishId: "st-suspended", environment: "test" });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.code === "entity_archived"));
});

await test("validation failures are audited", async () => {
  const { env, db } = makeD1Env();
  await registerAccountingEntity(env, { parishId: "st-invalid", environment: "test" });
  db.prepare("UPDATE accounting_entities SET entity_status = 'ready', activation_status = 'active' WHERE parish_id = ?")
    .run("st-invalid");
  const result = await validateAccountingEntityForUse(env, {
    parishId: "st-invalid",
    environment: "test",
    actorUserId: "validator",
    actorType: "platform_user",
    correlationId: "corr-validation"
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "provisioning_mismatch"));
  assert.ok(result.issues.some((issue) => issue.code === "schema_version_missing"));
  const rows = auditRows(db, "accounting.validation_failed");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].organization_id, "st-invalid");
});

await test("migration creates only normalized control-plane tables, not ledger tables", async () => {
  const { db } = makeD1Env();
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
  const tables = rows.map((row) => row.name);
  assert.ok(tables.includes("accounting_entities"));
  assert.ok(tables.includes("accounting_databases"));
  assert.ok(tables.includes("accounting_schema_versions"));
  assert.ok(tables.includes("accounting_lifecycle_events"));
  for (const forbidden of ["ledger_accounts", "journal_entries", "journal_lines", "funds", "accounts_payable"]) {
    assert.equal(tables.includes(forbidden), false);
  }
});

if (process.exitCode) {
  console.error("Some accounting control-plane tests FAILED.");
  process.exit(process.exitCode);
}

console.log(`${passed} test(s) passed.`);
console.log("All accounting control-plane tests passed.");
