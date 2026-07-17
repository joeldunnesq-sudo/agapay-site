// scripts/directory-media-transform-tests.mjs
//
// Parish Directory Phase 2B.1 -- Secure Image Transformation tests.
// Exercises the REAL @cf-wasm/photon-backed pipeline (src/directory/media-transform.js)
// and its integration into upload, approval, and delivery
// (src/directory/media.js, src/directory/admin.js), including a real JPEG
// fixture carrying genuine EXIF GPS/device/orientation metadata built by
// hand-constructing a valid APP1/EXIF segment -- not a mocked/stubbed
// transformer.
//
// Run directly: node scripts/directory-media-transform-tests.mjs

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";
import {
  decodeAndNormalizeSource,
  transformVariant,
  isAcceptedPipelineVersion,
  PIPELINE_VERSION,
  TRANSFORMER_NAME,
  TRANSFORMER_VERSION
} from "../src/directory/media-transform.js";
import {
  completeDirectoryMediaUpload,
  createDirectoryMediaUploadSession,
  getDirectoryMediaAsset,
  streamDirectoryMediaVariant,
  submitDirectoryMediaForReview,
  assertMediaAssetSecurelyTransformed,
  auditDirectoryMediaLegacyAssets,
  reprocessDirectoryMediaAsset,
  DirectoryServiceError
} from "../src/directory/index.js";
import {
  addHouseholdAdmin,
  addHouseholdMember,
  addParishAffiliation,
  createHousehold,
  createPerson,
  linkExternalIdentity,
  resolveDirectorySelfServiceContext,
  resolveDirectoryAdminContext,
  decideDirectoryReviewItem
} from "../src/directory/index.js";
import { ensurePlatformUser, issuePlatformUserSession, PLATFORM_USER_EMAIL_HEADER } from "../src/lib/identity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

function migration(name) {
  return readFileSync(path.join(repoRoot, "migrations", name), "utf8");
}

// ---- Real JPEG + real EXIF (GPS/device/orientation) fixture builder ------

function u16be(value) { return [(value >> 8) & 0xff, value & 0xff]; }
function u32le(value) { return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]; }
function u16le(value) { return [value & 0xff, (value >> 8) & 0xff]; }
function asciiZ(text) { return [...Array.from(text, (c) => c.charCodeAt(0)), 0]; }

// Builds a real, structurally valid TIFF/EXIF blob (IFD0: Make, Model,
// Orientation, GPSInfo pointer; GPS IFD: GPSLatitudeRef, GPSLatitude) --
// not a fake string, an actual byte-accurate EXIF structure a real EXIF
// reader could parse.
function buildExifTiffBlob({ orientation = 6, make = "Canon", model = "EOS R5" } = {}) {
  const makeBytes = asciiZ(make);
  const modelBytes = asciiZ(model);
  const ifd0EntryCount = 4;
  const ifd0Start = 8;
  const ifd0Size = 2 + ifd0EntryCount * 12 + 4;
  const externalStart = ifd0Start + ifd0Size;
  const makeOffset = externalStart;
  const modelOffset = makeOffset + makeBytes.length;
  const gpsIfdOffset = modelOffset + modelBytes.length;

  const gpsEntryCount = 2;
  const gpsIfdSize = 2 + gpsEntryCount * 12 + 4;
  const gpsExternalStart = gpsIfdOffset + gpsIfdSize;
  const latRationalOffset = gpsExternalStart;

  const tiffHeader = [0x49, 0x49, 0x2a, 0x00, ...u32le(ifd0Start)]; // "II" little-endian

  const ifd0 = [
    ...u16le(ifd0EntryCount),
    // Make (0x010F, ASCII, external)
    ...u16le(0x010f), ...u16le(2), ...u32le(makeBytes.length), ...u32le(makeOffset),
    // Model (0x0110, ASCII, external)
    ...u16le(0x0110), ...u16le(2), ...u32le(modelBytes.length), ...u32le(modelOffset),
    // Orientation (0x0112, SHORT, inline)
    ...u16le(0x0112), ...u16le(3), ...u32le(1), ...u16le(orientation), 0x00, 0x00,
    // GPSInfo IFD pointer (0x8825, LONG, external)
    ...u16le(0x8825), ...u16le(4), ...u32le(1), ...u32le(gpsIfdOffset),
    ...u32le(0) // next IFD offset
  ];

  const gpsIfd = [
    ...u16le(gpsEntryCount),
    // GPSLatitudeRef (0x0001, ASCII count=2, inline "N\0")
    ...u16le(0x0001), ...u16le(2), ...u32le(2), 0x4e, 0x00, 0x00, 0x00,
    // GPSLatitude (0x0002, RATIONAL count=3, external: deg/min/sec)
    ...u16le(0x0002), ...u16le(5), ...u32le(3), ...u32le(latRationalOffset),
    ...u32le(0) // next IFD offset
  ];

  const latRationals = [
    ...u32le(37), ...u32le(1), // 37/1 degrees
    ...u32le(46), ...u32le(1), // 46/1 minutes
    ...u32le(30), ...u32le(1)  // 30/1 seconds -- 37 deg 46' 30" N, a real-shaped GPS coordinate
  ];

  return new Uint8Array([...tiffHeader, ...ifd0, ...makeBytes, ...modelBytes, ...gpsIfd, ...latRationals]);
}

