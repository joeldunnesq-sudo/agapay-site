import { d1All, d1First, d1Run, generateSecret } from "../lib/core.js";
import { DirectoryServiceError } from "./foundation.js";
import { evaluateFieldPolicy, getPersonPrivacyFlags } from "./privacy.js";
import { getPublicationProfile } from "./publication.js";
import {
  auditStatement,
  cleanText,
  maskValue,
  nowMs,
  runAtomic,
  safeJson,
  VISIBILITY_RANK
} from "./shared.js";
import {
  decodeAndNormalizeSource,
  transformVariant,
  isAcceptedPipelineVersion,
  PIPELINE_VERSION,
  TRANSFORMER_NAME,
  TRANSFORMER_VERSION
} from "./media-transform.js";

export const DIRECTORY_MEDIA_BUCKET = "DIRECTORY_MEDIA";
export const DIRECTORY_MEDIA_LIMITS = Object.freeze({
  maxFileSizeBytes: 10 * 1024 * 1024,
  minWidth: 1,
  minHeight: 1,
  maxWidth: 12000,
  maxHeight: 12000,
  maxDecodedPixels: 36_000_000,
  uploadSessionTtlMs: 15 * 60 * 1000,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  rejectedTypes: ["image/svg+xml", "application/pdf", "application/x-msdownload", "application/zip"]
});

const PURPOSES = Object.freeze({
  person: "person_profile_photo",
  household: "household_profile_photo"
});

const PERSON_VARIANTS = Object.freeze([
  { type: "avatar_small", width: 96, height: 96 },
  { type: "avatar_medium", width: 256, height: 256 },
  { type: "avatar_large", width: 512, height: 512 },
  { type: "review_preview", width: 512, height: 512 }
]);

const HOUSEHOLD_VARIANTS = Object.freeze([
  { type: "household_card", width: 640, height: 480 },
  { type: "review_preview", width: 640, height: 480 }
]);

function mediaBucket(env) {
  return env?.[DIRECTORY_MEDIA_BUCKET];
}

function sanitizeFilename(filename) {
  const base = String(filename || "photo")
    .replace(/[\\/]/g, "_")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/["'\r\n]/g, "")
    .trim()
    .slice(0, 160);
  return base || "photo";
}

function bytes(arrayBuffer, start = 0, length = 32) {
  return new Uint8Array(arrayBuffer.slice(start, start + length));
}

function u32be(view, offset) {
  return (view[offset] << 24) | (view[offset + 1] << 16) | (view[offset + 2] << 8) | view[offset + 3];
}

function u16be(view, offset) {
  return (view[offset] << 8) | view[offset + 1];
}

function u24le(view, offset) {
  return view[offset] | (view[offset + 1] << 8) | (view[offset + 2] << 16);
}

function parsePng(arrayBuffer) {
  const head = bytes(arrayBuffer, 0, 32);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((byte, index) => head[index] === byte)) return null;
  if (String.fromCharCode(...head.slice(12, 16)) !== "IHDR") throw new DirectoryServiceError("invalid_image", "PNG image is malformed.", 422);
  return { mimeType: "image/png", width: u32be(head, 16), height: u32be(head, 20) };
}

function parseJpeg(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  if (data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) throw new DirectoryServiceError("invalid_image", "JPEG image is malformed.", 422);
    const marker = data[offset + 1];
    const length = u16be(data, offset + 2);
    if (length < 2) throw new DirectoryServiceError("invalid_image", "JPEG image is malformed.", 422);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { mimeType: "image/jpeg", height: u16be(data, offset + 5), width: u16be(data, offset + 7) };
    }
    offset += 2 + length;
  }
  throw new DirectoryServiceError("invalid_image", "JPEG dimensions could not be read.", 422);
}

