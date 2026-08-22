import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GROUP_MESSAGE_ATTACHMENT_MAX_BYTES,
  GROUP_MESSAGE_IMAGE_TYPES,
  GROUP_MESSAGE_ATTACHMENT_RETENTION_DAYS,
  GROUP_MESSAGE_VOICE_TYPES,
  GroupMessageAccessError,
  getLatestGroupMessageCatchUp,
  isActiveMinistryMember,
  isActiveMinistryLeader,
  listActiveMinistryGroups,
  listGroupActivity,
  listGroupMessages,
  markGroupMessageRead,
  postGroupMessage,
  purgeExpiredGroupMessages,
  storeGroupMessageAttachment,
  validateGroupMessageAttachmentMetadata,
} from "../src/handlers/donor-groups.js";
import { groupMessagePushExcerpt } from "../src/lib/push-notifications.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE directory_people (
    id TEXT PRIMARY KEY,
    preferred_name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE platform_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE TABLE directory_person_links (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL,
    link_type TEXT NOT NULL,
    external_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE directory_ministries (
    id TEXT PRIMARY KEY,
    parish_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    slug TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    short_description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    display_order INTEGER NOT NULL DEFAULT 100,
    child_participation_policy TEXT NOT NULL DEFAULT 'excluded' CHECK (child_participation_policy = 'excluded')
  );
  CREATE TABLE directory_ministry_leaders (
    id TEXT PRIMARY KEY,
    parish_id TEXT NOT NULL,
    ministry_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE directory_ministry_participants (
    id TEXT PRIMARY KEY,
    parish_id TEXT NOT NULL,
    ministry_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    status TEXT NOT NULL
  );
`);
for (const migration of ["0064_parish_content_reads.sql", "0066_parish_group_messages.sql", "0075_group_message_attachments.sql", "0079_ministry_group_images.sql", "0081_group_message_retention.sql"]) {
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
const env = { AGAPAY_DB: db };
sqlite.exec(`
  INSERT INTO directory_people (id, preferred_name) VALUES
    ('person-leader', 'Maria Leader'),
    ('person-participant', 'Niko Participant'),
    ('person-withdrawn', 'Theo Withdrawn'),
    ('person-outsider', 'Alex Outsider');
  INSERT INTO directory_ministries
    (id, parish_id, display_name, slug, category, short_description, status, display_order)
  VALUES ('ministry-council', 'parish-one', 'Parish Council', 'parish-council', 'committee', 'Council coordination', 'active', 10);
  INSERT INTO directory_ministry_leaders (id, parish_id, ministry_id, person_id, active)
  VALUES ('leader-one', 'parish-one', 'ministry-council', 'person-leader', 1);
  INSERT INTO directory_ministry_participants (id, parish_id, ministry_id, person_id, status)
  VALUES
    ('participant-active', 'parish-one', 'ministry-council', 'person-participant', 'active'),
    ('participant-old', 'parish-one', 'ministry-council', 'person-withdrawn', 'withdrawn');
  INSERT INTO platform_users (id, email, status) VALUES
    ('user-leader', 'leader@example.test', 'active'),
    ('user-participant', 'participant@example.test', 'active');
  INSERT INTO directory_person_links (id, person_id, link_type, external_id, active, created_at) VALUES
    ('link-leader', 'person-leader', 'platform_user', 'user-leader', 1, '2026-01-01T00:00:00Z'),
    ('link-participant', 'person-participant', 'platform_user', 'user-participant', 1, '2026-01-01T00:00:00Z');
`);

assert.equal(await isActiveMinistryMember(env, {
  parishId: "parish-one", ministryId: "ministry-council", personId: "person-leader",
}), true, "an active leader should be authorized without a participant row");
assert.equal(await isActiveMinistryMember(env, {
  parishId: "parish-one", ministryId: "ministry-council", personId: "person-withdrawn",
}), false, "a withdrawn participant's historical row must not authorize access");
assert.equal(await isActiveMinistryMember(env, {
  parishId: "parish-one", ministryId: "ministry-council", personId: "person-outsider",
}), false, "an unaffiliated person must not be authorized");
assert.equal(await isActiveMinistryLeader(env, {
  parishId: "parish-one", ministryId: "ministry-council", personId: "person-leader",
}), true);
assert.equal(await isActiveMinistryLeader(env, {
  parishId: "parish-one", ministryId: "ministry-council", personId: "person-participant",
}), false, "active participation must not grant leader read-receipt visibility");

const leaderGroups = await listActiveMinistryGroups(env, {
  parishId: "parish-one", personId: "person-leader", donorId: "leader@example.test",
});
assert.deepEqual(leaderGroups.map(({ id, role }) => ({ id, role })), [{ id: "ministry-council", role: "leader" }]);
const participantGroups = await listActiveMinistryGroups(env, {
  parishId: "parish-one", personId: "person-participant", donorId: "participant@example.test",
});
assert.deepEqual(participantGroups.map(({ id, role }) => ({ id, role })), [{ id: "ministry-council", role: "participant" }]);

const posted = await postGroupMessage(env, {
  parishId: "parish-one",
  ministryId: "ministry-council",
  personId: "person-leader",
  body: "The council meeting begins at 6:30.",
});
assert.equal(posted.authorName, "Maria Leader", "a leader should be able to post to their group");
let thread = await listGroupMessages(env, {
  parishId: "parish-one", ministryId: "ministry-council", personId: "person-leader", donorId: "leader@example.test",
});
assert.deepEqual(thread.messages.map(({ id }) => id), [posted.id], "a leader should be able to read their group");
assert.equal(thread.unreadCount, 1);
const activity = await listGroupActivity(env, {
  parishId: "parish-one", personId: "person-leader", donorId: "leader@example.test",
});
assert.equal(activity.unreadCount, 1);
assert.deepEqual(activity.activity.map(({ id, ministryName }) => ({ id, ministryName })), [
  { id: posted.id, ministryName: "Parish Council" },
]);

await markGroupMessageRead(env, {
  parishId: "parish-one",
  ministryId: "ministry-council",
  messageId: posted.id,
  personId: "person-leader",
  donorId: "leader@example.test",
});
thread = await listGroupMessages(env, {
  parishId: "parish-one", ministryId: "ministry-council", personId: "person-leader", donorId: "leader@example.test",
});
assert.equal(thread.unreadCount, 0);
assert.equal(thread.messages[0].read, true);

await markGroupMessageRead(env, {
  parishId: "parish-one",
  ministryId: "ministry-council",
  messageId: posted.id,
  personId: "person-participant",
  donorId: "participant@example.test",
});
const catchUp = await getLatestGroupMessageCatchUp(env, {
  parishId: "parish-one",
  ministryId: "ministry-council",
  personId: "person-leader",
});
assert.equal(catchUp.latestMessage.id, posted.id);
assert.equal(catchUp.memberCount, 2);
assert.equal(catchUp.caughtUpCount, 2);
assert.deepEqual(catchUp.members.map(({ displayName, role, caughtUp }) => ({ displayName, role, caughtUp })), [
  { displayName: "Maria Leader", role: "leader", caughtUp: true },
  { displayName: "Niko Participant", role: "participant", caughtUp: true },
]);
await assert.rejects(
  () => getLatestGroupMessageCatchUp(env, {
    parishId: "parish-one",
    ministryId: "ministry-council",
    personId: "person-participant",
  }),
  (error) => error instanceof GroupMessageAccessError && error.status === 403,
  "a regular active participant must be forbidden from individual read visibility"
);

await assert.rejects(
  () => postGroupMessage(env, {
    parishId: "parish-one", ministryId: "ministry-council", personId: "person-leader", body: "   ",
  }),
  (error) => error instanceof GroupMessageAccessError && error.status === 422 && /body is required/i.test(error.message),
  "plain text messages must still require a non-empty body"
);

const voiceMessage = await postGroupMessage(env, {
  parishId: "parish-one",
  ministryId: "ministry-council",
  personId: "person-leader",
  body: "",
  messageType: "voice",
  attachmentUrl: "/api/donor/groups/ministry-council/messages/voice-one/attachment",
  attachmentDurationSeconds: 24,
  messageId: "voice-one",
});
assert.equal(voiceMessage.body, "", "a voice message may stand alone without text");
assert.equal(voiceMessage.messageType, "voice");
assert.equal(voiceMessage.attachmentDurationSeconds, 24);
const storedVoice = sqlite.prepare("SELECT body, message_type, attachment_duration_seconds FROM parish_group_messages WHERE id = 'voice-one'").get();
assert.equal(storedVoice.body, null, "the rebuilt schema must allow a null attachment-message body");
assert.equal(storedVoice.message_type, "voice");
assert.throws(
  () => sqlite.prepare(`
    INSERT INTO parish_group_messages (id, parish_id, ministry_id, author_person_id, body, message_type)
    VALUES ('invalid-message-type', 'parish-one', 'ministry-council', 'person-leader', 'Nope', 'video')
  `).run(),
  /CHECK constraint failed/,
  "the schema must reject message types outside text, voice, and image",
);

const imageMessage = await postGroupMessage(env, {
  parishId: "parish-one",
  ministryId: "ministry-council",
  personId: "person-participant",
  body: "Setup for the parish festival",
  messageType: "image",
  attachmentUrl: "/api/donor/groups/ministry-council/messages/image-one/attachment",
  messageId: "image-one",
});
assert.equal(imageMessage.body, "Setup for the parish festival");
assert.equal(imageMessage.messageType, "image");

assert.equal(GROUP_MESSAGE_ATTACHMENT_MAX_BYTES, 10 * 1024 * 1024);
assert.deepEqual([...GROUP_MESSAGE_VOICE_TYPES.keys()], ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/webm"]);
assert.deepEqual([...GROUP_MESSAGE_IMAGE_TYPES.keys()], ["image/jpeg", "image/png", "image/webp"]);
for (const [messageType, contentType] of [["voice", "audio/webm"], ["image", "image/jpeg"]]) {
  const headers = { "Content-Type": contentType, "Content-Length": String(GROUP_MESSAGE_ATTACHMENT_MAX_BYTES + 1) };
  if (messageType === "voice") headers["X-AGAPAY-Attachment-Duration-Seconds"] = "24";
  const metadata = validateGroupMessageAttachmentMetadata(new Request("https://agapay.test/upload", {
    method: "POST", headers, body: new Uint8Array([1]),
  }), messageType);
  assert.equal(metadata.status, 413, `oversized ${messageType} attachments must fail the Content-Length pre-check`);
}
const browserSizedVoice = validateGroupMessageAttachmentMetadata(new Request("https://agapay.test/upload", {
  method: "POST",
  headers: {
    "Content-Type": "audio/webm;codecs=opus",
    "X-AGAPAY-Attachment-Bytes": "4096",
    "X-AGAPAY-Attachment-Duration-Seconds": "12",
  },
  body: new Uint8Array([1]),
}), "voice");
assert.equal(browserSizedVoice.contentType, "audio/webm", "voice codecs should not prevent WebM validation");
assert.equal(browserSizedVoice.contentLength, 4096, "the browser Blob size should supply R2's fixed upload length");

function chunkedAttachment(chunkCount) {
  const chunk = new Uint8Array(1024 * 1024);
  let sent = 0;
  return new ReadableStream({ pull(controller) { if (sent >= chunkCount) controller.close(); else { sent += 1; controller.enqueue(chunk); } } });
}
const storedAttachmentKeys = new Set();
const deletedAttachmentKeys = [];
const attachmentBucket = {
  async put(key, stream) {
    const reader = stream.getReader();
    let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; }
    storedAttachmentKeys.add(key);
    return { size };
  },
  async delete(key) { storedAttachmentKeys.delete(key); deletedAttachmentKeys.push(key); },
};
globalThis.FixedLengthStream = class TestFixedLengthStream {
  constructor(expectedLength) {
    let bytes = 0;
    const stream = new TransformStream({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > expectedLength) throw new Error("GROUP_MESSAGE_ATTACHMENT_LENGTH_MISMATCH");
        controller.enqueue(chunk);
      },
      flush() {
        if (bytes !== expectedLength) throw new Error("GROUP_MESSAGE_ATTACHMENT_LENGTH_MISMATCH");
      },
    });
    this.readable = stream.readable;
    this.writable = stream.writable;
  }
};
await storeGroupMessageAttachment(attachmentBucket, {
  key: "voice-note", source: chunkedAttachment(1), contentType: "audio/webm", contentLength: 1024 * 1024,
});
assert.equal(storedAttachmentKeys.has("voice-note"), true, "a fixed-length voice note should reach private R2 storage");
await assert.rejects(
  () => storeGroupMessageAttachment(attachmentBucket, {
    key: "oversized-voice", source: chunkedAttachment(3), contentType: "audio/webm", contentLength: 2 * 1024 * 1024, maxBytes: 2 * 1024 * 1024,
  }),
  /GROUP_MESSAGE_ATTACHMENT_TOO_LARGE/
);
assert.equal(storedAttachmentKeys.has("oversized-voice"), false, "a rejected mid-stream upload must not leave an R2 object");
assert.deepEqual(deletedAttachmentKeys, ["oversized-voice"]);

assert.equal(groupMessagePushExcerpt({ messageType: "voice", body: "" }), "🎤 Voice message");
assert.equal(groupMessagePushExcerpt({ messageType: "image", body: "" }), "📷 Photo");
assert.equal(groupMessagePushExcerpt({ messageType: "image", body: "Festival setup" }), "Festival setup");

assert.equal(GROUP_MESSAGE_ATTACHMENT_RETENTION_DAYS, 30);
sqlite.exec(`
  UPDATE parish_group_messages
  SET body = 'Listen before Sunday', created_at = '2026-06-30 23:59:58'
  WHERE id = 'voice-one';
  INSERT INTO parish_group_messages
    (id, parish_id, ministry_id, author_person_id, body, message_type, attachment_url, attachment_duration_seconds, created_at)
  VALUES
    ('expired-text', 'parish-one', 'ministry-council', 'person-leader', 'Old update', 'text', NULL, NULL, '2026-06-01 00:00:00'),
    ('expired-photo', 'parish-one', 'ministry-council', 'person-participant', 'Festival setup', 'image', '/api/donor/groups/ministry-council/messages/expired-photo/attachment', NULL, '2026-06-30 23:59:59'),
    ('retained-photo', 'parish-one', 'ministry-council', 'person-leader', NULL, 'image', '/api/donor/groups/ministry-council/messages/retained-photo/attachment', NULL, '2026-07-02 00:00:00');
  INSERT INTO parish_content_reads (parish_id, content_type, content_id, donor_id, read_at)
  VALUES
    ('parish-one', 'group_message', 'expired-text', 'leader@example.test', '2026-06-01 00:01:00'),
    ('parish-one', 'group_message', 'voice-one', 'leader@example.test', '2026-06-30 23:59:59'),
    ('parish-one', 'group_message', 'expired-photo', 'participant@example.test', '2026-07-01 00:00:00');
`);
const retentionDeletes = [];
const retention = await purgeExpiredGroupMessages({
  AGAPAY_DB: db,
  GROUP_MESSAGE_ASSETS: {
    async delete(keys) { retentionDeletes.push(...(Array.isArray(keys) ? keys : [keys])); },
  },
}, "2026-08-01T00:00:00Z");
assert.deepEqual(retention, {
  attachmentsPurged: 2,
  batches: 1,
  complete: true,
  cutoff: "2026-07-02 00:00:00",
});
assert.deepEqual(retentionDeletes, [
  "group-messages/parish-one/ministry-council/voice-one",
  "group-messages/parish-one/ministry-council/expired-photo",
]);
const expiredRows = sqlite.prepare(`
  SELECT id, author_person_id, body, message_type, attachment_url, attachment_duration_seconds, created_at
  FROM parish_group_messages WHERE id IN ('expired-photo', 'expired-text', 'voice-one') ORDER BY id
`).all().map((row) => ({ ...row }));
assert.deepEqual(expiredRows, [
  {
    id: "expired-photo", author_person_id: "person-participant", body: "Photo (no longer available)",
    message_type: "image", attachment_url: null, attachment_duration_seconds: null, created_at: "2026-06-30 23:59:59",
  },
  {
    id: "expired-text", author_person_id: "person-leader", body: "Old update",
    message_type: "text", attachment_url: null, attachment_duration_seconds: null, created_at: "2026-06-01 00:00:00",
  },
  {
    id: "voice-one", author_person_id: "person-leader", body: "Voice message (no longer available)",
    message_type: "voice", attachment_url: null, attachment_duration_seconds: null, created_at: "2026-06-30 23:59:58",
  },
], "the sweep must preserve text, sender, timestamp, and attachment message rows while replacing expired media");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM parish_content_reads WHERE content_id IN ('expired-text', 'expired-photo', 'voice-one')").get().count, 3, "attachment expiry must not alter read receipts");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM parish_group_messages WHERE id = 'retained-photo'").get().count, 1, "a message exactly 30 days old must be retained until it becomes older than the cutoff");
const retainedThread = await listGroupMessages(env, {
  parishId: "parish-one", ministryId: "ministry-council", personId: "person-leader", donorId: "leader@example.test",
});
const expiredVoiceInThread = retainedThread.messages.find(({ id }) => id === "voice-one");
assert.deepEqual({
  body: expiredVoiceInThread.body,
  attachmentUrl: expiredVoiceInThread.attachmentUrl,
  attachmentDurationSeconds: expiredVoiceInThread.attachmentDurationSeconds,
  authorName: expiredVoiceInThread.authorName,
  createdAt: expiredVoiceInThread.createdAt,
  read: expiredVoiceInThread.read,
}, {
  body: "Voice message (no longer available)",
  attachmentUrl: "",
  attachmentDurationSeconds: null,
  authorName: "Maria Leader",
  createdAt: "2026-06-30 23:59:58",
  read: true,
}, "the conversation API must preserve the expired voice message and its read state");
const secondRetention = await purgeExpiredGroupMessages({
  AGAPAY_DB: db,
  GROUP_MESSAGE_ASSETS: {
    async delete(keys) { retentionDeletes.push(...(Array.isArray(keys) ? keys : [keys])); },
  },
}, "2026-08-01T00:00:00Z");
assert.equal(secondRetention.attachmentsPurged, 0, "a second sweep must be a no-op once attachment URLs are cleared");
assert.equal(secondRetention.batches, 0);
assert.equal(retentionDeletes.length, 2, "a second sweep must not retry already-purged R2 objects");

for (const personId of ["person-withdrawn", "person-outsider"]) {
  await assert.rejects(
    () => listGroupMessages(env, {
      parishId: "parish-one", ministryId: "ministry-council", personId, donorId: `${personId}@example.test`,
    }),
    (error) => error instanceof GroupMessageAccessError && error.status === 403,
    `${personId} should receive a forbidden response when reading`
  );
  await assert.rejects(
    () => postGroupMessage(env, {
      parishId: "parish-one", ministryId: "ministry-council", personId, body: "Unauthorized message",
    }),
    (error) => error instanceof GroupMessageAccessError && error.status === 403,
    `${personId} should receive a forbidden response when posting`
  );
}

const ministryMigration = readFileSync(path.join(root, "migrations", "0031_directory_ministries_phase5a.sql"), "utf8");
assert.match(ministryMigration, /CHECK \(child_participation_policy = 'excluded'\)/, "ministry child participation must remain excluded by schema");
const handlerSource = readFileSync(path.join(root, "src", "handlers", "donor-groups.js"), "utf8");
const koinoniaAccessSource = readFileSync(path.join(root, "src", "handlers", "koinonia-access.js"), "utf8");
assert.match(handlerSource, /import \{ getReadContentIds, getReadReceipts, markContentRead \} from "\.\.\/lib\/content-reads\.js"/);
assert.match(handlerSource, /const CONTENT_TYPE = "group_message"/);
assert.match(handlerSource, /mp\.status = 'active'/);
assert.match(handlerSource, /ml\.active = 1/);
assert.match(handlerSource, /Only active ministry leaders can view member read status/);
assert.match(handlerSource, /verifiedHouseholdAccess\(request, env\)/);
assert.match(koinoniaAccessSource, /if \(!donor\?\.email\)[\s\S]*authentication_required[\s\S]*if \(!user\?\.id\)[\s\S]*donor account is not linked to a parish member profile/,
  "a valid donor without a platform identity must be forbidden without being treated as signed out");
assert.match(handlerSource, /isActivityRequest[\s\S]*available: false, activity: \[\], unreadCount: 0/,
  "the Parish Life activity rollup must tolerate accounts that do not have Groups access");
assert.equal((handlerSource.match(/parish_content_reads/g) || []).length, 0, "attachment retention must never alter shared read receipts");
assert.match(handlerSource, /parts\.length === 2 && parts\[1\] === "image"/, "ministry images must have a member-authenticated delivery route");
const groupsUiSource = readFileSync(path.join(root, "public", "myagapay", "groups.js"), "utf8");
const donorStylesSource = readFileSync(path.join(root, "public", "donor", "style.css"), "utf8");
assert.match(groupsUiSource, /ministryGroupAvatar\(group/, "group images must surface beside ministry names in the chat list and header");
const ministryServiceSource = readFileSync(path.join(root, "src", "directory", "ministries.js"), "utf8");
assert.match(ministryServiceSource, /DELETE FROM parish_content_reads[\s\S]*DELETE FROM parish_group_messages[\s\S]*DELETE FROM directory_ministries/, "ministry deletion must erase read receipts and messages before the group record");
const directoryAdminSource = readFileSync(path.join(root, "src", "handlers", "directory-admin.js"), "utf8");
assert.match(directoryAdminSource, /purgeMinistryAssets[\s\S]*GROUP_MESSAGE_ASSETS\.list\(\{ prefix, cursor \}\)/, "ministry deletion must purge every stored group attachment under its private prefix");
assert.match(directoryAdminSource, /request\.method === "DELETE" && !collection[\s\S]*deleteMinistry[\s\S]*purgeMinistryAssets/, "the parish API must expose authenticated permanent ministry deletion");
assert.match(groupsUiSource, /group\.role === "leader" \? `<button[^`]+Who’s caught up/);
assert.match(groupsUiSource, /\/caught-up`/);
assert.match(groupsUiSource, /navigator\.mediaDevices\?\.getUserMedia/);
assert.match(groupsUiSource, /new MediaRecorder/);
assert.match(groupsUiSource, /decodeAudioData/);
assert.match(groupsUiSource, /data-group-photo/);
assert.match(groupsUiSource, /group-attachment-expired/, "expired attachments must render as text instead of broken media controls");
assert.match(groupsUiSource, /Conversation history remains available/, "the UI must describe attachment-only retention accurately");
assert.match(groupsUiSource, /is-outgoing/);
assert.match(groupsUiSource, /X-AGAPAY-Attachment-Duration-Seconds/);
assert.match(groupsUiSource, /X-AGAPAY-Attachment-Bytes/, "the browser must declare the Blob size for fixed-length R2 streaming");
assert.match(groupsUiSource, /group-thread-back[\s\S]*closeMinistryGroup/, "an open ministry conversation should provide an app-style back control");
assert.match(groupsUiSource, /classList\.toggle\("is-group-thread-open"/, "opening a ministry should activate the full-screen conversation state");
assert.match(groupsUiSource, /syncGroupThreadUrl\(groupId\)/, "the selected ministry should remain addressable while the conversation is open");
assert.match(donorStylesSource, /\.donor-groups-page\.is-group-thread-open \.koinonia-mobile-appbar,[\s\S]*display: none !important/, "the mobile app bar must not push the composer below the locked conversation viewport");
assert.match(donorStylesSource, /\.donor-groups-page\.is-group-thread-open \.content \{[\s\S]*?height: 100%;[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;[\s\S]*?padding: 0;/, "the open conversation must use exactly one viewport and leave scrolling to the message list");
assert.match(donorStylesSource, /\.donor-groups-page\.is-group-thread-open \.group-message-list \{[\s\S]*?min-height: 0;[\s\S]*?flex: 1 1 auto;[\s\S]*?overflow-y: auto;/, "messages must remain independently scrollable above the composer");
const wranglerSource = readFileSync(path.join(root, "wrangler.toml"), "utf8");
assert.match(wranglerSource, /binding = "GROUP_MESSAGE_ASSETS"[\s\S]*?bucket_name = "agapay-group-message-assets"/);
assert.doesNotMatch(wranglerSource, /GROUP_MESSAGE_ASSETS_URL/, "the private group bucket must not expose an r2.dev URL");
const workerSource = readFileSync(path.join(root, "src", "worker.js"), "utf8");
assert.match(workerSource, /purgeExpiredGroupMessages\(env, event\.scheduledTime\)/, "the daily Worker cron must enforce 30-day attachment retention");

console.log("PASS - group messages keep individual catch-up visibility leader-only and use shared read receipts");
