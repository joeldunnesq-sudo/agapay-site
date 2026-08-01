import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  archiveParishAnnouncement,
  ANNOUNCEMENT_ALLOWED_TAGS,
  ANNOUNCEMENT_CATEGORIES,
  createParishAnnouncement,
  getAnnouncementReadVisibility,
  getDonorAnnouncementFeed,
  listParishAnnouncements,
  markAnnouncementRead,
  renderAnnouncementBody,
  updateParishAnnouncement,
  validateAnnouncementHeroImage,
} from "../src/handlers/parish-communications.js";
import {
  PARISH_EDITORIAL_IMAGE_MAX_BYTES,
  PARISH_EDITORIAL_IMAGE_TYPES,
} from "../src/handlers/parish-giving-catalog.js";
import { communicationsEnabledFor, entitlementsSummary } from "../src/lib/entitlements.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE donors (
    email TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
`);
for (const migration of ["0064_parish_content_reads.sql", "0065_parish_announcements.sql", "0067_parish_announcement_hero_images.sql", "0072_parish_teaching_posts.sql", "0074_parish_content_categories.sql"]) {
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

assert.equal(communicationsEnabledFor({ subscriptionTier: "parish" }), true);
assert.equal(communicationsEnabledFor({ subscriptionTier: "parish", communicationsEnabled: false }), false);
assert.equal(communicationsEnabledFor({ subscriptionTier: "diocese" }), true);
assert.equal(communicationsEnabledFor({ subscriptionTier: "stewardship" }), false);
assert.equal(communicationsEnabledFor({ subscriptionTier: "mission", stewardshipStatus: "active" }), false);
assert.equal(entitlementsSummary({ subscriptionTier: "parish" }).modules.communications.included, true);
assert.equal(entitlementsSummary({ subscriptionTier: "parish", communicationsEnabled: false }).modules.communications.parishHasEnabled, false);

assert.deepEqual(ANNOUNCEMENT_ALLOWED_TAGS, ["strong", "em", "a", "ul", "li", "br"]);
assert.deepEqual(ANNOUNCEMENT_CATEGORIES, ["services", "events", "youth", "outreach", "education", "general"]);
const formattedSource = [
  "Welcome **friends** and *neighbors*.",
  "Visit [our parish](https://example.test/parish).",
  "- Divine Liturgy",
  "- Fellowship hour",
  '<script>alert("no")</script><img src="x" onerror="alert(1)"><h1>Not a heading</h1>',
].join("\n");
const formattedHtml = renderAnnouncementBody(formattedSource);
assert.match(formattedHtml, /<strong>friends<\/strong>/);
assert.match(formattedHtml, /<em>neighbors<\/em>/);
assert.match(formattedHtml, /<a href="https:\/\/example\.test\/parish" target="_blank" rel="noopener noreferrer">our parish<\/a>/);
assert.match(formattedHtml, /<ul><li>Divine Liturgy<\/li><li>Fellowship hour<\/li><\/ul>/);
assert.doesNotMatch(formattedHtml, /<script|<img|<h1|onerror=/i, "raw tags and event-handler attributes must be stripped");

for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
  assert.ok(PARISH_EDITORIAL_IMAGE_TYPES.has(mimeType));
}
const unsupportedUpload = await validateAnnouncementHeroImage(new Request("https://agapay.app/upload", {
  method: "POST",
  headers: { "Content-Type": "image/gif" },
  body: new Uint8Array([1]),
}));
assert.equal(unsupportedUpload.status, 415);
const oversizedUpload = await validateAnnouncementHeroImage(new Request("https://agapay.app/upload", {
  method: "POST",
  headers: { "Content-Type": "image/jpeg" },
  body: new Uint8Array(PARISH_EDITORIAL_IMAGE_MAX_BYTES + 1),
}));
assert.equal(oversizedUpload.status, 413);

const draft = await createParishAnnouncement(db, {
  parishId: "parish-one",
  createdBy: "treasurer@example.test",
  input: { title: "Sunday schedule", body: "Matins begins at 8:30.", pinned: false },
});
const storedDraft = sqlite.prepare("SELECT body, category FROM parish_announcements WHERE id = ?").get(draft.id);
assert.equal(storedDraft.body, "Matins begins at 8:30.", "rendering must not replace the editable source stored in body");
assert.equal(storedDraft.category, "general", "the schema must supply general when no announcement category is provided");
assert.equal(draft.category, "general");
assert.equal(draft.body, storedDraft.body);
assert.equal(draft.bodyHtml, renderAnnouncementBody(storedDraft.body));
let feed = await getDonorAnnouncementFeed(db, { parishId: "parish-one", donorId: "donor@example.test" });
assert.deepEqual(feed.announcements, [], "a draft announcement must not appear on the donor feed");

const published = await updateParishAnnouncement(db, {
  parishId: "parish-one",
  announcementId: draft.id,
  input: { status: "published" },
});
assert.equal(published.status, "published");
feed = await getDonorAnnouncementFeed(db, { parishId: "parish-one", donorId: "donor@example.test" });
assert.deepEqual(feed.announcements.map(({ id }) => id), [draft.id], "publishing should make a draft visible");
assert.equal(feed.unreadCount, 1);

sqlite.prepare("INSERT INTO donors (email, data) VALUES (?, ?), (?, ?)").run(
  "anna@example.test", JSON.stringify({ donorName: "Anna Reader" }),
  "boris@example.test", JSON.stringify({ firstName: "Boris", lastName: "Reader" })
);
await markAnnouncementRead(db, {
  parishId: "parish-one", announcementId: draft.id, donorId: "anna@example.test",
});
await markAnnouncementRead(db, {
  parishId: "parish-one", announcementId: draft.id, donorId: "boris@example.test",
});
const publishedAdminList = await listParishAnnouncements(db, "parish-one");
assert.equal(
  publishedAdminList.find(({ id }) => id === draft.id).readCount,
  2,
  "the parish dashboard count must match the distinct shared read receipts"
);
const readVisibility = await getAnnouncementReadVisibility(db, {
  parishId: "parish-one", announcementId: draft.id,
});
assert.equal(readVisibility.count, 2);
assert.deepEqual(readVisibility.readers.map(({ displayName }) => displayName), ["Anna Reader", "Boris Reader"]);

const pinnedDraft = await createParishAnnouncement(db, {
  parishId: "parish-one",
  createdBy: "treasurer@example.test",
  input: { title: "Weather notice", body: "Please use the south entrance.", pinned: true },
});
await updateParishAnnouncement(db, {
  parishId: "parish-one",
  announcementId: pinnedDraft.id,
  input: { status: "published" },
});
sqlite.prepare("UPDATE parish_announcements SET published_at = '2025-01-01T00:00:00.000Z' WHERE id = ?").run(pinnedDraft.id);
sqlite.prepare("UPDATE parish_announcements SET published_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(draft.id);
feed = await getDonorAnnouncementFeed(db, { parishId: "parish-one", donorId: "donor@example.test" });
assert.deepEqual(
  feed.announcements.map(({ id }) => id),
  [pinnedDraft.id, draft.id],
  "pinned announcements should sort ahead of newer unpinned announcements"
);

assert.equal(await markAnnouncementRead(db, {
  parishId: "parish-one",
  announcementId: draft.id,
  donorId: "donor@example.test",
}), true);
feed = await getDonorAnnouncementFeed(db, { parishId: "parish-one", donorId: "donor@example.test" });
assert.equal(feed.unreadCount, 1, "the unread count should subtract reads returned by the shared service");
assert.equal(feed.announcements.find(({ id }) => id === draft.id).read, true);

await archiveParishAnnouncement(db, { parishId: "parish-one", announcementId: draft.id });
feed = await getDonorAnnouncementFeed(db, { parishId: "parish-one", donorId: "donor@example.test" });
assert.deepEqual(feed.announcements.map(({ id }) => id), [pinnedDraft.id], "archiving should remove an announcement from the donor feed");
const adminAnnouncements = await listParishAnnouncements(db, "parish-one");
assert.equal(adminAnnouncements.find(({ id }) => id === draft.id).status, "archived", "archiving should retain the announcement in the admin list");

const eventsDraft = await createParishAnnouncement(db, {
  parishId: "parish-one",
  createdBy: "treasurer@example.test",
  input: { title: "Parish festival", body: "Join us after Liturgy.", category: "events", pinned: false },
});
feed = await getDonorAnnouncementFeed(db, { parishId: "parish-one", donorId: "donor@example.test", category: "events" });
assert.deepEqual(feed.announcements, [], "category filtering must not expose matching drafts");
await updateParishAnnouncement(db, { parishId: "parish-one", announcementId: eventsDraft.id, input: { status: "published" } });
feed = await getDonorAnnouncementFeed(db, { parishId: "parish-one", donorId: "donor@example.test", category: "events" });
assert.deepEqual(feed.announcements.map(({ id }) => id), [eventsDraft.id], "category filtering must return only matching published announcements");
assert.throws(() => sqlite.prepare(`
  INSERT INTO parish_announcements (id, parish_id, title, body, category, created_by)
  VALUES ('invalid-category', 'parish-one', 'Invalid', 'Invalid', 'fundraiser', 'staff@example.test')