function parseWebp(arrayBuffer) {
  const head = bytes(arrayBuffer, 0, 32);
  if (String.fromCharCode(...head.slice(0, 4)) !== "RIFF" || String.fromCharCode(...head.slice(8, 12)) !== "WEBP") return null;
  const chunk = String.fromCharCode(...head.slice(12, 16));
  if (chunk === "VP8X") {
    return { mimeType: "image/webp", width: u24le(head, 24) + 1, height: u24le(head, 27) + 1 };
  }
  if (chunk === "VP8 " && head.length >= 30) {
    return { mimeType: "image/webp", width: u16be(new Uint8Array([head[27], head[26]]), 0) & 0x3fff, height: u16be(new Uint8Array([head[29], head[28]]), 0) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const b0 = head[21], b1 = head[22], b2 = head[23], b3 = head[24];
    return { mimeType: "image/webp", width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  throw new DirectoryServiceError("invalid_image", "WebP image is malformed or unsupported.", 422);
}

export function validateCrop(crop = {}, ownerType = "person") {
  if (!crop || Object.keys(crop).length === 0) return null;
  const x = Number(crop.x), y = Number(crop.y), width = Number(crop.width), height = Number(crop.height);
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0) {
    throw new DirectoryServiceError("invalid_crop", "Crop values must be positive finite numbers.", 422);
  }
  const ratio = width / height;
  const expected = ownerType === "person" ? 1 : 4 / 3;
  if (Math.abs(ratio - expected) > 0.05) {
    throw new DirectoryServiceError("invalid_crop", "Crop ratio is not supported for this photo type.", 422);
  }
  return { x, y, width, height };
}

export function validateDirectoryImageUpload({ filename = "", declaredMimeType = "", arrayBuffer, ownerType = "person", crop = null }) {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new DirectoryServiceError("empty_upload", "The uploaded image is empty.", 422);
  if (arrayBuffer.byteLength > DIRECTORY_MEDIA_LIMITS.maxFileSizeBytes) throw new DirectoryServiceError("file_too_large", "The uploaded image exceeds the 10 MB limit.", 422);
  const declared = String(declaredMimeType || "").toLowerCase();
  if (declared && !DIRECTORY_MEDIA_LIMITS.allowedMimeTypes.includes(declared)) {
    throw new DirectoryServiceError("unsupported_media_type", "Only JPEG, PNG, and WebP images are accepted.", 422);
  }
  const detected = parsePng(arrayBuffer) || parseJpeg(arrayBuffer) || parseWebp(arrayBuffer);
  if (!detected) throw new DirectoryServiceError("unsupported_media_type", "The file contents are not a supported image.", 422);
  if (declared && declared !== detected.mimeType) throw new DirectoryServiceError("mime_spoof_denied", "The file contents do not match the declared image type.", 422);
  if (detected.width < DIRECTORY_MEDIA_LIMITS.minWidth || detected.height < DIRECTORY_MEDIA_LIMITS.minHeight) {
    throw new DirectoryServiceError("image_too_small", "The image dimensions are too small.", 422);
  }
  if (detected.width > DIRECTORY_MEDIA_LIMITS.maxWidth || detected.height > DIRECTORY_MEDIA_LIMITS.maxHeight) {
    throw new DirectoryServiceError("image_too_large", "The image dimensions exceed the directory limit.", 422);
  }
  const pixels = detected.width * detected.height;
  if (pixels > DIRECTORY_MEDIA_LIMITS.maxDecodedPixels) throw new DirectoryServiceError("image_pixel_limit", "The image is too large to process safely.", 422);
  const normalizedCrop = validateCrop(crop, ownerType);
  if (normalizedCrop && (normalizedCrop.x + normalizedCrop.width > detected.width || normalizedCrop.y + normalizedCrop.height > detected.height)) {
    throw new DirectoryServiceError("invalid_crop", "Crop bounds are outside the image.", 422);
  }
  return {
    filename: sanitizeFilename(filename),
    mimeType: detected.mimeType,
    width: detected.width,
    height: detected.height,
    pixels,
    crop: normalizedCrop
  };
}

function purposeFor(ownerType) {
  if (!PURPOSES[ownerType]) throw new DirectoryServiceError("validation_failed", "Unsupported media owner type.", 422);
  return PURPOSES[ownerType];
}

function objectExt(mimeType) {
  return mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
}

async function sha256ArrayBufferHex(arrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function objectKey({ envName = "production", parishId, ownerType, ownerId, assetId, variantType, mimeType }) {
  const safeParish = String(parishId || "parish").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeOwner = String(ownerId || "owner").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `directory/${envName}/${safeParish}/${ownerType}/${safeOwner}/${assetId}/${variantType}.${objectExt(mimeType)}`;
}

function actorFromContext(context, parishId) {
  return {
    userId: context.user.id,
    parishId,
    personId: context.currentPerson?.id,
    capabilities: ["directory.self.manage"]
  };
}

async function resolveOwnerAuthority(env, context, { ownerType, ownerId, visibility = "private" }) {
  if (!context?.claimed) throw new DirectoryServiceError("unclaimed", "Claim a directory person before managing directory photos.", 403);
  const type = cleanText(ownerType, { required: true, max: 40, field: "ownerType" });
  const id = cleanText(ownerId, { required: true, max: 160, field: "ownerId" });
  if (type === "person") {
    if (id !== context.currentPerson.id) throw new DirectoryServiceError("forbidden", "You cannot manage another adult's profile photo.", 403);
    const parishId = context.activeParishContexts[0]?.parishId || context.currentPerson.createdByParishId;
    const flags = await getPersonPrivacyFlags(env, { parishId, personId: id });
    if (flags.isChild) throw new DirectoryServiceError("child_photo_denied", "Child profile photos are deferred and hidden by default.", 403);
    const policy = await evaluateFieldPolicy(env, { parishId, ownerType: "person", ownerId: id, fieldKey: "person_photo", requestedVisibility: visibility, publicationEligible: visibility === "directory_members" });
    if (policy.visibility !== visibility) throw new DirectoryServiceError("privacy_policy_denied", "Requested photo visibility is not permitted.", 403);
    return { parishId, ownerType: type, ownerId: id, mediaPurpose: purposeFor(type), flags, visibility: policy.visibility, publicationEligible: policy.publicationEligible };
  }
  if (type === "household") {
    const managed = context.manageableHouseholds.find((household) => household.id === id);
    if (!managed) throw new DirectoryServiceError("forbidden", "You cannot manage this household photo.", 403);
    const policy = await evaluateFieldPolicy(env, { parishId: managed.parishId, ownerType: "household", ownerId: id, fieldKey: "household_photo", requestedVisibility: visibility, publicationEligible: visibility === "directory_members" });
    if (policy.visibility !== visibility) throw new DirectoryServiceError("privacy_policy_denied", "Requested photo visibility is not permitted.", 403);
    return { parishId: managed.parishId, ownerType: type, ownerId: id, mediaPurpose: purposeFor(type), flags: {}, visibility: policy.visibility, publicationEligible: policy.publicationEligible };
  }
  throw new DirectoryServiceError("validation_failed", "Unsupported media owner type.", 422);
}

export async function createDirectoryMediaUploadSession(env, { context, ownerType, ownerId, visibility = "private", correlationId = "" }) {
  const auth = await resolveOwnerAuthority(env, context, { ownerType, ownerId, visibility });
  const timestamp = nowMs();
  const sessionId = generateSecret("dir_media_session");
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_media_upload_sessions
              (id, parish_id, owner_type, owner_id, media_purpose, requested_visibility,
               created_by_user_id, status, expires_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      params: [sessionId, auth.parishId, auth.ownerType, auth.ownerId, auth.mediaPurpose, auth.visibility, context.user.id, timestamp + DIRECTORY_MEDIA_LIMITS.uploadSessionTtlMs, timestamp, timestamp]
    },
    auditStatement({
      action: auth.ownerType === "person" ? "directory.media.person_upload_initiated" : "directory.media.household_upload_initiated",
      actor: actorFromContext(context, auth.parishId),
      parishId: auth.parishId,
      targetType: `directory_${auth.ownerType}`,
      targetId: auth.ownerId,
      metadata: { mediaPurpose: auth.mediaPurpose },
      correlationId
    })
  ]);
  return { id: sessionId, parishId: auth.parishId, ownerType: auth.ownerType, ownerId: auth.ownerId, mediaPurpose: auth.mediaPurpose, visibility: auth.visibility, expiresAt: timestamp + DIRECTORY_MEDIA_LIMITS.uploadSessionTtlMs };
}

async function putObject(env, key, arrayBuffer, mimeType) {
  const bucket = mediaBucket(env);
  if (!bucket) throw new DirectoryServiceError("storage_unavailable", "Directory media storage is not configured.", 503);
  await bucket.put(key, arrayBuffer, { httpMetadata: { contentType: mimeType } });
}

async function deleteObject(env, key) {
  const bucket = mediaBucket(env);
  if (!bucket || !key) return;
  await bucket.delete(key);
}

export async function completeDirectoryMediaUpload(env, { context, sessionId, file, arrayBuffer, crop = null, correlationId = "" }) {
  const session = await d1First(env, "SELECT * FROM directory_media_upload_sessions WHERE id = ?1", cleanText(sessionId, { required: true, max: 180, field: "sessionId" }));
  if (!session || session.created_by_user_id !== context.user.id) throw new DirectoryServiceError("not_found", "Upload session was not found.", 404);
  if (session.status !== "pending") throw new DirectoryServiceError("upload_session_used", "Upload session is no longer pending.", 409);
  if (Number(session.expires_at) <= nowMs()) throw new DirectoryServiceError("upload_session_expired", "Upload session expired.", 409);
  const auth = await resolveOwnerAuthority(env, context, { ownerType: session.owner_type, ownerId: session.owner_id, visibility: session.requested_visibility });
  const validation = validateDirectoryImageUpload({ filename: file?.name, declaredMimeType: file?.type, arrayBuffer, ownerType: auth.ownerType, crop });
  const contentHash = await sha256ArrayBufferHex(arrayBuffer);
  const timestamp = nowMs();
  const assetId = generateSecret("dir_media");
  const assignmentId = generateSecret("dir_media_asn");
  const envName = env.AGAPAY_ENVIRONMENT || "production";
  const originalKey = objectKey({ envName, parishId: auth.parishId, ownerType: auth.ownerType, ownerId: auth.ownerId, assetId, variantType: "original_private", mimeType: validation.mimeType });
  const variants = auth.ownerType === "person" ? PERSON_VARIANTS : HOUSEHOLD_VARIANTS;

  // Secure Image Transformation pipeline (Phase 2B.1) -- every declared
  // variant is decoded, orientation-normalized, cropped, resized, and
  // re-encoded from real pixel data BEFORE anything is written to R2 or
  // D1. Any stage failure throws and this function returns without ever
  // creating an asset row, a variant row, or an R2 object -- fail closed,
  // not a partially-ready asset (docs/directory/23-phase-2b1-secure-media-transformation-architecture.md).
  const decodedSource = decodeAndNormalizeSource({ sourceBytes: new Uint8Array(arrayBuffer), sourceMimeType: validation.mimeType });
  const transformedVariants = [];
  for (const variant of variants) {
    const transformed = await transformVariant({
      decodedSource,
      targetWidth: variant.width,
      targetHeight: variant.height,
      crop: validation.crop
    });
    transformedVariants.push({
      ...variant,
      id: generateSecret("dir_media_var"),
      key: objectKey({ envName, parishId: auth.parishId, ownerType: auth.ownerType, ownerId: auth.ownerId, assetId, variantType: variant.type, mimeType: transformed.mimeType }),
      transformed
    });
  }

  await putObject(env, originalKey, arrayBuffer, validation.mimeType);
  for (const variant of transformedVariants) await putObject(env, variant.key, variant.transformed.bytes, variant.transformed.mimeType);

  const statements = [
    {
      sql: "UPDATE directory_media_upload_sessions SET status = 'completed', completed_at = ?1, updated_at = ?1 WHERE id = ?2 AND status = 'pending'",
      params: [timestamp, session.id]
    },
    {
      sql: `UPDATE directory_media_assignments
            SET assignment_status = 'replaced', replaced_at = ?1, updated_at = ?1
            WHERE parish_id = ?2 AND owner_type = ?3 AND owner_id = ?4 AND media_purpose = ?5 AND assignment_status = 'candidate'`,
      params: [timestamp, auth.parishId, auth.ownerType, auth.ownerId, auth.mediaPurpose]
    },
    {
      sql: `INSERT INTO directory_media_assets
              (id, parish_id, owner_type, owner_id, media_purpose, lifecycle_status, processing_status,
               visibility, publication_eligible, source_filename, detected_mime_type, original_byte_size,
               original_width, original_height, decoded_pixel_count, content_hash, original_object_key,
               source_retained, reupload_required, uploaded_by_user_id, active_assignment_id,
               processing_attempt_count, pipeline_version, correlation_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'ready', 'securely_transformed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, 1, ?, ?, ?, ?)`,
      params: [
        assetId, auth.parishId, auth.ownerType, auth.ownerId, auth.mediaPurpose,
        auth.visibility, auth.publicationEligible ? 1 : 0, validation.filename, validation.mimeType,
        arrayBuffer.byteLength, validation.width, validation.height, validation.pixels, contentHash,
        originalKey, context.user.id, assignmentId, PIPELINE_VERSION, correlationId || null, timestamp, timestamp
      ]
    },
    {
      sql: `INSERT INTO directory_media_assignments
              (id, parish_id, owner_type, owner_id, media_purpose, media_asset_id,
               assignment_status, assigned_by_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?)`,
      params: [assignmentId, auth.parishId, auth.ownerType, auth.ownerId, auth.mediaPurpose, assetId, context.user.id, timestamp, timestamp]
    },
    auditStatement({
      action: "directory.media.secure_transformation_completed",
      actor: actorFromContext(context, auth.parishId),
      parishId: auth.parishId,
      targetType: "directory_media_asset",
      targetId: assetId,
      metadata: {
        ownerType: auth.ownerType, ownerId: auth.ownerId,
        variants: transformedVariants.map((v) => v.type),
        pipelineVersion: PIPELINE_VERSION, transformerName: TRANSFORMER_NAME, transformerVersion: TRANSFORMER_VERSION
      },
      correlationId
    }),
    auditStatement({
      action: auth.ownerType === "person" ? "directory.media.person_photo_replaced" : "directory.media.household_photo_replaced",
      actor: actorFromContext(context, auth.parishId),
      parishId: auth.parishId,
      targetType: `directory_${auth.ownerType}`,
      targetId: auth.ownerId,
      metadata: { mediaAssetId: assetId, visibility: auth.visibility },
      correlationId
    })
  ];
  for (const variant of transformedVariants) {
    statements.push({
      sql: `INSERT INTO directory_media_variants
              (id, media_asset_id, variant_type, width, height, mime_type, byte_size,
               r2_object_key, content_hash, ready,
               secure_transform_status, transformer_name, transformer_version, pipeline_version,
               secure_transformed_at, orientation_normalized, crop_applied, metadata_stripped,
               output_content_hash, verified_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1,
                    'securely_transformed', ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?)`,
      params: [
        variant.id, assetId, variant.type, variant.transformed.width, variant.transformed.height,
        variant.transformed.mimeType, variant.transformed.byteSize, variant.key, contentHash,
        TRANSFORMER_NAME, TRANSFORMER_VERSION, PIPELINE_VERSION,
        timestamp, variant.transformed.orientationNormalized ? 1 : 0, variant.transformed.cropApplied ? 1 : 0, 1,
        variant.transformed.outputContentHash, timestamp, timestamp
      ]
    });
  }
  await runAtomic(env, statements);
  return getDirectoryMediaAsset(env, { context, mediaAssetId: assetId });
}

function mediaAssetDto(asset, variants = []) {
  if (!asset) return null;
  return {
    id: asset.id,
    parishId: asset.parish_id,
    ownerType: asset.owner_type,
    ownerId: asset.owner_id,
    mediaPurpose: asset.media_purpose,
    lifecycleStatus: asset.lifecycle_status,
    processingStatus: asset.processing_status,
    visibility: asset.visibility,
    publicationEligible: Number(asset.publication_eligible || 0) === 1,
    detectedMimeType: asset.detected_mime_type,
    originalByteSize: Number(asset.original_byte_size || 0),
    originalWidth: Number(asset.original_width || 0),
    originalHeight: Number(asset.original_height || 0),
    reuploadRequired: Number(asset.reupload_required || 0) === 1,
    pipelineVersion: asset.pipeline_version || "",
    variants: variants.map((variant) => ({
      type: variant.variant_type,
      width: variant.width,
      height: variant.height,
      ready: Number(variant.ready || 0) === 1,
      // Safe technical status only -- never the raw R2 object key (Part 12).
      secureTransformStatus: variant.secure_transform_status || "unverified",
      transformerVersion: variant.transformer_version || "",
      pipelineVersion: variant.pipeline_version || ""
    })),
    createdAt: Number(asset.created_at || 0),
    updatedAt: Number(asset.updated_at || 0)
  };
}

export async function getCurrentDirectoryMediaForOwner(env, { context, ownerType, ownerId }) {
  const auth = await resolveOwnerAuthority(env, context, { ownerType, ownerId, visibility: "private" });
  const rows = await d1All(
    env,
    `SELECT a.* FROM directory_media_assets a
     JOIN directory_media_assignments asn ON asn.media_asset_id = a.id
     WHERE asn.parish_id = ?1 AND asn.owner_type = ?2 AND asn.owner_id = ?3 AND asn.media_purpose = ?4
       AND asn.assignment_status IN ('active','candidate') AND a.lifecycle_status != 'deleted'
     ORDER BY CASE asn.assignment_status WHEN 'active' THEN 0 ELSE 1 END, a.created_at DESC`,
    auth.parishId, auth.ownerType, auth.ownerId, auth.mediaPurpose
  );
  return rows.map((asset) => mediaAssetDto(asset, []));
}

export async function getDirectoryMediaAsset(env, { context, mediaAssetId }) {
  const asset = await d1First(env, "SELECT * FROM directory_media_assets WHERE id = ?1", cleanText(mediaAssetId, { required: true, max: 180, field: "mediaAssetId" }));
  if (!asset) throw new DirectoryServiceError("not_found", "Directory media was not found.", 404);
  await resolveOwnerAuthority(env, context, { ownerType: asset.owner_type, ownerId: asset.owner_id, visibility: asset.visibility });
  const variants = await d1All(env, "SELECT * FROM directory_media_variants WHERE media_asset_id = ?1 ORDER BY variant_type", asset.id);
  return mediaAssetDto(asset, variants);
}

export async function submitDirectoryMediaForReview(env, { context, mediaAssetId, correlationId = "" }) {
  const asset = await d1First(env, "SELECT * FROM directory_media_assets WHERE id = ?1", cleanText(mediaAssetId, { required: true, max: 180, field: "mediaAssetId" }));
  if (!asset) throw new DirectoryServiceError("not_found", "Directory media was not found.", 404);
  const auth = await resolveOwnerAuthority(env, context, { ownerType: asset.owner_type, ownerId: asset.owner_id, visibility: asset.visibility });
  if (asset.lifecycle_status !== "ready") throw new DirectoryServiceError("invalid_transition", "Only ready media can be submitted.", 409);
  const publication = await getPublicationProfile(env, { parishId: auth.parishId, ownerType: auth.ownerType, ownerId: auth.ownerId });
  const nextStatus = publication.approvalStatus === "approved" ? "approved" : "pending_approval";
  const timestamp = nowMs();
  await runAtomic(env, [
    { sql: "UPDATE directory_media_assets SET lifecycle_status = ?, updated_at = ? WHERE id = ? AND lifecycle_status = 'ready'", params: [nextStatus, timestamp, asset.id] },
    auditStatement({
      action: "directory.media.photo_submitted",
      actor: actorFromContext(context, auth.parishId),
      parishId: auth.parishId,
      targetType: "directory_media_asset",
      targetId: asset.id,
      metadata: { ownerType: auth.ownerType, publicationStatus: publication.status, nextStatus },
      correlationId
    })
  ]);
  return getDirectoryMediaAsset(env, { context, mediaAssetId: asset.id });
}

export async function removeDirectoryMedia(env, { context, mediaAssetId, correlationId = "" }) {
  const asset = await d1First(env, "SELECT * FROM directory_media_assets WHERE id = ?1", cleanText(mediaAssetId, { required: true, max: 180, field: "mediaAssetId" }));
  if (!asset) throw new DirectoryServiceError("not_found", "Directory media was not found.", 404);
  const auth = await resolveOwnerAuthority(env, context, { ownerType: asset.owner_type, ownerId: asset.owner_id, visibility: asset.visibility });
  const timestamp = nowMs();
  await runAtomic(env, [
    { sql: "UPDATE directory_media_assets SET lifecycle_status = 'deleted', deleted_at = ?1, updated_at = ?1 WHERE id = ?2", params: [timestamp, asset.id] },
    { sql: "UPDATE directory_media_assignments SET assignment_status = 'deleted', deleted_at = ?1, updated_at = ?1 WHERE media_asset_id = ?2", params: [timestamp, asset.id] },
    auditStatement({
      action: auth.ownerType === "person" ? "directory.media.person_photo_removed" : "directory.media.household_photo_removed",
      actor: actorFromContext(context, auth.parishId),
      parishId: auth.parishId,
      targetType: "directory_media_asset",
      targetId: asset.id,
      metadata: { ownerType: auth.ownerType },
      correlationId
    })
  ]);
  return { id: asset.id, deleted: true };
}

// Secure Delivery Patch (Phase 2B.1 Part 17). Ordinary delivery of a
// directory media variant now requires -- in addition to the pre-existing
// ownership/visibility authorization -- that the specific variant was
// itself produced by a currently-accepted pipeline version and recorded as
// securely transformed. A variant that only has `ready = 1` (Phase 2B's
// old, insufficient signal) is never served; `ready` and
// `secure_transform_status = 'securely_transformed'` must both hold.
export async function streamDirectoryMediaVariant(env, { context, mediaAssetId, variantType }) {
  const asset = await d1First(env, "SELECT * FROM directory_media_assets WHERE id = ?1", cleanText(mediaAssetId, { required: true, max: 180, field: "mediaAssetId" }));
  if (!asset || asset.lifecycle_status === "deleted" || asset.lifecycle_status === "replaced" || asset.lifecycle_status === "failed") throw new DirectoryServiceError("not_found", "Directory media was not found.", 404);
  await resolveOwnerAuthority(env, context, { ownerType: asset.owner_type, ownerId: asset.owner_id, visibility: asset.visibility });
  const variant = await d1First(
    env,
    "SELECT * FROM directory_media_variants WHERE media_asset_id = ?1 AND variant_type = ?2 AND ready = 1 AND secure_transform_status = 'securely_transformed'",
    asset.id,
    cleanText(variantType, { required: true, max: 60, field: "variantType" })
  );
  if (!variant || !isAcceptedPipelineVersion(variant.pipeline_version)) {
    throw new DirectoryServiceError("not_found", "Directory media variant was not found.", 404);
  }
  const bucket = mediaBucket(env);
  if (!bucket) throw new DirectoryServiceError("storage_unavailable", "Directory media storage is not configured.", 503);
  const object = await bucket.get(variant.r2_object_key);
  if (!object) throw new DirectoryServiceError("not_found", "Directory media object was not found.", 404);
  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": variant.mime_type,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": asset.visibility === "private" ? "private, no-store" : "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'"
    }
  });
}