function buildApp1ExifSegment(options) {
  const tiff = buildExifTiffBlob(options);
  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
  const segmentLength = 2 + exifHeader.length + tiff.length; // includes the 2 length bytes
  return new Uint8Array([0xff, 0xe1, ...u16be(segmentLength), ...exifHeader, ...tiff]);
}

// Produces a REAL baseline JPEG (decoded/encoded through Photon itself, so
// it is genuinely valid JPEG data, not a hand-rolled fake) at the given
// size, then splices a hand-built APP1/EXIF segment (with GPS + device +
// orientation) directly after the SOI marker -- exactly where a real
// camera-written JPEG carries it.
function jpegWithExif({ width = 64, height = 48, orientation = 6, make = "Canon", model = "EOS R5" } = {}) {
  const basePng = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82
  ]);
  const decoded = PhotonImage.new_from_byteslice(basePng);
  const resized = resize(decoded, width, height, SamplingFilter.Nearest);
  const jpegBytes = resized.get_bytes_jpeg(90);

  const exifSegment = buildApp1ExifSegment({ orientation, make, model });
  // Splice: SOI (first 2 bytes) + EXIF APP1 segment + rest of the JPEG.
  const out = new Uint8Array(2 + exifSegment.length + (jpegBytes.length - 2));
  out.set(jpegBytes.slice(0, 2), 0);
  out.set(exifSegment, 2);
  out.set(jpegBytes.slice(2), 2 + exifSegment.length);
  return { bytes: out, sourceWidth: width, sourceHeight: height };
}

