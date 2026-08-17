#!/usr/bin/env node
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { exchangeEnabledFor, prayerRequestsEnabledFor, signupsEnabledFor } from "../src/lib/entitlements.js";
import { claimSignupSlot, deleteSheet, deleteSlot, listSignupInboxActions, listUpcomingSignupCommitments, requestSignupCoverage, SignupAccessError, updateSheet, updateSlot } from "../src/handlers/koinonia-signups.js";
import { completeExchangeListing, expireKoinoniaExchangeListings, ExchangeAccessError, uploadListingPhoto } from "../src/handlers/koinonia-exchange.js";
import { getCommunityToolBadgeCounts, markCommunityToolOpened } from "../src/handlers/koinonia-community-tools.js";

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
  const AGAPAY_DB = {
    prepare,
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { AGAPAY_DB, DB: AGAPAY_DB, AGAPAY_ENVIRONMENT: "test" };
}

assert.equal(signupsEnabledFor({ subscriptionTier: "parish" }), true);
assert.equal(exchangeEnabledFor({ subscriptionTier: "parish" }), true);
assert.equal(signupsEnabledFor({ subscriptionTier: "parish", signupsEnabled: false }), false);
assert.equal(exchangeEnabledFor({ subscriptionTier: "parish", exchangeEnabled: false }), false);
assert.equal(signupsEnabledFor({ subscriptionTier: "parish", communicationsEnabled: false }), false);
assert.equal(exchangeEnabledFor({ subscriptionTier: "stewardship" }), false);
assert.equal(prayerRequestsEnabledFor({ subscriptionTier: "parish" }), true);
assert.equal(prayerRequestsEnabledFor({ subscriptionTier: "parish", prayerRequestsEnabled: false }), false);
assert.equal(prayerRequestsEnabledFor({ subscriptionTier: "parish", communicationsEnabled: false }), false);

const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON;");
sqlite.exec(`
  CREATE TABLE directory_change_requests (
    parish_id TEXT, target_id TEXT, requester_user_id TEXT, request_type TEXT,
    status TEXT, requested_payload_json TEXT
  );
  CREATE TABLE directory_person_links (person_id TEXT, link_type TEXT, external_id TEXT, active INTEGER);
  CREATE TABLE directory_people (id TEXT PRIMARY KEY, parish_id TEXT, preferred_name TEXT);
  CREATE TABLE directory_household_members (person_id TEXT, household_id TEXT, active INTEGER);
  CREATE TABLE directory_households (id TEXT, parish_id TEXT, active INTEGER);
  CREATE TABLE directory_household_admins (household_id TEXT, person_id TEXT, active INTEGER);
  CREATE TABLE directory_publication_profiles (
    parish_id TEXT, owner_type TEXT, owner_id TEXT, active INTEGER,
    approved_at INTEGER, approval_status TEXT, status TEXT
  );
  CREATE TABLE directory_parish_settings (
    parish_id TEXT, household_verification_interval_days INTEGER,
    reconfirmation_interval_days INTEGER
  );
  CREATE TABLE directory_household_verifications (
    household_id TEXT PRIMARY KEY, parish_id TEXT, verification_status TEXT,
    verification_due_at INTEGER, last_verified_at INTEGER, verification_started_at INTEGER,
    verified_by_user_id TEXT, verification_policy_version TEXT, created_at INTEGER, updated_at INTEGER
  );
`);
sqlite.exec(read("migrations/0091_directory_onboarding_household_verification_backfill.sql"));
sqlite.exec("CREATE TABLE directory_ministries (id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, display_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', category TEXT);");
sqlite.exec("CREATE TABLE directory_ministry_leaders (parish_id TEXT, ministry_id TEXT, person_id TEXT, assignment_type TEXT, active INTEGER);");
sqlite.exec("CREATE TABLE directory_ministry_participants (parish_id TEXT, ministry_id TEXT, person_id TEXT, status TEXT);");
sqlite.exec(read("migrations/0092_koinonia_signups_and_exchange.sql"));
sqlite.exec(read("migrations/0093_ministry_workspace.sql"));
sqlite.exec(read("migrations/0094_koinonia_community_tool_views.sql"));
sqlite.exec(read("migrations/0097_koinonia_prayer_requests.sql"));

