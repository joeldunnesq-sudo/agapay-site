// Generated from src/directory/media-shared.ts by npm run build:server. Do not edit.
import { d1All, d1First, d1Run, generateSecret } from '../lib/core.js';
import { DirectoryServiceError } from './foundation.js';
import { evaluateFieldPolicy, getPersonPrivacyFlags } from './privacy.js';
import { getPublicationProfile } from './publication.js';
import { auditStatement, cleanText, maskValue, nowMs, runAtomic, safeJson, VISIBILITY_RANK } from './shared.js';
import {
  decodeAndNormalizeSource,
  transformVariant,
  isAcceptedPipelineVersion,
  PIPELINE_VERSION,
  TRANSFORMER_NAME,
  TRANSFORMER_VERSION,
} from './media-transform.js';
const DIRECTORY_MEDIA_BUCKET = 'DIRECTORY_MEDIA';
const DIRECTORY_MEDIA_LIMITS = Object.freeze({
  maxFileSizeBytes: 10 * 1024 * 1024,
  minWidth: 1,
  minHeight: 1,
  maxWidth: 12e3,
  maxHeight: 12e3,
  maxDecodedPixels: 36e6,
  uploadSessionTtlMs: 15 * 60 * 1e3,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  rejectedTypes: ['image/svg+xml', 'application/pdf', 'application/x-msdownload', 'application/zip'],
});
const PURPOSES = Object.freeze({
  person: 'person_profile_photo',
  household: 'household_profile_photo',
});
const PERSON_VARIANTS = Object.freeze([
  { type: 'avatar_small', width: 96, height: 96 },
  { type: 'avatar_medium', width: 256, height: 256 },
  { type: 'avatar_large', width: 512, height: 512 },
  { type: 'review_preview', width: 512, height: 512 },
]);
const HOUSEHOLD_VARIANTS = Object.freeze([
  { type: 'household_card', width: 640, height: 480 },
  { type: 'review_preview', width: 640, height: 480 },
]);
function mediaBucket(env) {
  return env?.[DIRECTORY_MEDIA_BUCKET];
}
function sanitizeFilename(filename) {
  const base = String(filename || 'photo')
    .replace(/[\\/]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/["'\r\n]/g, '')
    .trim()
    .slice(0, 160);
  return base || 'photo';
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
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((byte, index) => head[index] === byte)) return null;
  if (String.fromCharCode(...head.slice(12, 16)) !== 'IHDR')
    throw new DirectoryServiceError('invalid_image', 'PNG image is malformed.', 422);
  return { mimeType: 'image/png', width: u32be(head, 16), height: u32be(head, 20) };
}
function parseJpeg(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  if (data[0] !== 255 || data[1] !== 216) return null;
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 255) throw new DirectoryServiceError('invalid_image', 'JPEG image is malformed.', 422);
    const marker = data[offset + 1];
    const length = u16be(data, offset + 2);
    if (length < 2) throw new DirectoryServiceError('invalid_image', 'JPEG image is malformed.', 422);
    if (
      (marker >= 192 && marker <= 195) ||
      (marker >= 197 && marker <= 199) ||
      (marker >= 201 && marker <= 203) ||
      (marker >= 205 && marker <= 207)
    ) {
      return { mimeType: 'image/jpeg', height: u16be(data, offset + 5), width: u16be(data, offset + 7) };
    }
    offset += 2 + length;
  }
  throw new DirectoryServiceError('invalid_image', 'JPEG dimensions could not be read.', 422);
}
function parseWebp(arrayBuffer) {
  const head = bytes(arrayBuffer, 0, 32);
  if (String.fromCharCode(...head.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...head.slice(8, 12)) !== 'WEBP')
    return null;
  const chunk = String.fromCharCode(...head.slice(12, 16));
  if (chunk === 'VP8X') {
    return { mimeType: 'image/webp', width: u24le(head, 24) + 1, height: u24le(head, 27) + 1 };
  }
  if (chunk === 'VP8 ' && head.length >= 30) {
    return {
      mimeType: 'image/webp',
      width: u16be(new Uint8Array([head[27], head[26]]), 0) & 16383,
      height: u16be(new Uint8Array([head[29], head[28]]), 0) & 16383,
    };
  }
  if (chunk === 'VP8L') {
    const b0 = head[21],
      b1 = head[22],
      b2 = head[23],
      b3 = head[24];
    return {
      mimeType: 'image/webp',
      width: 1 + (((b1 & 63) << 8) | b0),
      height: 1 + (((b3 & 15) << 10) | (b2 << 2) | ((b1 & 192) >> 6)),
    };
  }
  throw new DirectoryServiceError('invalid_image', 'WebP image is malformed or unsupported.', 422);
}
function purposeFor(ownerType) {
  if (!PURPOSES[ownerType]) throw new DirectoryServiceError('validation_failed', 'Unsupported media owner type.', 422);
  return PURPOSES[ownerType];
}
function objectExt(mimeType) {
  return mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
}
async function sha256ArrayBufferHex(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function objectKey({ envName = 'production', parishId, ownerType, ownerId, assetId, variantType, mimeType }) {
  const safeParish = String(parishId || 'parish').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeOwner = String(ownerId || 'owner').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `directory/${envName}/${safeParish}/${ownerType}/${safeOwner}/${assetId}/${variantType}.${objectExt(mimeType)}`;
}
function actorFromContext(context, parishId) {
  return {
    userId: context.user.id,
    parishId,
    personId: context.currentPerson?.id,
    capabilities: ['directory.self.manage'],
  };
}
async function resolveOwnerAuthority(env, context, { ownerType, ownerId, visibility = 'private' }) {
  if (!context?.claimed)
    throw new DirectoryServiceError('unclaimed', 'Claim a directory person before managing directory photos.', 403);
  const type = cleanText(ownerType, { required: true, max: 40, field: 'ownerType' });
  const id = cleanText(ownerId, { required: true, max: 160, field: 'ownerId' });
  if (type === 'person') {
    if (id !== context.currentPerson.id)
      throw new DirectoryServiceError('forbidden', "You cannot manage another adult's profile photo.", 403);
    const parishId = context.activeParishContexts[0]?.parishId || context.currentPerson.createdByParishId;
    const flags = await getPersonPrivacyFlags(env, { parishId, personId: id });
    if (flags.isChild)
      throw new DirectoryServiceError(
        'child_photo_denied',
        'Child profile photos are deferred and hidden by default.',
        403
      );
    const policy = await evaluateFieldPolicy(env, {
      parishId,
      ownerType: 'person',
      ownerId: id,
      fieldKey: 'person_photo',
      requestedVisibility: visibility,
      publicationEligible: visibility === 'directory_members',
    });
    if (policy.visibility !== visibility)
      throw new DirectoryServiceError('privacy_policy_denied', 'Requested photo visibility is not permitted.', 403);
    return {
      parishId,
      ownerType: type,
      ownerId: id,
      mediaPurpose: purposeFor(type),
      flags,
      visibility: policy.visibility,
      publicationEligible: policy.publicationEligible,
    };
  }
  if (type === 'household') {
    const managed = context.manageableHouseholds.find((household) => household.id === id);
    if (!managed) throw new DirectoryServiceError('forbidden', 'You cannot manage this household photo.', 403);
    const policy = await evaluateFieldPolicy(env, {
      parishId: managed.parishId,
      ownerType: 'household',
      ownerId: id,
      fieldKey: 'household_photo',
      requestedVisibility: visibility,
      publicationEligible: visibility === 'directory_members',
    });
    if (policy.visibility !== visibility)
      throw new DirectoryServiceError('privacy_policy_denied', 'Requested photo visibility is not permitted.', 403);
    return {
      parishId: managed.parishId,
      ownerType: type,
      ownerId: id,
      mediaPurpose: purposeFor(type),
      flags: {},
      visibility: policy.visibility,
      publicationEligible: policy.publicationEligible,
    };
  }
  throw new DirectoryServiceError('validation_failed', 'Unsupported media owner type.', 422);
}
async function putObject(env, key, arrayBuffer, mimeType, parishId) {
  const bucket = mediaBucket(env);
  if (!bucket)
    throw new DirectoryServiceError('storage_unavailable', 'Directory media storage is not configured.', 503);
  await bucket.put(key, arrayBuffer, {
    customMetadata: { agapayParishId: parishId },
    httpMetadata: { contentType: mimeType },
  });
}
async function deleteObject(env, key) {
  const bucket = mediaBucket(env);
  if (!bucket || !key) return;
  await bucket.delete(key);
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
    pipelineVersion: asset.pipeline_version || '',
    variants: variants.map((variant) => ({
      type: variant.variant_type,
      width: variant.width,
      height: variant.height,
      ready: Number(variant.ready || 0) === 1,
      // Safe technical status only -- never the raw R2 object key (Part 12).
      secureTransformStatus: variant.secure_transform_status || 'unverified',
      transformerVersion: variant.transformer_version || '',
      pipelineVersion: variant.pipeline_version || '',
    })),
    createdAt: Number(asset.created_at || 0),
    updatedAt: Number(asset.updated_at || 0),
  };
}
const LEGACY_CLASSIFICATIONS = Object.freeze([
  'securely_transformed_by_new_pipeline',
  'legacy_unverified',
  'reprocessing_required',
  'source_unavailable',
  'processing_failed',
  'deleted',
  'safe_to_ignore',
]);
function classifyMediaAssetRow(asset, variantRows) {
  if (asset.lifecycle_status === 'deleted') return 'deleted';
  if (['replaced', 'rejected'].includes(asset.lifecycle_status)) return 'safe_to_ignore';
  if (asset.processing_status === 'failed') return 'processing_failed';
  if (!Number(asset.source_retained) && !asset.original_object_key) return 'source_unavailable';
  const requiredVariants = asset.owner_type === 'person' ? PERSON_VARIANTS : HOUSEHOLD_VARIANTS;
  const byType = new Map(variantRows.map((row) => [row.variant_type, row]));
  const allSecure =
    asset.processing_status === 'securely_transformed' &&
    isAcceptedPipelineVersion(asset.pipeline_version) &&
    requiredVariants.every((required) => {
      const row = byType.get(required.type);
      return (
        row &&
        Number(row.ready) === 1 &&
        row.secure_transform_status === 'securely_transformed' &&
        isAcceptedPipelineVersion(row.pipeline_version) &&
        row.output_content_hash &&
        Number(row.width) === required.width &&
        Number(row.height) === required.height
      );
    });
  if (allSecure) return 'securely_transformed_by_new_pipeline';
  if (asset.processing_status === 'reprocessing_required') return 'reprocessing_required';
  return 'legacy_unverified';
}
export {
  DIRECTORY_MEDIA_BUCKET,
  DIRECTORY_MEDIA_LIMITS,
  DirectoryServiceError,
  HOUSEHOLD_VARIANTS,
  LEGACY_CLASSIFICATIONS,
  PERSON_VARIANTS,
  PIPELINE_VERSION,
  PURPOSES,
  TRANSFORMER_NAME,
  TRANSFORMER_VERSION,
  VISIBILITY_RANK,
  actorFromContext,
  auditStatement,
  bytes,
  classifyMediaAssetRow,
  cleanText,
  d1All,
  d1First,
  d1Run,
  decodeAndNormalizeSource,
  deleteObject,
  evaluateFieldPolicy,
  generateSecret,
  getPersonPrivacyFlags,
  getPublicationProfile,
  isAcceptedPipelineVersion,
  maskValue,
  mediaAssetDto,
  mediaBucket,
  nowMs,
  objectExt,
  objectKey,
  parseJpeg,
  parsePng,
  parseWebp,
  purposeFor,
  putObject,
  resolveOwnerAuthority,
  runAtomic,
  safeJson,
  sanitizeFilename,
  sha256ArrayBufferHex,
  transformVariant,
  u16be,
  u24le,
  u32be,
};
