#!/usr/bin/env node
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prayerRequestsEnabledFor } from "../src/lib/entitlements.js";
import {
  createPrayerRequest,
  getPrayerSettings,
  listMemberPrayerRequests,
  listParishPrayerRequests,
  reportPrayerRequest,
  savePrayerSettings,
  togglePrayerAcknowledgement,
  updateOwnPrayerRequest,
  updateParishPrayerRequest,
} from "../src/handlers/koinonia-prayer-requests.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

function d1Environment(sqlite) {
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
  const AGAPAY_DB = { prepare };
  return { AGAPAY_DB, DB: AGAPAY_DB, AGAPAY_ENVIRONMENT: "test" };
}

function jsonRequest(body, method = "POST") {
  return new Request("https://agapay.test/prayer", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

assert.equal(prayerRequestsEnabledFor({ subscriptionTier: "parish" }), true);
assert.equal(prayerRequestsEnabledFor({ subscriptionTier: "parish", prayerRequestsEnabled: false }), false, "the parish dashboard switch must disable member access");
assert.equal(prayerRequestsEnabledFor({ subscriptionTier: "parish", communicationsEnabled: false }), false, "Prayer Requests must respect the parent Koinonia switch");
assert.equal(prayerRequestsEnabledFor({ subscriptionTier: "stewardship" }), false, "Prayer Requests is a Parish-tier feature");

const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON;");
sqlite.exec("CREATE TABLE directory_people (id TEXT PRIMARY KEY, preferred_name TEXT NOT NULL);");
sqlite.exec(read("migrations/0097_koinonia_prayer_requests.sql"));
for (const [id, name] of [["person-1","Maria"],["person-2","John"],["person-3","Anna"],["person-4","Peter"]]) {
  sqlite.prepare("INSERT INTO directory_people (id, preferred_name) VALUES (?, ?)").run(id, name);
}
const env = d1Environment(sqlite);
const maria = { parishId:"st-fiacre", householdId:"house-1", personId:"person-1", donorId:"maria@example.org" };
const john = { parishId:"st-fiacre", householdId:"house-2", personId:"person-2", donorId:"john@example.org" };

const defaults = await getPrayerSettings(env, "st-fiacre");
assert.deepEqual(
  { approvalRequired:defaults.approvalRequired, allowAnonymous:defaults.allowAnonymous, autoArchiveDays:defaults.autoArchiveDays },
  { approvalRequired:true, allowAnonymous:true, autoArchiveDays:30 },
  "safe moderation defaults must apply before a parish saves custom settings",
);

const submitted = await createPrayerRequest(jsonRequest({ body:"Please pray for my father's recovery.", visibility:"parish_members", anonymous:true }), env, maria);
assert.equal(submitted.request.status, "pending");
assert.equal(submitted.request.anonymous, true);
assert.equal((await listMemberPrayerRequests(env, john)).length, 0, "pending requests must never appear to other parishioners");
assert.equal((await listMemberPrayerRequests(env, maria, { mine:true }))[0].status, "pending", "submitters must be able to track requests awaiting review");

await updateParishPrayerRequest(jsonRequest({ status:"active", visibility:"parish_members", expectedRevision:1 }, "PATCH"), env, "st-fiacre", submitted.request.id);
const publicRows = await listMemberPrayerRequests(env, john);
assert.equal(publicRows.length, 1);
assert.equal(publicRows[0].requesterName, "Anonymous", "anonymous requests must hide member identity from parishioners");
assert.equal(publicRows[0].body, "Please pray for my father's recovery.");

const firstPrayer = await togglePrayerAcknowledgement(env, john, submitted.request.id);
assert.deepEqual({ prayed:firstPrayer.prayed, count:firstPrayer.prayerCount }, { prayed:true, count:1 });
const removedPrayer = await togglePrayerAcknowledgement(env, john, submitted.request.id);
assert.deepEqual({ prayed:removedPrayer.prayed, count:removedPrayer.prayerCount }, { prayed:false, count:0 }, "one member may contribute at most one current prayer acknowledgement");

const clergyOnly = await createPrayerRequest(jsonRequest({ body:"Please pray privately for a difficult family situation.", visibility:"clergy_only", anonymous:false }), env, maria);
assert.equal(clergyOnly.request.status, "active");
assert.equal((await listMemberPrayerRequests(env, john)).some((item) => item.id === clergyOnly.request.id), false, "clergy-only requests must never enter the community list");
assert.equal((await listMemberPrayerRequests(env, maria, { mine:true })).some((item) => item.id === clergyOnly.request.id), true, "the submitter must retain access to a clergy-only request");

for (const personId of ["person-2","person-3","person-4"]) {
  await reportPrayerRequest(jsonRequest({ reason:"Contains private information" }), env, { ...john, personId }, submitted.request.id);
}
assert.equal(sqlite.prepare("SELECT status FROM koinonia_prayer_requests WHERE id = ?").get(submitted.request.id).status, "flagged", "three unique reports must temporarily remove a request for dashboard review");

const adminQueue = await listParishPrayerRequests(env, "st-fiacre");
const flagged = adminQueue.requests.find((item) => item.id === submitted.request.id);
assert.equal(flagged.actualRequesterName, "Maria", "authorized dashboard staff must retain the submitter identity for pastoral safety");
assert.equal(flagged.reportCount, 3);
assert.equal(adminQueue.metrics.awaitingReview, 1);
assert.equal(adminQueue.metrics.clergyOnly, 1);

await updateParishPrayerRequest(jsonRequest({ status:"active", visibility:"clergy_only", expectedRevision:3 }, "PATCH"), env, "st-fiacre", submitted.request.id);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM koinonia_prayer_reports WHERE request_id = ? AND resolved_at IS NULL").get(submitted.request.id).count, 0, "a parish decision must resolve pending reports");
assert.equal((await listMemberPrayerRequests(env, john)).length, 0, "moving a request to clergy only must immediately remove it from the member list");

await savePrayerSettings(jsonRequest({ approvalRequired:false, allowAnonymous:false, autoArchiveDays:45, pastoralNotice:"Share prayer requests with pastoral care." }, "PATCH"), env, "st-fiacre");
const savedSettings = await getPrayerSettings(env, "st-fiacre");
assert.equal(savedSettings.approvalRequired, false);
assert.equal(savedSettings.allowAnonymous, false);
assert.equal(savedSettings.autoArchiveDays, 45);
const immediatelyPublished = await createPrayerRequest(jsonRequest({ body:"Please pray for safe travel this week.", visibility:"parish_members", anonymous:true }), env, john);
assert.equal(immediatelyPublished.request.status, "active");
assert.equal(immediatelyPublished.request.anonymous, false, "the parish anonymity safeguard must be enforced server-side");

await updateOwnPrayerRequest(jsonRequest({ status:"answered" }, "PATCH"), env, john, immediatelyPublished.request.id);
assert.equal(sqlite.prepare("SELECT status FROM koinonia_prayer_requests WHERE id = ?").get(immediatelyPublished.request.id).status, "answered", "a submitter must be able to mark an active prayer answered");

const sources = {
  worker: read("src/worker.js"),
  handler: read("src/handlers/koinonia-prayer-requests.js"),
  parishLife: read("public/myagapay/parish-life.js"),
  memberPage: read("public/myagapay/prayer-requests.html"),
  memberClient: read("public/myagapay/prayer-requests.js"),
  dashboard: read("public/parish/dashboard.html"),
  dashboardClient: read("public/parish/app.js"),
};
assert.match(sources.worker, /\/api\/donor\/koinonia\/prayer-requests/);
assert.match(sources.worker, /handleParishPrayerRequests/);
assert.match(sources.handler, /prayerRequestsEnabledFor\(found\.registration\)/, "the member API must enforce the ON/OFF switch server-side");
assert.match(sources.parishLife, /Prayer Requests[\s\S]*data-community-tool-badge="prayers"/);
assert.match(sources.memberPage, /Parish community[\s\S]*Clergy only[\s\S]*Post anonymously/);
assert.match(sources.memberClient, /community-tools\/prayers\/opened/);
assert.match(sources.dashboard, /id="prayerRequestsEnabledSwitch"[\s\S]*data-koinonia-panel="prayers"/);
assert.match(sources.dashboard, /id="prayerApprovalRequired"[\s\S]*id="prayerAnonymousAllowed"[\s\S]*id="prayerArchiveDays"/);
assert.match(sources.dashboardClient, /prayers: 'prayerRequestsEnabled'/);
assert.match(sources.dashboardClient, /patchParishPrayerRequest[\s\S]*saveParishPrayerSettings/);

console.log("PASS - Koinonia Prayer Requests moderation, privacy, reactions, reports, settings, feature switch, routes, and UI are wired");
