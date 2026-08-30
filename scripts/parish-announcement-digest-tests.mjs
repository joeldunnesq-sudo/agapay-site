import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  handleAnnouncementDigestUnsubscribe,
  sendWeeklyAnnouncementDigestEmails,
  setAnnouncementDigestSubscription,
} from "../src/handlers/parish-communications.js";
import { readWorkerCompositionSource } from "./lib/worker-composition-source.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlite = new DatabaseSync(":memory:");
for (const migration of [
  "0065_parish_announcements.sql",
  "0067_parish_announcement_hero_images.sql",
  "0068_parish_announcement_digest_subscriptions.sql",
]) {
  sqlite.exec(readFileSync(path.join(root, "migrations", migration), "utf8"));
}

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

const registration = {
  parishId: "parish-digest-test",
  parishName: "St. Test Parish",
  subscriptionTier: "parish",
  status: "verified",
  addressLine1: "123 Parish Way",
  addressLine2: "Suite 4",
  city: "Chicago",
  state: "IL",
  postalCode: "60601",
  country: "US",
  website: "https://www.st-test.example",
};
const env = { AGAPAY_DB: db, AGAPAY_APP_URL: "https://agapay.test" };
const sent = [];
const captureEmail = async (_env, message) => {
  sent.push({ message });
  return { status: "sent", httpStatus: 200 };
};

sqlite.prepare(`
  INSERT INTO parish_announcements
    (id, parish_id, title, body, status, pinned, published_at, created_by)
  VALUES (?, ?, ?, ?, 'published', 0, ?, ?)
`).run(
  "announcement-before-opt-in",
  registration.parishId,
  "Already published",
  "This must not be emailed without opt-in.",
  "2026-07-01T12:00:00.000Z",
  "editor@example.test",
);

let results = await sendWeeklyAnnouncementDigestEmails(env, "2026-07-10T12:00:00.000Z", {}, {
  registrations: [registration],
  sendEmail: captureEmail,
});
assert.deepEqual(results, [], "a donor who has not opted in must never receive a digest");
assert.equal(sent.length, 0);

const subscription = await setAnnouncementDigestSubscription(db, {
  parishId: registration.parishId,
  donorId: "donor@example.test",
  subscribed: true,
  now: "2026-07-10T12:00:00.000Z",
});
assert.equal(subscription.subscribed, true);
assert.match(subscription.unsubscribeToken, /^digest_unsubscribe_[a-f0-9]{48}$/);

sqlite.prepare(`
  INSERT INTO parish_announcements
    (id, parish_id, title, body, status, pinned, published_at, created_by, hero_image_url)
  VALUES (?, ?, ?, ?, 'published', 0, ?, ?, ?)
`).run(
  "announcement-after-opt-in",
  registration.parishId,
  "Sunday Schedule",
  "**Important:** Divine Liturgy begins at 9:30.",
  "2026-07-11T12:00:00.000Z",
  "editor@example.test",
  "https://images.example.test/sunday.jpg",
);

results = await sendWeeklyAnnouncementDigestEmails(env, "2026-07-12T12:00:00.000Z", {}, {
  registrations: [registration],
  sendEmail: captureEmail,
});
assert.equal(results[0].status, "sent");
assert.equal(results[0].announcementCount, 1, "announcements published before opt-in must be excluded");
assert.equal(sent.length, 1);
assert.match(sent[0].message.html, /<strong>Important:<\/strong>/);
assert.match(sent[0].message.html, /<img[^>]+width="600"/);
assert.match(sent[0].message.html, /123 Parish Way/);
assert.match(sent[0].message.html, /Chicago IL 60601/);
assert.match(sent[0].message.html, new RegExp(`/api/donor/digest/unsubscribe\\?token=${subscription.unsubscribeToken}`));
assert.equal(sent[0].message.headers["List-Unsubscribe"], `<https://agapay.test/api/donor/digest/unsubscribe?token=${subscription.unsubscribeToken}>`);
assert.equal(sent[0].message.from, "AGAPAY <onboarding@agapay.app>", "digests must use AGAPAY's centrally managed sender");

results = await sendWeeklyAnnouncementDigestEmails(env, "2026-07-19T12:00:00.000Z", {}, {
  registrations: [{ ...registration, communicationsEnabled: false }],
  sendEmail: captureEmail,
});
assert.deepEqual(results, [], "turning Communications off must suppress announcement digests");
assert.equal(sent.length, 1);

results = await sendWeeklyAnnouncementDigestEmails(env, "2026-07-19T12:00:00.000Z", {}, {
  registrations: [registration],
  sendEmail: captureEmail,
});
assert.equal(results[0].reason, "nothing_new", "a subscriber with no new announcements must not receive an empty digest");
assert.equal(sent.length, 1);

const unsubscribeResponse = await handleAnnouncementDigestUnsubscribe(new Request(
  `https://agapay.test/api/donor/digest/unsubscribe?token=${subscription.unsubscribeToken}`,
), env);
assert.equal(unsubscribeResponse.status, 200, "unsubscribe must work with only the link token and no auth headers or session");
assert.match(await unsubscribeResponse.text(), /You’re unsubscribed/);
const repeatedUnsubscribeResponse = await handleAnnouncementDigestUnsubscribe(new Request(
  `https://agapay.test/api/donor/digest/unsubscribe?token=${subscription.unsubscribeToken}`,
), env);
assert.equal(repeatedUnsubscribeResponse.status, 200, "a valid unsubscribe link should remain idempotently usable");

sqlite.prepare(`
  INSERT INTO parish_announcements
    (id, parish_id, title, body, status, pinned, published_at, created_by)
  VALUES (?, ?, ?, ?, 'published', 0, ?, ?)
`).run(
  "announcement-after-unsubscribe",
  registration.parishId,
  "After unsubscribe",
  "This must not be sent.",
  "2026-07-20T12:00:00.000Z",
  "editor@example.test",
);
results = await sendWeeklyAnnouncementDigestEmails(env, "2026-07-26T12:00:00.000Z", {}, {
  registrations: [registration],
  sendEmail: captureEmail,
});
assert.deepEqual(results, [], "an unsubscribed donor must not receive later digests");
assert.equal(sent.length, 1);

const workerSource = readWorkerCompositionSource(root);
const feedHtml = readFileSync(path.join(root, "public", "myagapay", "feed.html"), "utf8");
const feedJs = readFileSync(path.join(root, "public", "myagapay", "feed.js"), "utf8");
const parishApp = readFileSync(path.join(root, "public", "parish", "app.js"), "utf8");
assert.match(
  workerSource,
  /['"]\/api\/donor\/digest\/unsubscribe['"],\s*['"]handleAnnouncementDigestUnsubscribe['"]/
);
assert.match(workerSource, /sendWeeklyAnnouncementDigestEmails\(env, event\.scheduledTime\)/);
assert.match(feedHtml, /id="feedDigestToggle" type="checkbox" disabled/);
assert.match(feedJs, /body: JSON\.stringify\(\{ subscribed: requested \}\)/);
assert.match(parishApp, /const form = event\.currentTarget;[\s\S]*?form\.reset\(\)/, "announcement authoring must retain the form across async work");

console.log("PASS - opt-in announcement digests honor consent, freshness, address, and public unsubscribe requirements");