const env = d1Environment(sqlite);
const now = Date.now();
sqlite.prepare("INSERT INTO directory_people (id, parish_id, preferred_name) VALUES (?, ?, ?)")
  .run("person-1", "st-fiacre", "Maria");
sqlite.prepare("INSERT INTO directory_ministries (id, parish_id, display_name) VALUES (?, ?, ?)")
  .run("ministry-meals", "st-fiacre", "Hospitality");
sqlite.prepare("INSERT INTO directory_ministry_leaders (parish_id, ministry_id, person_id, assignment_type, active) VALUES (?, ?, ?, 'leader', 1)")
  .run("st-fiacre", "ministry-meals", "person-1");
sqlite.prepare(`INSERT INTO koinonia_signup_sheets
  (id, parish_id, ministry_id, title, category, status, visibility,
   created_by_person_id, updated_by_person_id, created_at, updated_at, published_at)
  VALUES (?, ?, ?, ?, 'meal_train', 'open', 'parish_members', ?, ?, ?, ?, ?)`)
  .run("sheet-1", "st-fiacre", "ministry-meals", "Meal train", "leader-1", "leader-1", now, now, now);
sqlite.prepare(`INSERT INTO koinonia_signup_slots
  (id, sheet_id, parish_id, label, needed_count, display_order, created_at, updated_at)
  VALUES (?, ?, ?, ?, 1, 100, ?, ?)`)
  .run("slot-1", "sheet-1", "st-fiacre", "Tuesday supper", now, now);

const claimContext = { parishId: "st-fiacre", householdId: "household-1", personId: "person-1", donorId: "one@example.org" };
const claimed = await claimSignupSlot(new Request("https://agapay.test/claim", { method: "POST", body: JSON.stringify({ comment:"Vegetable lasagna" }), headers: { "Content-Type": "application/json" } }), env, null, claimContext, "slot-1");
assert.equal(claimed.ok, true);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM koinonia_signup_entries WHERE slot_id = ? AND status = 'confirmed'").get("slot-1").n, 1);
assert.equal(sqlite.prepare("SELECT comment FROM koinonia_signup_entries WHERE id = ?").get(claimed.entryId).comment, "Vegetable lasagna", "claim details must reach the ministry signup entry");
await assert.rejects(
  claimSignupSlot(new Request("https://agapay.test/claim", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }), env, null, { ...claimContext, personId: "person-2", donorId: "two@example.org" }, "slot-1"),
  (error) => error instanceof SignupAccessError && error.status === 409 && /full/i.test(error.message),
  "a single atomic INSERT ... SELECT must prevent claims beyond needed_count",
);

sqlite.prepare(`INSERT INTO koinonia_signup_slots
  (id, sheet_id, parish_id, label, needed_count, slot_date, display_order, created_at, updated_at)
  VALUES ('slot-upcoming', 'sheet-1', 'st-fiacre', 'Coffee setup', 2, 6000, 110, ?, ?),
         ('slot-too-late', 'sheet-1', 'st-fiacre', 'Next month', 2, 700000000, 120, ?, ?)`)
  .run(now, now, now, now);
sqlite.prepare(`INSERT INTO koinonia_signup_entries
  (id, slot_id, parish_id, household_id, person_id, status, created_at, updated_at)
  VALUES ('entry-upcoming', 'slot-upcoming', 'st-fiacre', 'household-1', 'person-1', 'confirmed', ?, ?),
         ('entry-too-late', 'slot-too-late', 'st-fiacre', 'household-1', 'person-1', 'confirmed', ?, ?)`)
  .run(now, now, now, now);
const upcoming = await listUpcomingSignupCommitments(env, claimContext, 1000);
assert.deepEqual(upcoming.map((item) => item.entryId), ["entry-upcoming"], "only confirmed commitments within the next seven days should surface");
assert.equal(upcoming[0].sheetTitle, "Meal train");
sqlite.prepare("INSERT INTO koinonia_signup_waitlist (id, parish_id, slot_id, person_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'offered', ?, ?)")
  .run("waitlist-offer", "st-fiacre", "slot-upcoming", "person-1", now, now);
