import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  addHouseholdAdmin,
  addHouseholdMember,
  addParishAffiliation,
  completeDirectoryMediaUpload,
  createDirectoryMediaUploadSession,
  createHousehold,
  createPerson,
  DirectoryServiceError,
  getCurrentDirectoryMediaForOwner,
  linkExternalIdentity,
  removeDirectoryMedia,
  resolveDirectorySelfServiceContext,
  setPersonPrivacyFlags,
  streamDirectoryMediaVariant,
  submitDirectoryMediaForReview,
  validateCrop,
  validateDirectoryImageUpload
} from "../src/directory/index.js";
import { handleDirectoryMedia } from "../src/handlers/directory-media.js";
import { ensurePlatformUser, issuePlatformUserSession, PLATFORM_USER_EMAIL_HEADER } from "../src/lib/identity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

function migration(name) {
  return readFileSync(path.join(repoRoot, "migrations", name), "utf8");
}

class FakeR2Bucket {
  constructor() {
    this.objects = new Map();
  }
  async put(key, body, options = {}) {
    this.objects.set(key, {
      body: body instanceof ArrayBuffer ? new Uint8Array(body) : body,
      httpMetadata: options.httpMetadata || {}
    });
  }
  async get(key) {
    const object = this.objects.get(key);
    if (!object) return null;
    return { body: object.body, httpMetadata: object.httpMetadata };
  }
  async delete(key) {
    this.objects.delete(key);
  }
}

function makeD1Env() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(migration("0014_audit_log.sql"));
  db.exec(migration("0020_platform_identity.sql"));
  db.exec(migration("0022_directory_canonical_foundation.sql"));
  db.exec(migration("0023_directory_contact_privacy_publication.sql"));
  db.exec(migration("0024_directory_invitations_claims.sql"));
  db.exec(migration("0025_directory_self_service_phase2a.sql"));
  db.exec(migration("0026_directory_media_phase2b.sql"));
  db.exec(migration("0028_directory_media_secure_transformation.sql"));

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

  const AGAPAY_DB = {
    prepare: (sql) => wrap(sql),
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };
  return { env: { AGAPAY_DB, DIRECTORY_MEDIA: new FakeR2Bucket(), AGAPAY_ENVIRONMENT: "test" }, db };
}

function actor(parishId = "st-fiacre", capabilities = ["directory.manage"], personId = "") {
  return { userId: `admin_${parishId}`, parishId, capabilities, personId };
}

function png1x1() {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82
  ]).buffer;
}

function file(name = "photo.png", type = "image/png", buffer = png1x1()) {
  return { name, type, arrayBuffer: async () => buffer };
}