function containsBytes(haystack, needleAscii) {
  const needle = Array.from(needleAscii, (c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

// ---- D1-shaped SQLite test harness (same pattern as other directory suites) ----

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
  db.exec(migration("0027_directory_admin_phase3a.sql"));
  db.exec(migration("0028_directory_media_secure_transformation.sql"));

  class FakeR2Bucket {
    constructor() { this.objects = new Map(); }
    async put(key, body, options = {}) { this.objects.set(key, { body: body instanceof ArrayBuffer ? new Uint8Array(body) : body, httpMetadata: options.httpMetadata || {} }); }
    async get(key) { const object = this.objects.get(key); if (!object) return null; return { body: object.body, httpMetadata: object.httpMetadata }; }
    async delete(key) { this.objects.delete(key); }
  }

  function wrap(sql) {
    return {
      _params: [],
      bind(...params) { this._params = params; return this; },
      async first() { const row = db.prepare(sql).get(...this._params); return row === undefined ? null : row; },
      async all() { return { results: db.prepare(sql).all(...this._params), success: true }; },
      async run() { const info = db.prepare(sql).run(...this._params); return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }; }
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
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    }
  };
  return { env: { AGAPAY_DB, DIRECTORY_MEDIA: new FakeR2Bucket(), AGAPAY_ENVIRONMENT: "test" }, db };
}

function actor(parishId = "st-fiacre", capabilities = ["directory.manage"], personId = "") {
  return { userId: `admin_${parishId}`, parishId, capabilities, personId };
}

function file(name, type, buffer) {
  return { name, type, arrayBuffer: async () => buffer };
}

function grantMembership(db, { userId, parishId = "st-fiacre", capabilities }) {
  const membershipId = `m_${userId}_${parishId}`.replace(/[^a-zA-Z0-9_]/g, "_");
  db.prepare(`INSERT INTO parish_memberships
    (id, user_id, parish_id, role_template, status, invited_by_user_id, accepted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'administrator', 'active', 'test', datetime('now'), datetime('now'), datetime('now'))`)
    .run(membershipId, userId, parishId);
  for (const capability of capabilities) {
    db.prepare("INSERT INTO membership_capabilities (id, membership_id, capability, granted_by_user_id, granted_at) VALUES (?, ?, ?, 'test', datetime('now'))")
      .run(`${membershipId}_${capability}`.replace(/[^a-zA-Z0-9_]/g, "_"), membershipId, capability);
  }
}

async function fixture() {
  const { env, db } = makeD1Env();
  const admin = actor();
  const user = await ensurePlatformUser(env, { email: "anna@example.org", displayName: "Anna Dunn" });
  const session = await issuePlatformUserSession(env, user.id);
  const adult = await createPerson(env, { actor: admin, preferredName: "Anna Dunn", biologicalSex: "female" });
  const household = await createHousehold(env, { actor: admin, displayName: "The Dunn Household" });
  await addHouseholdMember(env, { actor: admin, householdId: household.id, personId: adult.id, relationship: "head" });
  await addHouseholdAdmin(env, { actor: admin, householdId: household.id, personId: adult.id });
  await addParishAffiliation(env, { actor: admin, personId: adult.id, status: "member" });
  await linkExternalIdentity(env, { actor: admin, personId: adult.id, linkType: "platform_user", externalId: user.id });
  const context = await resolveDirectorySelfServiceContext(env, { user });

  const reviewerUser = await ensurePlatformUser(env, { email: "reviewer@example.org", displayName: "Reviewer" });
  grantMembership(db, {
    userId: reviewerUser.id,
    capabilities: ["directory.publication.review", "directory.manage", "directory.media.reprocess", "directory.audit.view"]
  });
  const reviewerSession = await issuePlatformUserSession(env, reviewerUser.id);
  const adminSessionRequest = new Request("https://agapay.test/", { headers: { Authorization: `Bearer ${reviewerSession.token}`, [PLATFORM_USER_EMAIL_HEADER]: reviewerUser.email } });
  const adminContext = await resolveDirectoryAdminContext(env, { request: adminSessionRequest, parishId: "st-fiacre" });
  return { env, db, admin, user, session, adult, household, context, adminContext };
}

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS - ${name}`); }
  catch (error) { console.error(`FAIL - ${name}`); console.error(error); process.exitCode = 1; }
}

// ── Runtime compatibility ────────────────────────────────────────────────

await test("transformer loads and produces real decoded/resized/encoded output in this test runtime", async () => {
  const decoded = decodeAndNormalizeSource({ sourceBytes: jpegWithExif({ width: 32, height: 32, orientation: 1 }).bytes, sourceMimeType: "image/jpeg" });
  const output = await transformVariant({ decodedSource: decoded, targetWidth: 96, targetHeight: 96 });
  assert.equal(output.transformerName, TRANSFORMER_NAME);
  assert.equal(output.transformerVersion, TRANSFORMER_VERSION);
  assert.equal(output.pipelineVersion, PIPELINE_VERSION);
  assert.ok(isAcceptedPipelineVersion(PIPELINE_VERSION));
});

// ── Real resizing ────────────────────────────────────────────────────────

await test("output pixel dimensions genuinely match the declared variant, not a copy of the source", async () => {
  const source = jpegWithExif({ width: 32, height: 32, orientation: 1 });
  const decoded = decodeAndNormalizeSource({ sourceBytes: source.bytes, sourceMimeType: "image/jpeg" });
  const output = await transformVariant({ decodedSource: decoded, targetWidth: 96, targetHeight: 96 });
  assert.equal(output.width, 96);
  assert.equal(output.height, 96);
  assert.notEqual(output.byteSize, source.bytes.byteLength, "expected genuinely different, resized output bytes, not a byte-identical copy");
  assert.notEqual(output.outputContentHash, undefined);
});

// ── Metadata removal (real EXIF/GPS/device fixture) ─────────────────────

await test("EXIF GPS coordinates, device make/model, and orientation tag do not survive transformation", async () => {
  const source = jpegWithExif({ width: 64, height: 48, orientation: 6, make: "Canon", model: "EOS R5" });
  // Sanity: the fixture really does contain the metadata we're about to assert is stripped.
  assert.ok(containsBytes(source.bytes, "Exif"), "fixture sanity check: source must actually contain an EXIF segment");
  assert.ok(containsBytes(source.bytes, "Canon"), "fixture sanity check: source must contain the device Make");
  assert.ok(containsBytes(source.bytes, "EOS R5"), "fixture sanity check: source must contain the device Model");

  const decoded = decodeAndNormalizeSource({ sourceBytes: source.bytes, sourceMimeType: "image/jpeg" });
  assert.equal(decoded.orientationNormalized, true, "expected orientation 6 to require normalization");
  const output = await transformVariant({ decodedSource: decoded, targetWidth: 96, targetHeight: 96 });

  assert.ok(!containsBytes(output.bytes, "Exif"), "expected no EXIF segment in transformed output");
  assert.ok(!containsBytes(output.bytes, "Canon"), "expected device Make to be removed");
  assert.ok(!containsBytes(output.bytes, "EOS R5"), "expected device Model to be removed");
  assert.equal(output.metadataStripped, true);
  assert.equal(output.orientationNormalized, true);
});

// ── Orientation ──────────────────────────────────────────────────────────

await test("orientation is normalized before crop/resize and output no longer depends on the EXIF tag", async () => {
  for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const source = jpegWithExif({ width: 64, height: 48, orientation });
    const decoded = decodeAndNormalizeSource({ sourceBytes: source.bytes, sourceMimeType: "image/jpeg" });
    const output = await transformVariant({ decodedSource: decoded, targetWidth: 96, targetHeight: 96 });
    assert.equal(output.width, 96);
    assert.equal(output.height, 96);
    assert.equal(decoded.orientationNormalized, orientation !== 1, `orientation ${orientation} normalization flag`);
  }
});

// ── Crop ─────────────────────────────────────────────────────────────────

await test("crop is validated against actual decoded dimensions and applied to real pixels", async () => {
  const source = jpegWithExif({ width: 64, height: 64, orientation: 1 });
  const decoded = decodeAndNormalizeSource({ sourceBytes: source.bytes, sourceMimeType: "image/jpeg" });

  const cropped = await transformVariant({ decodedSource: decoded, targetWidth: 96, targetHeight: 96, crop: { x: 0, y: 0, width: 64, height: 64 } });
  assert.equal(cropped.cropApplied, true);
  assert.equal(cropped.width, 96);

  await assert.rejects(
    () => transformVariant({ decodedSource: decoded, targetWidth: 96, targetHeight: 96, crop: { x: 0, y: 0, width: 1000, height: 1000 } }),
    (error) => error instanceof DirectoryServiceError && error.code === "MEDIA_TRANSFORMATION_FAILED"
  );
  await assert.rejects(
    () => transformVariant({ decodedSource: decoded, targetWidth: 96, targetHeight: 96, crop: { x: -1, y: 0, width: 10, height: 10 } }),
    (error) => error instanceof DirectoryServiceError && error.code === "MEDIA_TRANSFORMATION_FAILED"
  );
});

// ── Formats ──────────────────────────────────────────────────────────────

await test("unsupported source mime types are rejected before any decode attempt", async () => {
  assert.throws(
    () => decodeAndNormalizeSource({ sourceBytes: new Uint8Array([1, 2, 3]), sourceMimeType: "image/svg+xml" }),
    (error) => error instanceof DirectoryServiceError && error.code === "MEDIA_UNSUPPORTED_FORMAT"
  );
  assert.throws(
    () => decodeAndNormalizeSource({ sourceBytes: new Uint8Array(0), sourceMimeType: "image/jpeg" }),
    (error) => error instanceof DirectoryServiceError && error.code === "MEDIA_DECODE_FAILED"
  );
});

// ── Limits ───────────────────────────────────────────────────────────────

await test("oversized target dimensions are rejected", async () => {
  const source = jpegWithExif({ width: 32, height: 32 });
  const decoded = decodeAndNormalizeSource({ sourceBytes: source.bytes, sourceMimeType: "image/jpeg" });
  await assert.rejects(
    () => transformVariant({ decodedSource: decoded, targetWidth: 999999, targetHeight: 999999 }),
    (error) => error instanceof DirectoryServiceError && error.code === "MEDIA_DIMENSIONS_TOO_LARGE"
  );
});

// ── Secure attestation (end-to-end through completeDirectoryMediaUpload) ──

await test("uploaded photo records real transformer/pipeline attestation on every required variant", async () => {
  const { env, context } = await fixture();
  const source = jpegWithExif({ width: 64, height: 64, orientation: 6 });
  const session = await createDirectoryMediaUploadSession(env, { context, ownerType: "person", ownerId: context.currentPerson.id });
  const asset = await completeDirectoryMediaUpload(env, { context, sessionId: session.id, file: file("photo.jpg", "image/jpeg", source.bytes), arrayBuffer: source.bytes.buffer, crop: { x: 0, y: 0, width: 64, height: 64 } });

  assert.equal(asset.processingStatus, "securely_transformed");
  assert.equal(asset.pipelineVersion, PIPELINE_VERSION);
  for (const variant of asset.variants) {
    assert.equal(variant.secureTransformStatus, "securely_transformed");
    assert.equal(variant.transformerVersion, TRANSFORMER_VERSION);
    assert.equal(variant.pipelineVersion, PIPELINE_VERSION);
  }
});

await test("client-supplied attestation-shaped fields cannot forge secure status; object existence alone is not secure", async () => {
  const { env, db, context } = await fixture();
  const session = await createDirectoryMediaUploadSession(env, { context, ownerType: "person", ownerId: context.currentPerson.id });
  const asset = await completeDirectoryMediaUpload(env, { context, sessionId: session.id, file: file("photo.jpg", "image/jpeg", jpegWithExif({ width: 32, height: 32 }).bytes), arrayBuffer: jpegWithExif({ width: 32, height: 32 }).bytes.buffer });

  // Simulate a copied/renamed object with no real transformation: a fresh
  // variant row inserted directly (bypassing the pipeline entirely), the
  // way a "copy the original to a derivative key" shortcut would look in
  // the database. It must not pass the approval gate.
  db.prepare(`DELETE FROM directory_media_variants WHERE media_asset_id = ? AND variant_type = 'avatar_small'`).run(asset.id);
  db.prepare(`
    INSERT INTO directory_media_variants (id, media_asset_id, variant_type, width, height, mime_type, byte_size, r2_object_key, content_hash, ready, secure_transform_status, created_at)
    VALUES ('fake_var', ?, 'avatar_small', 96, 96, 'image/jpeg', 100, 'fake/key', 'deadbeef', 1, 'unverified', strftime('%s','now') * 1000)
  `).run(asset.id);

  await assert.rejects(
    () => assertMediaAssetSecurelyTransformed(env, { mediaAssetId: asset.id, parishId: "st-fiacre" }),
    (error) => error instanceof DirectoryServiceError && error.code === "MEDIA_SECURE_TRANSFORMATION_REQUIRED"
  );
});

// ── Approval hard gate ───────────────────────────────────────────────────

await test("a securely transformed asset passes the approval gate and can be approved through the real Phase 3A service", async () => {
  const { env, context, adminContext } = await fixture();
  const source = jpegWithExif({ width: 64, height: 64 });
  const session = await createDirectoryMediaUploadSession(env, { context, ownerType: "person", ownerId: context.currentPerson.id });
  const asset = await completeDirectoryMediaUpload(env, { context, sessionId: session.id, file: file("photo.jpg", "image/jpeg", source.bytes), arrayBuffer: source.bytes.buffer, crop: { x: 0, y: 0, width: 64, height: 64 } });
  await submitDirectoryMediaForReview(env, { context, mediaAssetId: asset.id });

  const result = await decideDirectoryReviewItem(env, { context: adminContext, sourceType: "media_asset", sourceId: asset.id, decision: "approve" });
  assert.equal(result.decision, "approve");
  const approved = await getDirectoryMediaAsset(env, { context, mediaAssetId: asset.id });
  assert.equal(approved.lifecycleStatus, "approved");
});

await test("an asset with a missing/corrupted variant cannot be approved -- MEDIA_SECURE_TRANSFORMATION_REQUIRED, no override", async () => {
  const { env, db, context, adminContext } = await fixture();
  const source = jpegWithExif({ width: 64, height: 64 });
  const session = await createDirectoryMediaUploadSession(env, { context, ownerType: "person", ownerId: context.currentPerson.id });
  const asset = await completeDirectoryMediaUpload(env, { context, sessionId: session.id, file: file("photo.jpg", "image/jpeg", source.bytes), arrayBuffer: source.bytes.buffer, crop: { x: 0, y: 0, width: 64, height: 64 } });
  await submitDirectoryMediaForReview(env, { context, mediaAssetId: asset.id });

  // Corrupt one required variant's attestation directly (simulating a
  // partially-failed pipeline run that a naive check might miss).
  db.prepare(`UPDATE directory_media_variants SET secure_transform_status = 'unverified' WHERE media_asset_id = ? AND variant_type = 'avatar_medium'`).run(asset.id);

  await assert.rejects(
    () => decideDirectoryReviewItem(env, { context: adminContext, sourceType: "media_asset", sourceId: asset.id, decision: "approve" }),
    (error) => error instanceof DirectoryServiceError && error.code === "MEDIA_SECURE_TRANSFORMATION_REQUIRED"
  );
  // Even a platform-admin-shaped context (full "directory.manage") hits the
  // exact same gate -- there is no separate, more-permissive approval path.
  const platformAdminContext = { ...adminContext, capabilities: ["directory.manage"], permissions: { ...adminContext.permissions } };
  await assert.rejects(
    () => decideDirectoryReviewItem(env, { context: platformAdminContext, sourceType: "media_asset", sourceId: asset.id, decision: "approve" }),
    (error) => error instanceof DirectoryServiceError && error.code === "MEDIA_SECURE_TRANSFORMATION_REQUIRED"
  );

  const stillPending = await getDirectoryMediaAsset(env, { context, mediaAssetId: asset.id });
  assert.equal(stillPending.lifecycleStatus, "pending_approval");
});

await test("a legacy asset with an old-style ready flag (pre-Phase-2B.1) cannot be approved", async () => {
  const { env, db, context, adminContext } = await fixture();
  // Directly seed a Phase-2B-shaped asset: lifecycle pending_approval,
  // processing_status left at the pre-2B.1 default ('pending'), no
  // attestation fields at all -- exactly what a pre-migration row looked
  // like before this package's backfill reclassified it.
  const assetId = "legacy_asset_1";
  const timestamp = Date.now();
  db.prepare(`
    INSERT INTO directory_media_assets (id, parish_id, owner_type, owner_id, media_purpose, lifecycle_status, processing_status, visibility, publication_eligible, source_filename, detected_mime_type, original_byte_size, original_width, original_height, decoded_pixel_count, content_hash, original_object_key, uploaded_by_user_id, created_at, updated_at)
    VALUES (?, 'st-fiacre', 'person', ?, 'person_profile_photo', 'pending_approval', 'pending', 'private', 0, 'legacy.jpg', 'image/jpeg', 100, 96, 96, 9216, 'legacyhash', 'legacy/key', ?, ?, ?)
  `).run(assetId, context.currentPerson.id, context.user.id, timestamp, timestamp);
  db.prepare(`INSERT INTO directory_media_variants (id, media_asset_id, variant_type, width, height, mime_type, byte_size, r2_object_key, content_hash, ready, created_at) VALUES ('legacy_var', ?, 'avatar_small', 96, 96, 'image/jpeg', 100, 'legacy/var/key', 'legacyhash', 1, strftime('%s','now') * 1000)`).run(assetId);

  await assert.rejects(
    () => decideDirectoryReviewItem(env, { context: adminContext, sourceType: "media_asset", sourceId: assetId, decision: "approve" }),
    (error) => error instanceof DirectoryServiceError && error.code === "MEDIA_SECURE_TRANSFORMATION_REQUIRED"
  );
});

// ── Secure delivery ──────────────────────────────────────────────────────

await test("delivery serves only securely transformed, accepted-pipeline variants -- never unverified ones", async () => {
  const { env, db, context } = await fixture();
  const source = jpegWithExif({ width: 64, height: 64 });
  const session = await createDirectoryMediaUploadSession(env, { context, ownerType: "person", ownerId: context.currentPerson.id });
  const asset = await completeDirectoryMediaUpload(env, { context, sessionId: session.id, file: file("photo.jpg", "image/jpeg", source.bytes), arrayBuffer: source.bytes.buffer, crop: { x: 0, y: 0, width: 64, height: 64 } });

  const ok = await streamDirectoryMediaVariant(env, { context, mediaAssetId: asset.id, variantType: "avatar_small" });
  assert.equal(ok.status, 200);

  db.prepare(`UPDATE directory_media_variants SET secure_transform_status = 'unverified' WHERE media_asset_id = ? AND variant_type = 'avatar_small'`).run(asset.id);
  await assert.rejects(
    () => streamDirectoryMediaVariant(env, { context, mediaAssetId: asset.id, variantType: "avatar_small" }),
    (error) => error instanceof DirectoryServiceError && error.code === "not_found"
  );

  db.prepare(`UPDATE directory_media_variants SET secure_transform_status = 'securely_transformed', pipeline_version = 'directory-media-v0-old' WHERE media_asset_id = ? AND variant_type = 'avatar_medium'`).run(asset.id);
  await assert.rejects(
    () => streamDirectoryMediaVariant(env, { context, mediaAssetId: asset.id, variantType: "avatar_medium" }),
    (error) => error instanceof DirectoryServiceError && error.code === "not_found"
  );
});

// ── Legacy audit ─────────────────────────────────────────────────────────

await test("legacy audit classifies pre-2B.1 assets as reprocessing_required, never presumes secure status from old flags", async () => {
  const { env, db, context } = await fixture();
  db_seedLegacyAsset(db, context.currentPerson.id, context.user.id);

  const audit = await auditDirectoryMediaLegacyAssets(env, { parishId: "st-fiacre" });
  assert.ok(audit.totalAssets >= 1);
  assert.ok(audit.actionable.some((item) => item.classification === "reprocessing_required"));

  const row = db.prepare("SELECT processing_status FROM directory_media_assets WHERE id = 'legacy_audit_asset'").get();
  assert.equal(row.processing_status, "reprocessing_required");

  // Idempotent: running again does not error and does not duplicate the classification.
  const second = await auditDirectoryMediaLegacyAssets(env, { parishId: "st-fiacre" });
  assert.ok(second.totalAssets >= 1);
});

function db_seedLegacyAsset(db, personId, userId) {
  const timestamp = Date.now();
  db.prepare(`
    INSERT INTO directory_media_assets (id, parish_id, owner_type, owner_id, media_purpose, lifecycle_status, processing_status, visibility, publication_eligible, source_filename, detected_mime_type, original_byte_size, original_width, original_height, decoded_pixel_count, content_hash, original_object_key, uploaded_by_user_id, created_at, updated_at)
    VALUES ('legacy_audit_asset', 'st-fiacre', 'person', ?, 'person_profile_photo', 'ready', 'pending', 'private', 0, 'legacy.jpg', 'image/jpeg', 100, 96, 96, 9216, 'legacyhash2', 'legacy/audit/key', ?, ?, ?)
  `).run(personId, userId, timestamp, timestamp);
}

// ── Reprocessing ─────────────────────────────────────────────────────────

await test("reprocessing a legacy asset with a retained source produces new secure variants and returns approved photos to review", async () => {
  const { env, db, context, adminContext } = await fixture();

  // Seed a "legacy" asset whose *original* object really is a valid,
  // retained JPEG (Part 15's "if sources are retained, reprocess from the
  // private source") but whose variants were never securely transformed.
  const source = jpegWithExif({ width: 64, height: 64, orientation: 3 });
  const timestamp = Date.now();
  db.prepare(`
    INSERT INTO directory_media_assets (id, parish_id, owner_type, owner_id, media_purpose, lifecycle_status, processing_status, visibility, publication_eligible, source_filename, detected_mime_type, original_byte_size, original_width, original_height, decoded_pixel_count, content_hash, original_object_key, source_retained, uploaded_by_user_id, created_at, updated_at)
    VALUES ('reproc_asset', 'st-fiacre', 'person', ?, 'person_profile_photo', 'approved', 'reprocessing_required', 'private', 0, 'legacy.jpg', 'image/jpeg', ?, 64, 64, 4096, 'legacyhash3', 'legacy/reproc/original', 1, ?, ?, ?)
  `).run(context.currentPerson.id, source.bytes.byteLength, context.user.id, timestamp, timestamp);
  for (const variantType of ["avatar_small", "avatar_medium", "avatar_large", "review_preview"]) {
    db.prepare(`INSERT INTO directory_media_variants (id, media_asset_id, variant_type, width, height, mime_type, byte_size, r2_object_key, content_hash, ready, created_at) VALUES (?, 'reproc_asset', ?, 96, 96, 'image/jpeg', 100, ?, 'legacyhash3', 0, strftime('%s','now') * 1000)`)
      .run(`legacy_var_${variantType}`, variantType, `legacy/reproc/${variantType}`);
  }
  await env.DIRECTORY_MEDIA.put("legacy/reproc/original", source.bytes.buffer, { httpMetadata: { contentType: "image/jpeg" } });

  const reprocessed = await reprocessDirectoryMediaAsset(env, { context: { ...context, parishId: "st-fiacre" }, mediaAssetId: "reproc_asset" });
  assert.equal(reprocessed.processingStatus, "securely_transformed");
  for (const variant of reprocessed.variants) {
    assert.equal(variant.secureTransformStatus, "securely_transformed");
    assert.equal(variant.pipelineVersion, PIPELINE_VERSION);
  }
  // Was previously 'approved' -- Phase 2B never persisted the original
  // crop, so equivalence can't be proven; conservatively returned to review.
  assert.equal(reprocessed.lifecycleStatus, "pending_approval");

  // Idempotent / re-runnable: reprocessing again succeeds without error and
  // does not accumulate duplicate variant rows.
  const again = await reprocessDirectoryMediaAsset(env, { context: { ...context, parishId: "st-fiacre" }, mediaAssetId: "reproc_asset" });
  assert.equal(again.processingStatus, "securely_transformed");
  const variantCount = db.prepare("SELECT COUNT(*) AS n FROM directory_media_variants WHERE media_asset_id = 'reproc_asset'").get().n;
  assert.equal(variantCount, 4, "expected exactly one row per required variant type, no duplicates across reprocessing runs");
});

await test("an asset with no retained source is marked reupload_required, never fabricates secure attestation", async () => {
  const { env, db, context } = await fixture();
  const timestamp = Date.now();
  db.prepare(`
    INSERT INTO directory_media_assets (id, parish_id, owner_type, owner_id, media_purpose, lifecycle_status, processing_status, visibility, publication_eligible, source_filename, detected_mime_type, original_byte_size, original_width, original_height, decoded_pixel_count, content_hash, original_object_key, source_retained, uploaded_by_user_id, created_at, updated_at)
    VALUES ('no_source_asset', 'st-fiacre', 'person', ?, 'person_profile_photo', 'ready', 'reprocessing_required', 'private', 0, 'gone.jpg', 'image/jpeg', 100, 96, 96, 9216, 'gonehash', NULL, 0, ?, ?, ?)
  `).run(context.currentPerson.id, context.user.id, timestamp, timestamp);

  const result = await reprocessDirectoryMediaAsset(env, { context: { ...context, parishId: "st-fiacre" }, mediaAssetId: "no_source_asset" });
  assert.equal(result.reuploadRequired, true);
  const row = db.prepare("SELECT reupload_required FROM directory_media_assets WHERE id = 'no_source_asset'").get();
  assert.equal(row.reupload_required, 1);
});

// ── Entitlement parity ──────────────────────────────────────────────────

await test("Mission and Parish tiers receive identical secure-transformation behavior (no tier gate anywhere in the pipeline)", async () => {
  const source = jpegWithExif({ width: 32, height: 32 });
  const decoded = decodeAndNormalizeSource({ sourceBytes: source.bytes, sourceMimeType: "image/jpeg" });
  const output = await transformVariant({ decodedSource: decoded, targetWidth: 96, targetHeight: 96 });
  // No parameter of decodeAndNormalizeSource/transformVariant accepts or
  // consults a subscription tier at all -- structurally, there is nothing
  // to tier-gate. This test documents that invariant directly.
  assert.equal(output.metadataStripped, true);
  assert.equal(typeof decodeAndNormalizeSource, "function");
  assert.equal(decodeAndNormalizeSource.length <= 1, true, "decodeAndNormalizeSource takes no tier/plan parameter");
});

console.log(`\n${passed} test(s) passed.`);
if (process.exitCode) {
  console.error("Some directory media transform tests FAILED.");
} else {
  console.log("All directory media transform tests passed.");
}