const inboxActions = await listSignupInboxActions(env, claimContext, 1000);
assert.deepEqual(inboxActions.map((item) => item.kind), ["waitlist"], "only a pertinent offered waitlist spot should surface as an actionable inbox item");
assert.equal(inboxActions[0].slotId, "slot-upcoming");

sqlite.prepare("INSERT INTO directory_ministry_participants (parish_id, ministry_id, person_id, status) VALUES (?, ?, ?, 'active')")
  .run("st-fiacre", "ministry-meals", "person-2");
const delegatedContext = { ...claimContext, personId:"person-2", donorId:"two@example.org" };
const coverage = await requestSignupCoverage(new Request("https://agapay.test/coverage", { method:"POST", body:JSON.stringify({ note:"I will be out of town for work." }), headers:{ "Content-Type":"application/json" } }), env, null, claimContext, "entry-upcoming");
assert.equal(coverage.recipientCount, 1, "the coverage request must target assigned ministry teammates");
assert.equal(sqlite.prepare("SELECT note FROM koinonia_signup_coverage_requests WHERE id = ?").get(coverage.coverageRequestId).note, "I will be out of town for work.");
const coverageInbox = await listSignupInboxActions(env, delegatedContext, 1000);
assert.equal(coverageInbox[0].kind, "coverage");
assert.equal(coverageInbox[0].reason, "I will be out of town for work.", "the reason must reach the assigned ministry member's actionable inbox");
const updatedCoverage = await requestSignupCoverage(new Request("https://agapay.test/coverage", { method:"POST", body:JSON.stringify({ note:"Travel plans changed; I am away all weekend." }), headers:{ "Content-Type":"application/json" } }), env, null, claimContext, "entry-upcoming");
assert.equal(updatedCoverage.coverageRequestId, coverage.coverageRequestId, "re-submitting coverage must update the existing open request instead of duplicating it");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM koinonia_signup_coverage_requests WHERE entry_id = ? AND status = 'open'").get("entry-upcoming").count, 1);
await updateSheet(new Request("https://agapay.test/sheet", { method:"PATCH", body:JSON.stringify({ title:"Coffee hour helpers", category:"volunteer", description:"Serve together" }), headers:{ "Content-Type":"application/json" } }), env, delegatedContext, "sheet-1");
assert.deepEqual(
  { ...sqlite.prepare("SELECT title, category, description FROM koinonia_signup_sheets WHERE id = 'sheet-1'").get() },
  { title:"Coffee hour helpers", category:"volunteer", description:"Serve together" },
  "any active ministry assignee can edit the signup form from the group workspace",
);
sqlite.prepare("INSERT INTO directory_ministry_participants (parish_id, ministry_id, person_id, status) VALUES (?, ?, ?, 'inactive')")
  .run("st-fiacre", "ministry-meals", "person-3");
await assert.rejects(
  updateSheet(new Request("https://agapay.test/sheet", { method:"PATCH", body:JSON.stringify({ title:"Should fail", category:"general" }), headers:{ "Content-Type":"application/json" } }), env, { ...claimContext, personId:"person-3" }, "sheet-1"),
  (error) => error instanceof SignupAccessError && error.status === 403,
  "an inactive or removed ministry assignment must not retain signup-management access",
);
await updateSlot(new Request("https://agapay.test/slot", { method:"PATCH", body:JSON.stringify({ label:"Coffee setup team", neededCount:2, slotDate:6000, notes:"Arrive early" }), headers:{ "Content-Type":"application/json" } }), env, claimContext, "slot-upcoming");
assert.equal(sqlite.prepare("SELECT label FROM koinonia_signup_slots WHERE id = 'slot-upcoming'").get().label, "Coffee setup team");
sqlite.prepare(`INSERT INTO koinonia_signup_slots (id, sheet_id, parish_id, label, needed_count, display_order, created_at, updated_at) VALUES ('slot-empty-delete', 'sheet-1', 'st-fiacre', 'Empty', 1, 999, ?, ?)`)
  .run(now, now);