async function fixture() {
  const { env, db } = makeD1Env();
  const admin = actor();
  const user = await ensurePlatformUser(env, { email: "anna@example.org", displayName: "Anna Dunn" });
  const session = await issuePlatformUserSession(env, user.id);
  const adult = await createPerson(env, { actor: admin, preferredName: "Anna Dunn", biologicalSex: "female" });
  const spouse = await createPerson(env, { actor: admin, preferredName: "John Dunn", biologicalSex: "male" });
  const child = await createPerson(env, { actor: admin, preferredName: "Maria Dunn", biologicalSex: "female" });
  const household = await createHousehold(env, { actor: admin, displayName: "The Dunn Household" });
  await addHouseholdMember(env, { actor: admin, householdId: household.id, personId: adult.id, relationship: "head" });
  await addHouseholdMember(env, { actor: admin, householdId: household.id, personId: spouse.id, relationship: "spouse" });
  await addHouseholdMember(env, { actor: admin, householdId: household.id, personId: child.id, relationship: "child" });
  await addHouseholdAdmin(env, { actor: admin, householdId: household.id, personId: adult.id });
  await addParishAffiliation(env, { actor: admin, personId: adult.id, status: "member" });
  await addParishAffiliation(env, { actor: admin, personId: spouse.id, status: "member" });
  await linkExternalIdentity(env, { actor: admin, personId: adult.id, linkType: "platform_user", externalId: user.id });
  await setPersonPrivacyFlags(env, { actor: admin, personId: child.id, isChild: true });
  const context = await resolveDirectorySelfServiceContext(env, { user });
  return { env, db, admin, user, session, adult, spouse, child, household, context };
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

function auditCount(db, action) {
  return db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action = ?").get(action).count;
}

await test("migration creates normalized directory media tables only", async () => {
  const { db } = makeD1Env();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  for (const table of ["directory_media_assets", "directory_media_variants", "directory_media_upload_sessions", "directory_media_assignments"]) {
    assert.ok(tables.includes(table));
  }
});

await test("image validation sniffs real content and rejects dangerous formats", async () => {
  const valid = validateDirectoryImageUpload({ filename: "photo.png", declaredMimeType: "image/png", arrayBuffer: png1x1(), ownerType: "person", crop: { x: 0, y: 0, width: 1, height: 1 } });
  assert.equal(valid.mimeType, "image/png");
  assert.equal(valid.width, 1);
  assert.throws(
    () => validateDirectoryImageUpload({ filename: "photo.svg", declaredMimeType: "image/svg+xml", arrayBuffer: new TextEncoder().encode("<svg/>").buffer }),
    (error) => error instanceof DirectoryServiceError && error.code === "unsupported_media_type"
  );
  assert.throws(
    () => validateDirectoryImageUpload({ filename: "fake.png", declaredMimeType: "image/png", arrayBuffer: new TextEncoder().encode("MZ executable").buffer }),
    (error) => error instanceof DirectoryServiceError && error.code === "unsupported_media_type"
  );
  assert.throws(
    () => validateCrop({ x: -1, y: 0, width: 1, height: 1 }),
    (error) => error instanceof DirectoryServiceError && error.code === "invalid_crop"
  );
});

await test("linked adult can upload own person photo; object keys stay private", async () => {
  const { env, db, context } = await fixture();
  const session = await createDirectoryMediaUploadSession(env, { context, ownerType: "person", ownerId: context.currentPerson.id });
  const asset = await completeDirectoryMediaUpload(env, { context, sessionId: session.id, file: file(), arrayBuffer: png1x1(), crop: { x: 0, y: 0, width: 1, height: 1 } });
  assert.equal(asset.ownerType, "person");
  assert.equal(asset.variants.some((variant) => variant.type === "avatar_small"), true);
  assert.equal("r2ObjectKey" in asset.variants[0], false);
  assert.equal(env.DIRECTORY_MEDIA.objects.size, 5);
  assert.equal(auditCount(db, "directory.media.person_upload_initiated"), 1);
  assert.equal(auditCount(db, "directory.media.secure_transformation_completed"), 1);
});

await test("household admin can upload household photo; ordinary spouse person photo remains protected", async () => {
  const { env, context, spouse, household } = await fixture();
  await assert.rejects(
    () => createDirectoryMediaUploadSession(env, { context, ownerType: "person", ownerId: spouse.id }),
    (error) => error instanceof DirectoryServiceError && error.code === "forbidden"
  );
  const session = await createDirectoryMediaUploadSession(env, { context, ownerType: "household", ownerId: household.id });
  const asset = await completeDirectoryMediaUpload(env, { context, sessionId: session.id, file: file(), arrayBuffer: png1x1() });
  assert.equal(asset.ownerType, "household");
  assert.equal(asset.variants.some((variant) => variant.type === "household_card"), true);
});

await test("child photo uploads are denied and publication approval is separate", async () => {
  const { env, context, child, household } = await fixture();
  await assert.rejects(
    () => createDirectoryMediaUploadSession(env, { context, ownerType: "person", ownerId: child.id }),
    (error) => error instanceof DirectoryServiceError && error.code === "forbidden"
  );
  const session = await createDirectoryMediaUploadSession(env, { context, ownerType: "household", ownerId: household.id });
  const asset = await completeDirectoryMediaUpload(env, { context, sessionId: session.id, file: file(), arrayBuffer: png1x1() });
  assert.equal(asset.lifecycleStatus, "ready");
  const submitted = await submitDirectoryMediaForReview(env, { context, mediaAssetId: asset.id });
  assert.equal(submitted.lifecycleStatus, "pending_approval");
});

await test("media delivery is authenticated, variant-scoped, and deletion deactivates access", async () => {
  const { env, context } = await fixture();
  const session = await createDirectoryMediaUploadSession(env, { context, ownerType: "person", ownerId: context.currentPerson.id });
  const asset = await completeDirectoryMediaUpload(env, { context, sessionId: session.id, file: file(), arrayBuffer: png1x1(), crop: { x: 0, y: 0, width: 1, height: 1 } });
  const response = await streamDirectoryMediaVariant(env, { context, mediaAssetId: asset.id, variantType: "avatar_small" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  await removeDirectoryMedia(env, { context, mediaAssetId: asset.id });
  await assert.rejects(
    () => streamDirectoryMediaVariant(env, { context, mediaAssetId: asset.id, variantType: "avatar_small" }),
    (error) => error instanceof DirectoryServiceError && error.code === "not_found"
  );
});

await test("media API denies legacy bearer and accepts platform-user session", async () => {
  const { env, context, session, user } = await fixture();
  const legacy = new Request("https://agapay.app/api/directory/media/current?ownerType=person&ownerId=" + context.currentPerson.id, {
    headers: { Authorization: "Bearer legacy-parish-token" }
  });
  const denied = await handleDirectoryMedia(legacy, env);
  assert.equal(denied.status, 401);
  const current = new Request("https://agapay.app/api/directory/media/current?ownerType=person&ownerId=" + context.currentPerson.id, {
    headers: { Authorization: `Bearer ${session.token}`, [PLATFORM_USER_EMAIL_HEADER]: user.email }
  });
  const ok = await handleDirectoryMedia(current, env);
  assert.equal(ok.status, 200);
});

await test("replacement leaves only one active candidate and marks previous candidate replaced", async () => {
  const { env, db, context } = await fixture();
  const firstSession = await createDirectoryMediaUploadSession(env, { context, ownerType: "person", ownerId: context.currentPerson.id });
  await completeDirectoryMediaUpload(env, { context, sessionId: firstSession.id, file: file(), arrayBuffer: png1x1(), crop: { x: 0, y: 0, width: 1, height: 1 } });
  const secondSession = await createDirectoryMediaUploadSession(env, { context, ownerType: "person", ownerId: context.currentPerson.id });
  await completeDirectoryMediaUpload(env, { context, sessionId: secondSession.id, file: file(), arrayBuffer: png1x1(), crop: { x: 0, y: 0, width: 1, height: 1 } });
  const candidates = db.prepare("SELECT COUNT(*) AS count FROM directory_media_assignments WHERE assignment_status = 'candidate'").get().count;
  const replaced = db.prepare("SELECT COUNT(*) AS count FROM directory_media_assignments WHERE assignment_status = 'replaced'").get().count;
  assert.equal(candidates, 1);
  assert.equal(replaced, 1);
  const current = await getCurrentDirectoryMediaForOwner(env, { context, ownerType: "person", ownerId: context.currentPerson.id });
  assert.equal(current.length, 1);
});

if (process.exitCode) {
  console.error(`\n${passed} Phase 2B assertion group(s) passed before failure.`);
  process.exit(process.exitCode);
}

console.log(`\n${passed} assertion group(s) passed. directory-phase2b-tests.mjs OK.`);
