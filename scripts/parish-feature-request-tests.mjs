import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  dismissParishFeatureRequest,
  loadPendingParishFeatureRequests,
  recordParishFeatureRequest
} from "../src/lib/parish-feature-requests.js";

const values = new Map();
const env = {
  AGAPAY_REGISTRATIONS: {
    get: async (key) => values.get(key) || null,
    put: async (key, value) => { values.set(key, value); }
  }
};

const first = await recordParishFeatureRequest(env, {
  parishId: "st-fiacre",
  featureId: "pledge-tracker",
  donorEmail: "one@example.org"
});
assert.equal(first.duplicate, false);
assert.equal(first.request.count, 1);

const duplicate = await recordParishFeatureRequest(env, {
  parishId: "st-fiacre",
  featureId: "pledge-tracker",
  donorEmail: "ONE@example.org"
});
assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.request.count, 1, "the same donor should not inflate parish interest");

await recordParishFeatureRequest(env, {
  parishId: "st-fiacre",
  featureId: "pledge-tracker",
  donorEmail: "two@example.org"
});
let pending = await loadPendingParishFeatureRequests(env, "st-fiacre");
assert.equal(pending.length, 1);
assert.equal(pending[0].count, 2);
assert.equal("requestors" in pending[0], false, "donor identities must not reach the parish dashboard");

assert.equal(await dismissParishFeatureRequest(env, "st-fiacre", "pledge-tracker"), true);
pending = await loadPendingParishFeatureRequests(env, "st-fiacre");
assert.deepEqual(pending, []);

await recordParishFeatureRequest(env, {
  parishId: "st-fiacre",
  featureId: "pledge-tracker",
  donorEmail: "three@example.org"
});
pending = await loadPendingParishFeatureRequests(env, "st-fiacre");
assert.equal(pending[0].count, 3, "a new donor request should reopen a dismissed notification");

const givingPlus = await recordParishFeatureRequest(env, {
  parishId: "st-fiacre",
  featureId: "giving-plus",
  donorEmail: "one@example.org"
});
assert.equal(givingPlus.duplicate, false);
pending = await loadPendingParishFeatureRequests(env, "st-fiacre");
assert.equal(pending.find((item) => item.featureId === "giving-plus")?.count, 1);
assert.equal(pending.find((item) => item.featureId === "pledge-tracker")?.count, 3);

console.log("Parish feature request tests passed.");

const db = new DatabaseSync(":memory:");
db.exec(await readFile(new URL("../migrations/0059_parish_feature_requests.sql", import.meta.url), "utf8"));
const d1Env = {
  AGAPAY_DB: {
    prepare(sql) {
      const statement = db.prepare(sql);
      let params = [];
      return {
        bind(...values) {
          params = values;
          return this;
        },
        first() {
          return statement.get(...params) || null;
        },
        all() {
          return { results: statement.all(...params) };
        },
        run() {
          const result = statement.run(...params);
          return { meta: { changes: result.changes } };
        }
      };
    }
  }
};

await recordParishFeatureRequest(d1Env, {
  parishId: "holy-cross",
  featureId: "pledge-tracker",
  donorEmail: "first@example.org"
});
await recordParishFeatureRequest(d1Env, {
  parishId: "holy-cross",
  featureId: "pledge-tracker",
  donorEmail: "FIRST@example.org"
});
await recordParishFeatureRequest(d1Env, {
  parishId: "holy-cross",
  featureId: "pledge-tracker",
  donorEmail: "second@example.org"
});
let d1Pending = await loadPendingParishFeatureRequests(d1Env, "holy-cross");
assert.equal(d1Pending[0].count, 2, "D1 should deduplicate donors through its composite primary key");
await dismissParishFeatureRequest(d1Env, "holy-cross", "pledge-tracker");
assert.deepEqual(await loadPendingParishFeatureRequests(d1Env, "holy-cross"), []);
await recordParishFeatureRequest(d1Env, {
  parishId: "holy-cross",
  featureId: "pledge-tracker",
  donorEmail: "third@example.org"
});
d1Pending = await loadPendingParishFeatureRequests(d1Env, "holy-cross");
assert.equal(d1Pending[0].count, 3, "a new D1 request should reopen the parish popup");
await recordParishFeatureRequest(d1Env, {
  parishId: "holy-cross",
  featureId: "giving-plus",
  donorEmail: "first@example.org"
});
d1Pending = await loadPendingParishFeatureRequests(d1Env, "holy-cross");
assert.equal(d1Pending.find((item) => item.featureId === "giving-plus")?.count, 1);
assert.equal(d1Pending.find((item) => item.featureId === "pledge-tracker")?.count, 3);

console.log("Parish feature request D1 tests passed.");