await deleteSlot(env, claimContext, "slot-empty-delete");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM koinonia_signup_slots WHERE id = 'slot-empty-delete'").get().n, 0);
await assert.rejects(deleteSlot(env, claimContext, "slot-upcoming"), (error) => error instanceof SignupAccessError && error.status === 409, "a slot with commitments must not be deleted");
sqlite.prepare(`INSERT INTO koinonia_signup_sheets (id, parish_id, ministry_id, title, category, status, visibility, created_by_person_id, updated_by_person_id, created_at, updated_at) VALUES ('sheet-empty-delete', 'st-fiacre', 'ministry-meals', 'Empty draft', 'general', 'draft', 'parish_members', 'person-1', 'person-1', ?, ?)`)
  .run(now, now);
await deleteSheet(env, claimContext, "sheet-empty-delete");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM koinonia_signup_sheets WHERE id = 'sheet-empty-delete'").get().n, 0);
await assert.rejects(deleteSheet(env, claimContext, "sheet-1"), (error) => error instanceof SignupAccessError && error.status === 409, "a form with commitments must not be deleted");

sqlite.prepare(`INSERT INTO koinonia_exchange_listings
  (id, parish_id, posted_by_person_id, listing_type, category, title, status, created_at, updated_at)
  VALUES (?, ?, ?, 'offer', 'books', ?, 'active', ?, ?)`)
  .run("listing-complete", "st-fiacre", "poster-1", "Books", now, now);
for (const requester of ["requester-1", "requester-2"]) {
  sqlite.prepare(`INSERT INTO koinonia_exchange_threads
    (id, listing_id, parish_id, requester_person_id, status, created_at, updated_at)
    VALUES (?, 'listing-complete', 'st-fiacre', ?, 'open', ?, ?)`)
    .run(`thread-${requester}`, requester, now, now);
}
const completion = await completeExchangeListing(env, { parishId: "st-fiacre", personId: "poster-1" }, "listing-complete");
assert.equal(completion.threadsClosed, 2);
assert.equal(sqlite.prepare("SELECT status FROM koinonia_exchange_listings WHERE id = ?").get("listing-complete").status, "completed");
assert.deepEqual(
  sqlite.prepare("SELECT status, closed_reason FROM koinonia_exchange_threads WHERE listing_id = ? ORDER BY id").all("listing-complete").map((row) => ({ ...row })),
  [
    { status: "closed", closed_reason: "listing_completed" },
    { status: "closed", closed_reason: "listing_completed" },
  ],
  "completing a listing must close every open thread in the same D1 batch",
);

sqlite.prepare(`INSERT INTO koinonia_exchange_listings
  (id, parish_id, posted_by_person_id, listing_type, category, title, status, expires_at, created_at, updated_at)
  VALUES ('listing-expired', 'st-fiacre', 'poster-1', 'request', 'tools', 'Borrow a drill', 'active', 500, 100, 100),
         ('listing-current', 'st-fiacre', 'poster-1', 'offer', 'tools', 'Toolbox', 'active', 5000, 100, 100)`)
  .run();
const expiry = await expireKoinoniaExchangeListings(env, 1000);
assert.equal(expiry.expired, 1);
assert.equal(sqlite.prepare("SELECT status FROM koinonia_exchange_listings WHERE id = 'listing-expired'").get().status, "expired");
assert.equal(sqlite.prepare("SELECT status FROM koinonia_exchange_listings WHERE id = 'listing-current'").get().status, "active");

sqlite.prepare(`INSERT INTO koinonia_exchange_listings
  (id, parish_id, posted_by_person_id, listing_type, category, title, status, created_at, updated_at)
  VALUES ('listing-request-art', 'st-fiacre', 'person-1', 'request', 'tools', 'Need a ladder', 'active', 0, 0)`)
  .run();
await assert.rejects(
  uploadListingPhoto(new Request("https://agapay.test/photo", { method:"POST" }), { ...env, GROUP_MESSAGE_ASSETS:{} }, claimContext, "listing-request-art"),
  (error) => error instanceof ExchangeAccessError && error.status === 422 && /AGAPAY artwork/i.test(error.message),
  "request listings must use branded artwork and reject item-photo uploads on the server",
);