// Approval Hard Gate (Phase 2B.1 Part 11) -- the single, centralized
// function every media-approval path must call server-side before flipping
// a media asset to 'approved'. Throws MEDIA_SECURE_TRANSFORMATION_REQUIRED
// (never silently returns false) so a caller cannot accidentally proceed
// on a falsy-but-unhandled result. There is no parameter or code path here
// that allows a reviewer, staff member, or platform administrator to
// bypass any of these checks -- see docs/directory/25-phase-2b1-security-review.md.
export async function assertMediaAssetSecurelyTransformed(env, { mediaAssetId, parishId }) {
  const asset = await d1First(
    env,
    "SELECT * FROM directory_media_assets WHERE id = ?1 AND parish_id = ?2",
    cleanText(mediaAssetId, { required: true, max: 180, field: "mediaAssetId" }),
    cleanText(parishId, { required: true, max: 160, field: "parishId" })
  );
  if (!asset) throw new DirectoryServiceError("not_found", "Directory media was not found.", 404);
  if (asset.lifecycle_status === "deleted") {
    throw new DirectoryServiceError("MEDIA_SECURE_TRANSFORMATION_REQUIRED", "Deleted media cannot be approved.", 409);
  }
  if (asset.processing_status !== "securely_transformed" || !isAcceptedPipelineVersion(asset.pipeline_version)) {
    throw new DirectoryServiceError("MEDIA_SECURE_TRANSFORMATION_REQUIRED", "This photo has not completed secure image transformation and cannot be approved.", 409);
  }

  const requiredVariants = asset.owner_type === "person" ? PERSON_VARIANTS : HOUSEHOLD_VARIANTS;
  const variantRows = await d1All(env, "SELECT * FROM directory_media_variants WHERE media_asset_id = ?1", asset.id);
  const byType = new Map(variantRows.map((row) => [row.variant_type, row]));

  for (const required of requiredVariants) {
    const row = byType.get(required.type);
    if (!row) throw new DirectoryServiceError("MEDIA_SECURE_TRANSFORMATION_REQUIRED", `Required photo variant "${required.type}" is missing.`, 409);
    if (Number(row.ready || 0) !== 1 || row.secure_transform_status !== "securely_transformed") {
      throw new DirectoryServiceError("MEDIA_SECURE_TRANSFORMATION_REQUIRED", `Required photo variant "${required.type}" was not securely transformed.`, 409);
    }
    if (!row.transformer_name || !row.transformer_version || !row.pipeline_version || !isAcceptedPipelineVersion(row.pipeline_version)) {
      throw new DirectoryServiceError("MEDIA_SECURE_TRANSFORMATION_REQUIRED", `Required photo variant "${required.type}" is missing transformer attestation.`, 409);
    }
    if (!row.output_content_hash || String(row.output_content_hash).length !== 64) {
      throw new DirectoryServiceError("MEDIA_SECURE_TRANSFORMATION_REQUIRED", `Required photo variant "${required.type}" has an invalid output hash.`, 409);
    }
    if (Number(row.width) !== required.width || Number(row.height) !== required.height) {
      throw new DirectoryServiceError("MEDIA_SECURE_TRANSFORMATION_REQUIRED", `Required photo variant "${required.type}" does not have the expected dimensions.`, 409);
    }
    if (Number(row.metadata_stripped || 0) !== 1) {
      throw new DirectoryServiceError("MEDIA_SECURE_TRANSFORMATION_REQUIRED", `Required photo variant "${required.type}" is missing metadata-stripping confirmation.`, 409);
    }
  }

  return asset;
}