`).run(), /CHECK constraint failed/, "the announcement schema must reject categories outside its taxonomy");

const handlerSource = readFileSync(path.join(root, "src", "handlers", "parish-communications.js"), "utf8");
assert.match(handlerSource, /import \{ getReadContentIds, getReadReceipts, markContentRead \} from "\.\.\/lib\/content-reads\.js"/);
assert.match(handlerSource, /const CONTENT_TYPE = "announcement"/);
assert.match(handlerSource, /getReadContentIds\(db, \{[\s\S]*?contentType: CONTENT_TYPE,[\s\S]*?contentIds,/);
assert.match(handlerSource, /markContentRead\(db, \{[\s\S]*?contentType: CONTENT_TYPE,/);
assert.doesNotMatch(handlerSource, /parish_content_reads/, "the announcement feature must not implement parallel read-tracking SQL");
assert.doesNotMatch(handlerSource, /directory\/media\.js/, "announcement images must not use Directory's consent-oriented media pipeline");
assert.match(handlerSource, /rateLimit\(request, env, "parish-communications-upload"/);
assert.match(handlerSource, /PARISH_EDITORIAL_IMAGE_MAX_BYTES/);
const adminUiSource = readFileSync(path.join(root, "public", "parish", "app.js"), "utf8");
const dashboardSource = readFileSync(path.join(root, "public", "parish", "dashboard.html"), "utf8");
assert.match(adminUiSource, /toggleAnnouncementReaders/);
assert.match(adminUiSource, /\/readers/);
assert.match(adminUiSource, /async function toggleCommunicationsFeature\(input\)/);
assert.match(adminUiSource, /body: JSON\.stringify\(\{ communicationsEnabled: enabled \}\)/);
assert.match(adminUiSource, /category: document\.getElementById\('announcementCategory'\)\.value/);
assert.match(dashboardSource, /id="announcementCategory"[\s\S]*?value="general"[\s\S]*?value="services"[\s\S]*?value="education"/);
const feedUiSource = readFileSync(path.join(root, "public", "myagapay", "feed.js"), "utf8");
assert.match(feedUiSource, /All[\s\S]*Pinned[\s\S]*Services[\s\S]*Events[\s\S]*Youth[\s\S]*Outreach[\s\S]*Education[\s\S]*General/);
assert.match(feedUiSource, /announcementsForFilter\(value\)\.length/);
assert.match(dashboardSource, /id="communicationsEnabledSwitch"[\s\S]*?onchange="toggleCommunicationsFeature\(this\)"/);
const desktopOrder = [...dashboardSource.matchAll(/class="sidebar-nav-item"[^>]*id="(nav-[^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(
  desktopOrder.slice(desktopOrder.indexOf("nav-stewardship"), desktopOrder.indexOf("nav-text") + 1),
  ["nav-stewardship", "nav-communications", "nav-bookstore", "nav-sacraments", "nav-directory", "nav-text"],
  "Communications must sit directly above Commerce without moving the surrounding desktop items",
);

console.log("PASS - parish announcements expose accurate admin-only reader counts and names alongside safe authoring");
