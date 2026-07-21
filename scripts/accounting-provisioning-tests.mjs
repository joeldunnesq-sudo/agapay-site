import assert from "node:assert/strict";
import { createBoundD1ProvisioningAdapter, createInMemoryProvisioningAdapter, deterministicAccountingDatabaseName, provisionAccountingDatabase, validateProvisionedAccountingDatabase } from "../src/accounting/index.js";

const adapter = createInMemoryProvisioningAdapter();
const input = { parishId: "parish-secret-123", environment: "test" };
const name = await deterministicAccountingDatabaseName(input);
assert.match(name, /^agapay-acct-test-[a-f0-9]{20}$/);
assert.equal(name.includes(input.parishId), false);
const first = await provisionAccountingDatabase({ adapter, ...input });
const second = await provisionAccountingDatabase({ adapter, ...input });
assert.equal(first.providerId, second.providerId);
assert.equal((await validateProvisionedAccountingDatabase(adapter, first.providerId)).ok, true);
assert.deepEqual([...adapter.inspect(name).tables.keys()].sort(), ["accounting_database_metadata", "accounting_health_checks", "accounting_idempotency_keys", "accounting_migrations"].sort());

const calls = [];
const binding = { prepare(sql) { return { bind(...params) { return { async all() { calls.push({ sql, params }); return { results:[{ ok:1 }] }; } }; } }; }, async batch() { return []; } };
const bound = createBoundD1ProvisioningAdapter({ ACCOUNTING_DATABASE_BINDINGS: JSON.stringify({ [name]:"PARISH_DB" }), PARISH_DB:binding });
assert.deepEqual(await bound.findByName(name), { providerId:"PARISH_DB", name });
assert.equal((await bound.execute("PARISH_DB", "SELECT ? ok", [1]))[0].results[0].ok, 1);
assert.deepEqual(calls, [{ sql:"SELECT ? ok", params:[1] }]);
console.log("PASS - Phase 1B provisioning is opaque, isolated, idempotent, and technical-only");