// ── Existing Media Audit & Reprocessing (Phase 2B.1 Parts 13-16) ────────
// Classifies every pre-existing directory-media asset without ever
// presuming secure status from Phase 2B's old `ready`/`processed`-style
// flags (Part 13). Idempotent: re-running produces the same classification
// for an asset whose data hasn't changed, and only writes a row when its
// classification actually changes.

const LEGACY_CLASSIFICATIONS = Object.freeze([
  "securely_transformed_by_new_pipeline",
  "legacy_unverified",
  "reprocessing_required",
  "source_unavailable",
  "processing_failed",
  "deleted",
  "safe_to_ignore"
]);

function classifyMediaAssetRow(asset, variantRows) {
  if (asset.lifecycle_status === "deleted") return "deleted";
  if (["replaced", "rejected"].includes(asset.lifecycle_status)) return "safe_to_ignore";
  if (asset.processing_status === "failed") return "processing_failed";
  if (!Number(asset.source_retained) && !asset.original_object_key) return "source_unavailable";

  const requiredVariants = asset.owner_type === "person" ? PERSON_VARIANTS : HOUSEHOLD_VARIANTS;
  const byType = new Map(variantRows.map((row) => [row.variant_type, row]));
  const allSecure = asset.processing_status === "securely_transformed"
    && isAcceptedPipelineVersion(asset.pipeline_version)
    && requiredVariants.every((required) => {
      const row = byType.get(required.type);
      return row && Number(row.ready) === 1 && row.secure_transform_status === "securely_transformed"
        && isAcceptedPipelineVersion(row.pipeline_version) && row.output_content_hash
        && Number(row.width) === required.width && Number(row.height) === required.height;
    });
  if (allSecure) return "securely_transformed_by_new_pipeline";
  if (asset.processing_status === "reprocessing_required") return "reprocessing_required";
  return "legacy_unverified";
}

