// scripts/accounting-gateway-tests.mjs
//
// Package 0.75E tests for the accounting-domain boundary. These tests do
// not create accounting tables, journal rows, posting logic, or Cloudflare
// resources. They prove future accounting work has one gateway-shaped door.

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  createAccountingGateway,
  accountingGateway,
  resolveAccountingDatabase,
  createUnconfiguredAccountingDatabase,
  assertAccountingDatabaseResolution,
  createAccountingContext,
  validateGatewayRequest,
  validateIdempotencyKey,
  validateAccountingContext,
  prepareIdempotencyContext,
  AccountingError,
  AuthorizationError,
  CapabilityDeniedError,
  AccountingConfigurationError,
  AccountingDatabaseError,
  ClosedPeriodError,
  ValidationError,
  MappingError,
  PostingError,
  DuplicatePostingError,
  MigrationError,
  DomainBoundaryError,
  AccountingService,
  ContractOnlyAccountingService,
  assertGatewayContext
} from "../src/accounting/index.js";
import { createInvitation, acceptInvitation } from "../src/lib/memberships.js";
import { issuePlatformUserSession } from "../src/lib/identity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeD1Env() {
  const db = new DatabaseSync(":memory:");

  db.exec(`
    CREATE TABLE registrations (
      reference TEXT PRIMARY KEY, parish_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
      parish_name TEXT, community_type TEXT, stripe_account_id TEXT, stripe_subscription_id TEXT,
      received_at TEXT, updated_at TEXT NOT NULL, data TEXT NOT NULL
    );
  `);

  db.exec(readFileSync(path.join(__dirname, "..", "migrations", "0014_audit_log.sql"), "utf8"));
  db.exec(readFileSync(path.join(__dirname, "..", "migrations", "0020_platform_identity.sql"), "utf8"));

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

  return { env: { AGAPAY_DB: { prepare: (sql) => wrap(sql) } }, db };
}

