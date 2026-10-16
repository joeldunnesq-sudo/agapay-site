// Generated from src/directory/admin-media-operations.ts by npm run build:server. Do not edit.
import '../lib/entitlements.js';
import { actorDto } from './admin-actor.js';
import '../lib/authorization.js';
import { d1First } from '../lib/core.js';
import '../handlers/parish.js';
import '../lib/household-verification.js';
import './foundation.js';
import { DirectoryServiceError } from './foundation.js';
import './publication.js';
import './privacy.js';
import { DIRECTORY_MEDIA_BUCKET, auditDirectoryMediaLegacyAssets, reprocessDirectoryMediaAsset } from './media.js';
import { isAcceptedPipelineVersion } from './media-transform.js';
import './duplicates.js';
import './child-publication.js';
import './ministries.js';
import './settings.js';
import './review-correspondence.js';
import './household-share-invitations.js';
import { auditStatement, cleanText, DIRECTORY_CAPABILITIES, runAtomic } from './shared.js';
import './admin-shared.js';
import { requireAny } from './admin-context.js';
import './admin-review-queue.js';
import './admin-shared.js';
import './admin-person-records.js';
import './admin-review-commands.js';
import './admin-review-approval.js';
import './admin-household-records.js';
import './admin-notes-duplicates.js';
function adminMediaDto(row, preferredVariant = '') {
  if (!row?.id) return null;
  const variantType = preferredVariant || (row.owner_type === 'household' ? 'household_card' : 'avatar_medium');
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    mediaPurpose: row.media_purpose,
    lifecycleStatus: row.lifecycle_status,
    processingStatus: row.processing_status,
    visibility: row.visibility,
    publicationEligible: Number(row.publication_eligible || 0) === 1,
    originalWidth: Number(row.original_width || 0),
    originalHeight: Number(row.original_height || 0),
    variantType,
    url: `/api/parish/dashboard/${encodeURIComponent(row.parish_id)}/directory/admin/media/${encodeURIComponent(row.id)}/variants/${encodeURIComponent(variantType)}`,
  };
}
async function currentAdminMediaForOwner(env, { parishId, ownerType, ownerId }) {
  const purpose = ownerType === 'household' ? 'household_profile_photo' : 'person_profile_photo';
  const row = await d1First(
    env,
    `SELECT a.* FROM directory_media_assets a
       JOIN directory_media_assignments asn ON asn.media_asset_id = a.id
      WHERE asn.parish_id = ?1 AND asn.owner_type = ?2 AND asn.owner_id = ?3
        AND asn.media_purpose = ?4 AND asn.assignment_status IN ('active','candidate')
        AND a.lifecycle_status NOT IN ('deleted','replaced','failed')
      ORDER BY CASE asn.assignment_status WHEN 'active' THEN 0 ELSE 1 END, a.created_at DESC
      LIMIT 1`,
    parishId,
    ownerType,
    ownerId,
    purpose
  );
  return adminMediaDto(row, ownerType === 'household' ? 'household_card' : 'avatar_medium');
}
async function getDirectoryMediaLegacyAudit(env, { context, correlationId = '' }) {
  requireAny(actorDto(context), context.parishId, [
    DIRECTORY_CAPABILITIES.mediaReprocess,
    DIRECTORY_CAPABILITIES.publicationReview,
    DIRECTORY_CAPABILITIES.manage,
  ]);
  return auditDirectoryMediaLegacyAssets(env, { parishId: context.parishId, correlationId });
}
async function requestDirectoryMediaReprocessing(env, { context, mediaAssetId, correlationId = '' }) {
  requireAny(actorDto(context), context.parishId, [
    DIRECTORY_CAPABILITIES.mediaReprocess,
    DIRECTORY_CAPABILITIES.manage,
  ]);
  const asset = await reprocessDirectoryMediaAsset(env, { context, mediaAssetId, correlationId });
  await runAtomic(env, [
    auditStatement({
      action: 'directory.media.reviewer_requested_reprocessing',
      actor: actorDto(context),
      parishId: context.parishId,
      targetType: 'directory_media_asset',
      targetId: mediaAssetId,
      correlationId,
    }),
  ]);
  return asset;
}
async function streamDirectoryAdminMediaVariant(env, { context, mediaAssetId, variantType }) {
  requireAny(actorDto(context), context.parishId, [
    DIRECTORY_CAPABILITIES.householdsManage,
    DIRECTORY_CAPABILITIES.requestsReview,
    DIRECTORY_CAPABILITIES.publicationReview,
    DIRECTORY_CAPABILITIES.manage,
  ]);
  const asset = await d1First(
    env,
    'SELECT * FROM directory_media_assets WHERE id = ?1 AND parish_id = ?2',
    cleanText(mediaAssetId, { required: true, max: 180, field: 'mediaAssetId' }),
    context.parishId
  );
  if (!asset || ['deleted', 'replaced', 'failed'].includes(asset.lifecycle_status)) {
    throw new DirectoryServiceError('not_found', 'Directory media was not found.', 404);
  }
  const variant = await d1First(
    env,
    "SELECT * FROM directory_media_variants WHERE media_asset_id = ?1 AND variant_type = ?2 AND ready = 1 AND secure_transform_status = 'securely_transformed'",
    asset.id,
    cleanText(variantType, { required: true, max: 60, field: 'variantType' })
  );
  if (!variant || !isAcceptedPipelineVersion(variant.pipeline_version)) {
    throw new DirectoryServiceError('not_found', 'Directory media variant was not found.', 404);
  }
  const bucket = env?.[DIRECTORY_MEDIA_BUCKET];
  if (!bucket)
    throw new DirectoryServiceError('storage_unavailable', 'Directory media storage is not configured.', 503);
  const object = await bucket.get(variant.r2_object_key);
  if (!object) throw new DirectoryServiceError('not_found', 'Directory media object was not found.', 404);
  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': variant.mime_type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
export {
  adminMediaDto,
  currentAdminMediaForOwner,
  getDirectoryMediaLegacyAudit,
  requestDirectoryMediaReprocessing,
  streamDirectoryAdminMediaVariant,
};