// Idempotent classification pass. Scoped to one parish unless explicitly
// run platform-wide (internal use only -- every HTTP route calling into
// this must supply parishId; see handleDirectoryMediaReprocessing's
// callers, which never permit an unscoped request, per Part 23's "do not
// expose global bulk actions without strict capability and parish
// scoping").
export async function auditDirectoryMediaLegacyAssets(env, { parishId = null, correlationId = "" } = {}) {
  const assets = parishId
    ? await d1All(env, "SELECT * FROM directory_media_assets WHERE parish_id = ?1", parishId)
    : await d1All(env, "SELECT * FROM directory_media_assets");

  const counts = {};
  const actionable = [];
  const timestamp = nowMs();
  const statements = [];

  for (const asset of assets) {
    const variantRows = await d1All(env, "SELECT * FROM directory_media_variants WHERE media_asset_id = ?1", asset.id);
    const classification = classifyMediaAssetRow(asset, variantRows);

    const bucketKey = `${asset.parish_id}:${asset.owner_type}:${classification}:${asset.lifecycle_status}`;
    counts[bucketKey] = (counts[bucketKey] || 0) + 1;

    if (classification === "legacy_unverified" && asset.processing_status !== "reprocessing_required") {
      statements.push({
        sql: "UPDATE directory_media_assets SET processing_status = 'reprocessing_required', updated_at = ?1 WHERE id = ?2",
        params: [timestamp, asset.id]
      });
      statements.push(auditStatement({
        action: "directory.media.legacy_asset_marked_reprocessing_required",
        actor: { userId: "system" },
        parishId: asset.parish_id,
        targetType: "directory_media_asset",
        targetId: asset.id,
        metadata: { ownerType: asset.owner_type, previousProcessingStatus: asset.processing_status },
        correlationId
      }));
      actionable.push({ mediaAssetId: asset.id, parishId: asset.parish_id, classification: "reprocessing_required" });
    } else if (classification === "source_unavailable" && !Number(asset.reupload_required)) {
      statements.push({
        sql: "UPDATE directory_media_assets SET reupload_required = 1, updated_at = ?1 WHERE id = ?2",
        params: [timestamp, asset.id]
      });
      statements.push(auditStatement({
        action: "directory.media.reupload_required",
        actor: { userId: "system" },
        parishId: asset.parish_id,
        targetType: "directory_media_asset",
        targetId: asset.id,
        metadata: { ownerType: asset.owner_type, reason: "no_retained_source" },
        correlationId
      }));
      actionable.push({ mediaAssetId: asset.id, parishId: asset.parish_id, classification: "reupload_required" });
    }

    statements.push(auditStatement({
      action: "directory.media.legacy_asset_classified",
      actor: { userId: "system" },
      parishId: asset.parish_id,
      targetType: "directory_media_asset",
      targetId: asset.id,
      metadata: { classification, ownerType: asset.owner_type, processingStatus: asset.processing_status },
      correlationId
    }));
  }

  if (statements.length) await runAtomic(env, statements);

  return {
    totalAssets: assets.length,
    countsByParishOwnerClassificationStatus: counts,
    actionable,
    classifications: LEGACY_CLASSIFICATIONS
  };
}

