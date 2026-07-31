import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deliverPushNotifications,
  listGroupPushSubscriptions,
  listParishPushSubscriptions,
} from "../src/lib/push-notifications.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE platform_users (id TEXT PRIMARY KEY, email TEXT NOT NULL, status TEXT NOT NULL);
  CREATE TABLE directory_people (id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE directory_person_links (
    id TEXT PRIMARY KEY, person_id TEXT NOT NULL, link_type TEXT NOT NULL,
    external_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE directory_ministry_participants (
    id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, ministry_id TEXT NOT NULL,
    person_id TEXT NOT NULL, status TEXT NOT NULL
  );
  CREATE TABLE directory_ministry_leaders (
    id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, ministry_id TEXT NOT NULL,
    person_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
  );
`);
sqlite.exec(readFileSync(path.join(root, "migrations", "0069_push_subscriptions.sql"), "utf8"));

const db = {
  prepare(sql) {
    return {
      parameters: [],
      bind(...parameters) { this.parameters = parameters; return this; },
      async first() { return sqlite.prepare(sql).get(...this.parameters) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...this.parameters) }; },
      async run() {
        const result = sqlite.prepare(sql).run(...this.parameters);
        return { success: true, meta: { changes: result.changes } };
      },
    };
  },
};
const env = {
  AGAPAY_DB: db,
  VAPID_PUBLIC_KEY: "public-test-key",
  VAPID_PRIVATE_KEY: "private-test-key",
};

const people = [
  ["person-author", "user-author", "author@example.test"],
  ["person-participant", "user-participant", "participant@example.test"],
  ["person-leader", "user-leader", "leader@example.test"],
  ["person-withdrawn", "user-withdrawn", "withdrawn@example.test"],
  ["person-other-parish", "user-other", "other@example.test"],
];
for (const [personId, userId, email] of people) {
  sqlite.prepare("INSERT INTO directory_people (id, active) VALUES (?, 1)").run(personId);
  sqlite.prepare("INSERT INTO platform_users (id, email, status) VALUES (?, ?, 'active')").run(userId, email);
  sqlite.prepare("INSERT INTO directory_person_links (id, person_id, link_type, external_id, active) VALUES (?, ?, 'platform_user', ?, 1)")
    .run(`link-${personId}`, personId, userId);
}

sqlite.prepare("INSERT INTO directory_ministry_participants VALUES (?, ?, ?, ?, ?)")
  .run("participant-active", "parish-one", "ministry-one", "person-participant", "active");
sqlite.prepare("INSERT INTO directory_ministry_leaders VALUES (?, ?, ?, ?, ?)")
  .run("leader-active", "parish-one", "ministry-one", "person-leader", 1);
sqlite.prepare("INSERT INTO directory_ministry_participants VALUES (?, ?, ?, ?, ?)")
  .run("participant-withdrawn", "parish-one", "ministry-one", "person-withdrawn", "withdrawn");
sqlite.prepare("INSERT INTO directory_ministry_participants VALUES (?, ?, ?, ?, ?)")
  .run("participant-other", "parish-two", "ministry-one", "person-other-parish", "active");

for (const [index, [, , email]] of people.entries()) {
  const parishId = email === "other@example.test" ? "parish-two" : "parish-one";
  sqlite.prepare(`
    INSERT INTO push_subscriptions (id, parish_id, donor_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(`push-${index}`, parishId, email, `https://push.example.test/${index}`, `p256dh-${index}`, `auth-${index}`);
}

const parishSubscriptions = await listParishPushSubscriptions(env, "parish-one");
assert.equal(parishSubscriptions.length, 4, "announcement pushes must select only subscriptions from the publishing parish");
assert.ok(parishSubscriptions.every(row => row.parish_id === "parish-one"));

const groupSubscriptions = await listGroupPushSubscriptions(env, {
  parishId: "parish-one",
  ministryId: "ministry-one",
  authorPersonId: "person-author",
});
assert.deepEqual(
  groupSubscriptions.map(row => row.donor_id).sort(),
  ["leader@example.test", "participant@example.test"],
  "group push recipients must be active leaders/participants in the parish and must exclude the author",
);

const expiring = groupSubscriptions[0];
const summary = await deliverPushNotifications(env, [expiring], {
  title: "Test",
  body: "Expiry pruning",
  url: "/myagapay/groups",
}, {
  buildPayload: async () => ({ method: "POST", headers: new Headers(), body: "encrypted" }),
  fetchImpl: async () => new Response(null, { status: 410 }),
});
assert.deepEqual(summary, { attempted: 1, sent: 0, expired: 1, failed: 0 });
assert.equal(
  sqlite.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE endpoint = ?").get(expiring.endpoint).count,
  0,
  "a 404/410 push response must delete the expired subscription",
);

const workerSource = readFileSync(path.join(root, "src", "worker.js"), "utf8");
const serviceWorker = readFileSync(path.join(root, "public", "service-worker.js"), "utf8");
const pushUi = readFileSync(path.join(root, "public", "myagapay", "push-notifications.js"), "utf8");
const feedHtml = readFileSync(path.join(root, "public", "myagapay", "feed.html"), "utf8");
const groupsHtml = readFileSync(path.join(root, "public", "myagapay", "groups.html"), "utf8");

assert.match(workerSource, /url\.pathname\.startsWith\("\/api\/donor\/push\/"\)/);
assert.match(serviceWorker, /addEventListener\("push"/);
assert.match(serviceWorker, /addEventListener\("notificationclick"/);
assert.match(pushUi, /enable\?\.addEventListener\("click", async \(\) => \{[\s\S]*Notification\.requestPermission\(\)/,
  "notification permission must only be requested from the explicit enable click");
assert.match(pushUi, /isIosDevice\(\) && !isStandalone\(\)/);
assert.match(feedHtml, /Add to Home Screen/);
assert.match(groupsHtml, /Add to Home Screen/);
assert.match(feedHtml, /data-push-enable>Enable notifications/);
assert.match(groupsHtml, /data-push-enable>Enable notifications/);

console.log("PASS - push delivery is parish-scoped, excludes group authors, prunes expired endpoints, and requires explicit opt-in");