sqlite.prepare(`INSERT INTO koinonia_exchange_listings
  (id, parish_id, posted_by_person_id, listing_type, category, title, status, created_at, updated_at)
  VALUES ('listing-badge', 'st-fiacre', 'poster-1', 'offer', 'books', 'Fresh books', 'active', ?, ?)`)
  .run(now, now);
sqlite.prepare(`INSERT INTO koinonia_prayer_requests
  (id, parish_id, submitted_by_person_id, body, visibility, status, created_at, updated_at, published_at, expires_at)
  VALUES ('prayer-badge', 'st-fiacre', 'person-1', 'Please pray for a family in need.', 'parish_members', 'active', ?, ?, ?, ?)`)
  .run(now, now, now, now + 86400000);
assert.deepEqual(
  await getCommunityToolBadgeCounts(env, claimContext, { signups:true, exchange:true, prayers:true }, now + 1000),
  { signups:1, exchange:1, prayers:1 },
  "each Community Tool badge must count only currently published content newer than that page's own last-open timestamp",
);
await markCommunityToolOpened(env, claimContext, "signups", now + 1);
assert.deepEqual(
  await getCommunityToolBadgeCounts(env, claimContext, { signups:true, exchange:true, prayers:true }, now + 1000),
  { signups:0, exchange:1, prayers:1 },
  "opening Signups must clear only the Signups badge",
);
await markCommunityToolOpened(env, claimContext, "exchange", now + 1);
assert.deepEqual(
  await getCommunityToolBadgeCounts(env, claimContext, { signups:true, exchange:true, prayers:true }, now + 1000),
  { signups:0, exchange:0, prayers:1 },
  "opening Exchange must clear its own badge without relying on general notification state",
);
await markCommunityToolOpened(env, claimContext, "prayers", now + 1);
assert.deepEqual(
  await getCommunityToolBadgeCounts(env, claimContext, { signups:true, exchange:true, prayers:true }, now + 1000),
  { signups:0, exchange:0, prayers:0 },
  "opening Prayer Requests must clear only the prayer badge",
);
sqlite.prepare(`INSERT INTO koinonia_signup_sheets
  (id, parish_id, ministry_id, title, category, status, visibility, created_by_person_id,
   updated_by_person_id, created_at, updated_at, published_at)
  VALUES ('sheet-newly-published', 'st-fiacre', 'ministry-meals', 'Festival helpers', 'event',
    'open', 'parish_members', 'person-1', 'person-1', ?, ?, ?)`)
  .run(now + 2, now + 2, now + 2);
assert.equal(
  (await getCommunityToolBadgeCounts(env, claimContext, { signups:true, exchange:true, prayers:true }, now + 1000)).signups,
  1,
  "a newly published form must restore the Signups badge even after older forms were cleared",
);