// Idempotent, per-asset reprocessing. Loads the retained private original,
// re-validates it, re-runs the SAME trusted transformation pipeline used
// for new uploads, writes new versioned variant objects, and only then
// updates the asset's technical status -- never leaves an asset in a
// half-updated state (Part 14).
export async function reprocessDirectoryMediaAsset(env, { context, mediaAssetId, correlationId = "" }) {
  const asset = await d1First(
    env,
    "SELECT * FROM directory_media_assets WHERE id = ?1 AND parish_id = ?2",
    cleanText(mediaAssetId, { required: true, max: 180, field: "mediaAssetId" }),
    context.parishId
  );
  if (!asset) throw new DirectoryServiceError("not_found", "Directory media was not found.", 404);
  if (asset.lifecycle_status === "deleted") throw new DirectoryServiceError("invalid_transition", "Deleted media cannot be reprocessed.", 409);

  const actor = { userId: context.user.id };
  const timestamp = nowMs();

  if (!Number(asset.source_retained) || !asset.original_object_key) {
    await runAtomic(env, [
      { sql: "UPDATE directory_media_assets SET reupload_required = 1, updated_at = ?1 WHERE id = ?2", params: [timestamp, asset.id] },
      auditStatement({ action: "directory.media.reupload_required", actor, parishId: asset.parish_id, targetType: "directory_media_asset", targetId: asset.id, metadata: { reason: "no_retained_source" }, correlationId })
    ]);
    return { id: asset.id, reuploadRequired: true };
  }

  await runAtomic(env, [
    { sql: "UPDATE directory_media_assets SET processing_status = 'processing', updated_at = ?1 WHERE id = ?2", params: [timestamp, asset.id] },
    auditStatement({ action: "directory.media.legacy_reprocessing_started", actor, parishId: asset.parish_id, targetType: "directory_media_asset", targetId: asset.id, correlationId })
  ]);

  const bucket = mediaBucket(env);
  if (!bucket) throw new DirectoryServiceError("storage_unavailable", "Directory media storage is not configured.", 503);
  const sourceObject = await bucket.get(asset.original_object_key);
  if (!sourceObject) {
    await runAtomic(env, [
      { sql: "UPDATE directory_media_assets SET processing_status = 'failed', processing_error_code = 'MEDIA_DECODE_FAILED', processing_attempt_count = processing_attempt_count + 1, updated_at = ?1 WHERE id = ?2", params: [nowMs(), asset.id] },
      auditStatement({ action: "directory.media.legacy_reprocessing_failed", actor, parishId: asset.parish_id, targetType: "directory_media_asset", targetId: asset.id, metadata: { errorCode: "MEDIA_DECODE_FAILED" }, correlationId })
    ]);
    throw new DirectoryServiceError("MEDIA_DECODE_FAILED", "The retained source object could not be read.", 422);
  }
  const sourceArrayBuffer = await new Response(sourceObject.body).arrayBuffer();

  let decodedSource;
  const requiredVariants = asset.owner_type === "person" ? PERSON_VARIANTS : HOUSEHOLD_VARIANTS;
  const envName = env.AGAPAY_ENVIRONMENT || "production";
  const transformedVariants = [];
  try {
    decodedSource = decodeAndNormalizeSource({ sourceBytes: new Uint8Array(sourceArrayBuffer), sourceMimeType: asset.detected_mime_type });
    for (const variant of requiredVariants) {
      const transformed = await transformVariant({ decodedSource, targetWidth: variant.width, targetHeight: variant.height, crop: null });
      transformedVariants.push({
        ...variant,
        // Versioned key: distinct from the original upload's variant key so
        // the old (unverified) object is never overwritten in place (Part 16).
        key: objectKey({ envName, parishId: asset.parish_id, ownerType: asset.owner_type, ownerId: asset.owner_id, assetId: asset.id, variantType: `${variant.type}_${PIPELINE_VERSION}_${Date.now()}`, mimeType: transformed.mimeType }),
        transformed
      });
    }
  } catch (error) {
    const errorCode = error instanceof DirectoryServiceError ? error.code : "MEDIA_TRANSFORMATION_FAILED";
    await runAtomic(env, [
      { sql: "UPDATE directory_media_assets SET processing_status = 'failed', processing_error_code = ?1, processing_attempt_count = processing_attempt_count + 1, updated_at = ?2 WHERE id = ?3", params: [errorCode, nowMs(), asset.id] },
      auditStatement({ action: "directory.media.legacy_reprocessing_failed", actor, parishId: asset.parish_id, targetType: "directory_media_asset", targetId: asset.id, metadata: { errorCode }, correlationId })
    ]);
    throw error;
  }

  const existingVariants = await d1All(env, "SELECT * FROM directory_media_variants WHERE media_asset_id = ?1", asset.id);
  const oldKeysToClean = existingVariants.map((row) => row.r2_object_key);

  for (const variant of transformedVariants) await putObject(env, variant.key, variant.transformed.bytes, variant.transformed.mimeType);

  // Part 14 "Approval Policy for Legacy Approved Photos": legacy crop
  // coordinates were never persisted by Phase 2B, so this reprocessing
  // pass cannot prove the visible output is unchanged from what was
  // originally approved. Per the brief's own fallback ("if crop or
  // visible output materially changes, require reviewer confirmation"),
  // a previously-approved asset is conservatively sent back to
  // pending_approval rather than silently kept approved -- the safe
  // default when equivalence cannot be proven, not an assumption of
  // sameness.
  const nextLifecycleStatus = asset.lifecycle_status === "approved" ? "pending_approval" : asset.lifecycle_status;
  const reviewReturnTimestamp = nowMs();

  const finalizeStatements = [
    {
      sql: `UPDATE directory_media_assets
            SET processing_status = 'securely_transformed', pipeline_version = ?1, lifecycle_status = ?2,
                processing_error_code = NULL, processing_attempt_count = processing_attempt_count + 1, updated_at = ?3
            WHERE id = ?4`,
      params: [PIPELINE_VERSION, nextLifecycleStatus, reviewReturnTimestamp, asset.id]
    },
    auditStatement({
      action: "directory.media.legacy_reprocessing_completed",
      actor,
      parishId: asset.parish_id,
      targetType: "directory_media_asset",
      targetId: asset.id,
      metadata: { ownerType: asset.owner_type, pipelineVersion: PIPELINE_VERSION, lifecycleStatus: nextLifecycleStatus, wasApproved: asset.lifecycle_status === "approved" },
      correlationId
    })
  ];
  if (asset.lifecycle_status === "approved" && nextLifecycleStatus === "pending_approval") {
    finalizeStatements.push(auditStatement({
      action: "directory.review_item.reprocessing_returned_to_review",
      actor,
      parishId: asset.parish_id,
      targetType: "directory_media_asset",
      targetId: asset.id,
      metadata: { reason: "legacy_reprocessing_crop_not_provable" },
      correlationId
    }));
  }
  for (const variant of transformedVariants) {
    finalizeStatements.push({
      sql: `UPDATE directory_media_variants
              SET width = ?1, height = ?2, mime_type = ?3, byte_size = ?4, r2_object_key = ?5, content_hash = ?6, ready = 1,
                  secure_transform_status = 'securely_transformed', transformer_name = ?7, transformer_version = ?8, pipeline_version = ?9,
                  secure_transformed_at = ?10, orientation_normalized = ?11, crop_applied = ?12, metadata_stripped = 1,
                  output_content_hash = ?13, verified_at = ?10
            WHERE media_asset_id = ?14 AND variant_type = ?15`,
      params: [
        variant.transformed.width, variant.transformed.height, variant.transformed.mimeType, variant.transformed.byteSize,
        variant.key, asset.content_hash, TRANSFORMER_NAME, TRANSFORMER_VERSION, PIPELINE_VERSION,
        reviewReturnTimestamp, variant.transformed.orientationNormalized ? 1 : 0, variant.transformed.cropApplied ? 1 : 0,
        variant.transformed.outputContentHash, asset.id, variant.type
      ]
    });
  }
  await runAtomic(env, finalizeStatements);

  // Old (unverified) derivative objects are only removed AFTER the new
  // secure variants are committed and referenced above -- never before.
  for (const key of oldKeysToClean) {
    if (!transformedVariants.some((variant) => variant.key === key)) await deleteObject(env, key);
  }

  return getDirectoryMediaAsset(env, { context, mediaAssetId: asset.id });
}

export async function cleanupDirectoryMediaObjects(env, { limit = 50 } = {}) {
  const rows = await d1All(
    env,
    `SELECT v.r2_object_key FROM directory_media_variants v
     JOIN directory_media_assets a ON a.id = v.media_asset_id
     WHERE a.lifecycle_status IN ('deleted', 'replaced', 'failed')
     LIMIT ?1`,
    Number(limit) || 50
  );
  let cleaned = 0;
  for (const row of rows) {
    await deleteObject(env, row.r2_object_key);
    cleaned++;
  }
  return { cleaned };
}