function authenticatedRequest({ email, token, idempotencyKey = "", requestId = "req_gateway_test" } = {}) {
  const headers = {
    "X-AGAPAY-User-Email": email || "",
    "Authorization": token ? `Bearer ${token}` : "",
    "X-Request-Id": requestId,
    "User-Agent": "accounting-gateway-test"
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return new Request("https://agapay.test/api/accounting/future", {
    method: "POST",
    headers
  });
}

async function seedMember(env, { parishId = "parish_gateway", email = "treasurer@example.org", capabilities = ["accounting.view"] } = {}) {
  const invitation = await createInvitation(env, { parishId, email, capabilities });
  assert.equal(invitation.ok, true, "seed invitation should succeed");
  const accepted = await acceptInvitation(env, { token: invitation.token, password: `${email} password 123` });
  assert.equal(accepted.ok, true, "seed invitation acceptance should succeed");
  const session = await issuePlatformUserSession(env, accepted.userId);
  return { ...accepted, email, token: session.token };
}

function auditRows(db, action) {
  return db.prepare("SELECT * FROM audit_log WHERE action = ?").all(action);
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

await test("gateway creation exposes exactly the approved public surface", async () => {
  assert.deepEqual(Object.keys(accountingGateway).sort(), ["buildContext", "invokeService"]);
  const custom = createAccountingGateway({ auditSink: null });
  assert.deepEqual(Object.keys(custom).sort(), ["buildContext", "invokeService"]);
});

await test("context creation carries authenticated user, membership, capability, request metadata, audit context, and idempotency", async () => {
  const { env } = makeD1Env();
  const seeded = await seedMember(env, { capabilities: ["accounting.view"] });
  const request = authenticatedRequest({
    email: seeded.email,
    token: seeded.token,
    idempotencyKey: "gateway-key-123",
    requestId: "corr_context"
  });
  const gateway = createAccountingGateway({ auditSink: null });
  const context = await gateway.buildContext(request, env, {
    parishId: seeded.parishId,
    capability: "accounting.view",
    requestType: "future.accounting.read",
    metadata: { source: "test" }
  });

  assert.equal(context.user.id, seeded.userId);
  assert.equal(context.membership.parishId, seeded.parishId);
  assert.equal(context.authorization.capability, "accounting.view");
  assert.equal(context.correlationId, "corr_context");
  assert.equal(context.request.method, "POST");
  assert.equal(context.request.path, "/api/accounting/future");
  assert.equal(context.audit.actorUserId, seeded.userId);
  assert.equal(context.idempotency.key, "gateway-key-123");
  assert.equal(context.idempotency.duplicateDetectionReady, false);
  assert.equal(context.accountingDatabase.status, "unconfigured");
  validateAccountingContext(context);
});

await test("authorization denial stops before database resolution", async () => {
  const { env } = makeD1Env();
  const seeded = await seedMember(env, { capabilities: ["donations.view"] });
  let resolverCalled = false;
  const gateway = createAccountingGateway({
    auditSink: null,
    databaseResolver: async () => {
      resolverCalled = true;
      return createUnconfiguredAccountingDatabase({ parishId: seeded.parishId });
    }
  });

  await assert.rejects(
    () => gateway.buildContext(authenticatedRequest({ email: seeded.email, token: seeded.token }), env, {
      parishId: seeded.parishId,
      capability: "accounting.view",
      requestType: "future.accounting.read"
    }),
    CapabilityDeniedError
  );
  assert.equal(resolverCalled, false, "database resolver must not run before capability approval");
});

await test("default audit integration records gateway request start without accounting audit tables", async () => {
  const { env, db } = makeD1Env();
  const seeded = await seedMember(env, { capabilities: ["accounting.view"] });
  await accountingGateway.buildContext(authenticatedRequest({ email: seeded.email, token: seeded.token }), env, {
    parishId: seeded.parishId,
    capability: "accounting.view",
    requestType: "future.accounting.read"
  });

  const rows = auditRows(db, "accounting.gateway.request_started");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_user_id, seeded.userId);
  assert.equal(rows[0].organization_id, seeded.parishId);
});

await test("database resolution abstraction defaults to unconfigured and never exposes raw binding identifiers", async () => {
  const resolved = await resolveAccountingDatabase({ AGAPAY_DB: { forbidden: true } }, {
    parishId: "parish_database",
    environment: "test"
  });
  assert.equal(resolved.status, "unconfigured");
  assert.equal(resolved.parishId, "parish_database");
  assert.equal(resolved.binding, null);
  assert.equal("bindingName" in resolved, false);
  assert.equal("databaseId" in resolved, false);
  assert.equal(assertAccountingDatabaseResolution(resolved), resolved);
});

await test("database resolver rejects raw binding identifiers", async () => {
  assert.throws(
    () => assertAccountingDatabaseResolution({ status: "active", parishId: "p1", bindingName: "ACCOUNTING_P1" }),
    AccountingDatabaseError
  );
  assert.throws(
    () => assertAccountingDatabaseResolution({ status: "active", parishId: "p1", databaseId: "uuid" }),
    AccountingDatabaseError
  );
});

await test("validation centralizes malformed gateway request and idempotency failures", async () => {
  assert.throws(() => validateGatewayRequest({ parishId: "", capability: "accounting.view", requestType: "x" }), ValidationError);
  assert.throws(() => validateGatewayRequest({ parishId: "p", capability: "parish.view", requestType: "x" }), ValidationError);
  assert.throws(() => validateIdempotencyKey("short"), ValidationError);
  assert.equal(validateIdempotencyKey("long-enough-key"), "long-enough-key");
  const prepared = prepareIdempotencyContext({ parishId: "p", requestType: "future", idempotencyKey: "manual-key-123" });
  assert.equal(prepared.scope, "p:future");
  assert.equal(prepared.source, "explicit");
});

await test("service contracts reject direct calls without a gateway context", async () => {
  const service = new ContractOnlyAccountingService({
    name: "future-donation-service",
    type: "donation",
    operations: ["preview"]
  });
  await assert.rejects(
    () => service.invoke("preview", { parishId: "p1" }, {}),
    DomainBoundaryError
  );
  assert.throws(() => assertGatewayContext({ parishId: "p1" }), DomainBoundaryError);
});

await test("gateway can invoke a service contract only after creating context", async () => {
  const { env } = makeD1Env();
  const seeded = await seedMember(env, { capabilities: ["accounting.view"] });
  const gateway = createAccountingGateway({ auditSink: null });
  const service = new ContractOnlyAccountingService({
    name: "future-reporting-service",
    type: "reporting",
    operations: ["preview"]
  });

  const result = await gateway.invokeService(
    service,
    "preview",
    authenticatedRequest({ email: seeded.email, token: seeded.token }),
    env,
    {
      parishId: seeded.parishId,
      capability: "accounting.view",
      requestType: "future.reporting.preview"
    },
    { report: "statement-preview" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.service, "future-reporting-service");
  assert.equal(result.parishId, seeded.parishId);
});

await test("service operation support is explicit and deny-by-default", async () => {
  const service = new ContractOnlyAccountingService({
    name: "future-banking-service",
    type: "banking",
    operations: ["preview"]
  });
  assert.equal(service.supports("preview"), true);
  assert.equal(service.supports("post"), false);
});

await test("error taxonomy is stable and accounting-specific", async () => {
  const errors = [
    new AccountingError("base"),
    new AuthorizationError(),
    new CapabilityDeniedError(),
    new AccountingConfigurationError(),
    new AccountingDatabaseError(),
    new ClosedPeriodError(),
    new ValidationError(),
    new MappingError(),
    new PostingError(),
    new DuplicatePostingError(),
    new MigrationError(),
    new DomainBoundaryError()
  ];
  for (const err of errors) {
    assert.ok(err instanceof Error);
    assert.ok(err instanceof AccountingError);
    assert.equal(typeof err.code, "string");
    assert.equal(typeof err.status, "number");
  }
});

await test("future extension safety: custom resolver receives parish and request type, never a client raw binding", async () => {
  const { env } = makeD1Env();
  const seeded = await seedMember(env, { capabilities: ["accounting.view"] });
  const calls = [];
  const gateway = createAccountingGateway({
    auditSink: null,
    databaseResolver: async (_env, args) => {
      calls.push(args);
      assert.equal("bindingName" in args, false);
      assert.equal("databaseId" in args, false);
      return createUnconfiguredAccountingDatabase({ parishId: args.parishId, environment: args.environment });
    }
  });

  await gateway.buildContext(authenticatedRequest({ email: seeded.email, token: seeded.token }), env, {
    parishId: seeded.parishId,
    capability: "accounting.view",
    requestType: "future.extension.safety",
    environment: "test",
    bindingName: "SHOULD_NOT_BE_FORWARDED"
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]).sort(), ["environment", "parishId", "requestType"]);
});

await test("manual context creation still requires authorization-shaped inputs", async () => {
  assert.throws(
    () => createAccountingContext({
      request: authenticatedRequest(),
      parishId: "p",
      requestType: "manual",
      capability: "accounting.view",
      authorization: { user: null, membership: null, capabilities: [] },
      accountingDatabase: createUnconfiguredAccountingDatabase({ parishId: "p" })
    }),
    ValidationError
  );
});

if (process.exitCode) {
  console.error(`${passed} accounting gateway test(s) passed before failure.`);
  process.exit(process.exitCode);
}

console.log(`\n${passed} test(s) passed.`);
console.log("All accounting gateway tests passed.");