const sources = {
  worker: read("src/worker.js"),
  signups: read("src/handlers/koinonia-signups.js"),
  exchange: read("src/handlers/koinonia-exchange.js"),
  pushes: read("src/lib/push-notifications.js"),
  shell: read("public/myagapay-shell.js"),
  parishDashboard: read("public/parish/dashboard.html"),
  parishApp: read("public/parish/app.js"),
  signupsPage: read("public/myagapay/signups.html"),
  signupsClient: read("public/myagapay/signups.js"),
  exchangePage: read("public/myagapay/exchange.html"),
  parishLife: read("public/myagapay/parish-life.js"),
  groups: read("public/myagapay/groups.js"),
};
assert.match(sources.signups, /signupsEnabledFor\(found\.registration\)/);
assert.match(sources.exchange, /exchangeEnabledFor\(found\.registration\)/);
assert.match(sources.signups, /const CONTENT_TYPE = "signup_slot"/);
assert.match(sources.exchange, /const CONTENT_TYPE = "exchange_message"/);
assert.match(sources.exchange, /exchangePhotoStorageKey[\s\S]*GROUP_MESSAGE_ASSETS/);
assert.match(sources.pushes, /sendSignupReminderPush[\s\S]*sendExchangeMessagePush/);
assert.match(sources.pushes, /sendSignupPublishedPush[\s\S]*sendExchangeListingPush/);
assert.match(sources.parishLife, /\/api\/donor\/koinonia\/community-tools\/badges/);
assert.match(sources.parishLife, /data-community-tool-badge="signups"[\s\S]*data-community-tool-badge="exchange"[\s\S]*data-community-tool-badge="prayers"/);
assert.match(sources.signupsClient, /community-tools\/signups\/opened/);
assert.match(read("public/myagapay/exchange.js"), /community-tools\/exchange\/opened/);
assert.match(sources.worker, /koinonia_exchange_expiry_sweep[\s\S]*expireKoinoniaExchangeListings/);
assert.match(sources.worker, /\/api\/donor\/koinonia\/signups/);
assert.match(sources.worker, /\/api\/donor\/koinonia\/exchange/);
assert.match(sources.shell, /parishFeature: "signupsEnabled"/);
assert.match(sources.shell, /parishFeature: "exchangeEnabled"/);
assert.match(sources.shell, /parishFeature: "prayerRequestsEnabled"/);
assert.match(sources.parishDashboard, /id="signupsEnabledSwitch"[\s\S]*id="exchangeEnabledSwitch"[\s\S]*id="prayerRequestsEnabledSwitch"/);
assert.match(sources.parishApp, /JSON\.stringify\(\{ \[field\]: enabled \}\)/);
assert.match(sources.signupsPage, /Koinonia[\s\S]*Signups/);
assert.match(sources.signupsPage, /id="signupActionDialog"[\s\S]*id="signupActionText"/, "signup details and coverage reasons must use an accessible modal");
assert.match(sources.signupsPage, /myagapay-shell\.js\?v=20260817appmenu2/, "Parish Signups must load the current unified app navigation shell");
assert.match(sources.signupsClient, /JSON\.stringify\(\{ comment \}\)/, "claim details must be sent to the signup API");
assert.doesNotMatch(sources.signupsClient, /window\.prompt/, "coverage requests must not use a browser prompt");
assert.match(sources.parishLife, /\/api\/donor\/koinonia\/signups\/upcoming/);
assert.match(sources.parishLife, /Signup ·/);
assert.match(sources.groups, /\["overview","Overview"\]/);
assert.match(sources.groups, /\["messages","Messages"\]/);
assert.match(sources.groups, /\["signups","Signups"\]/);
assert.match(sources.groups, /\["schedule","Schedule"\]/);
assert.match(sources.groups, /\["members","Members"\]/);
assert.match(sources.groups, /\["resources","Resources"\]/);
assert.match(sources.groups, /Create a signup form/);
assert.match(sources.groups, /Delete form/);
assert.match(read("public/donor/style.css"), /\.group-workspace-tabs button \{[^}]*border:1px solid var\(--k-border\)/, "Messages and Signups must look like actionable buttons");
assert.doesNotMatch(sources.signupsPage, /New signup sheet|Create a signup sheet/, "leader authoring belongs in ministry Groups, not the parish signup browser");
assert.match(sources.exchangePage, /AGAPAY does not process payments in Parish Exchange/);
assert.match(sources.exchangePage, /id="exchangePhotos"[\s\S]*id="exchangeCameraPhoto"[\s\S]*capture="environment"/, "offers must expose gallery and Android camera photo choices");
assert.match(sources.exchangePage, /id="exchangeDraftPhotoGrid"[\s\S]*id="exchangeRequestArtwork"/, "the composer must preview offer photos and explain request artwork");
assert.match(read("public/myagapay/exchange.js"), /listing\.listingType === "request"[\s\S]*\/images\/app\/icon-512\.png/, "request cards and details must use the same AGAPAY artwork as media players");
assert.match(read("public/myagapay/exchange.js"), /addPhotosToExchangeListing[\s\S]*Uploading photo/, "offer owners must be able to retry or add photos after publishing");
assert.match(read("public/donor/style.css"), /\.exchange-draft-photo-grid/, "offer photo previews must have an intentional responsive presentation");
assert.match(read("public/donor/style.css"), /\.exchange-photo-frame\.is-request-art/, "request artwork must have an intentional responsive presentation");
assert.doesNotMatch(sources.exchange, /stripe|checkout|payment_intent/i, "Exchange handler must remain separate from payment and marketplace code");

console.log("PASS - Koinonia Signups and Exchange schema, feature gates, atomic claims/completion, expiry, private photos, reads, pushes, routes, and UI are wired");
