import type { MediaContext, MediaSqlRow, DirectoryStatement } from './media-contracts.js';
import {
  PERSON_VARIANTS,
  HOUSEHOLD_VARIANTS,
  mediaBucket,
  objectKey,
  putObject,
  deleteObject,
  LEGACY_CLASSIFICATIONS,
  classifyMediaAssetRow,
  d1All,
  d1First,
  DirectoryServiceError,
  auditStatement,
  cleanText,
  nowMs,
  runAtomic,
  decodeAndNormalizeSource,
  transformVariant,
  isAcceptedPipelineVersion,
  PIPELINE_VERSION,
  TRANSFORMER_NAME,
  TRANSFORMER_VERSION,
} from './media-shared.js';
import { getDirectoryMediaAsset } from './media.js';

// Approval Hard Gate (Phase 2B.1 Part 11) -- the single, centralized
// function every media-approval path must call server-side before flipping
// a media asset to 'approved'. Throws MEDIA_SECURE_TRANSFORMATION_REQUIRED
// (never silently returns false) so a caller cannot accidentally proceed
// on a falsy-but-unhandled result. There is no parameter or code path here
// that allows a reviewer, staff member, or platform administrator to
// bypass any of these checks -- see docs/directory/25-phase-2b1-security-review.md.
export async function assertMediaAssetSecurelyTransformed(
  env: Partial<Env>,
  { mediaAssetId, parishId }: { mediaAssetId: string; parishId: string }
) {
  const asset = await d1First<MediaSqlRow>(
    env,
    'SELECT * FROM directory_media_assets WHERE id = ?1 AND parish_id = ?2',
    cleanText(mediaAssetId, { required: true, max: 180, field: 'mediaAssetId' }),
    cleanText(parishId, { required: true, max: 160, field: 'parishId' })
  );
  if (!asset) throw new DirectoryServiceError('not_found', 'Directory media was not found.', 404);
  if (asset.lifecycle_status === 'deleted') {
    throw new DirectoryServiceError('MEDIA_SECURE_TRANSFORMATION_REQUIRED', 'Deleted media cannot be approved.', 409);
  }
  if (asset.processing_status !== 'securely_transformed' || !isAcceptedPipelineVersion(asset.pipeline_version)) {
    throw new DirectoryServiceError(
      'MEDIA_SECURE_TRANSFORMATION_REQUIRED',
      'This photo has not completed secure image transformation and cannot be approved.',
      409
    );
  }

  const requiredVariants = asset.owner_type === 'person' ? PERSON_VARIANTS : HOUSEHOLD_VARIANTS;
  const variantRows = await d1All<MediaSqlRow>(
    env,
    'SELECT * FROM directory_media_variants WHERE media_asset_id = ?1',
    asset.id
  );
  const byType = new Map(variantRows.map((row) => [row.variant_type, row]));

  for (const required of requiredVariants) {
    const row = byType.get(required.type);
    if (!row)
      throw new DirectoryServiceError(
        'MEDIA_SECURE_TRANSFORMATION_REQUIRED',
        `Required photo variant "${required.type}" is missing.`,
        409
      );
    if (Number(row.ready || 0) !== 1 || row.secure_transform_status !== 'securely_transformed') {
      throw new DirectoryServiceError(
        'MEDIA_SECURE_TRANSFORMATION_REQUIRED',
        `Required photo variant "${required.type}" was not securely transformed.`,
        409
      );
    }
    if (
      !row.transformer_name ||
      !row.transformer_version ||
      !row.pipeline_version ||
      !isAcceptedPipelineVersion(row.pipeline_version)
    ) {
      throw new DirectoryServiceError(
        'MEDIA_SECURE_TRANSFORMATION_REQUIRED',
        `Required photo variant "${required.type}" is missing transformer attestation.`,
        409
      );
    }
    if (!row.output_content_hash || String(row.output_content_hash).length !== 64) {
      throw new DirectoryServiceError(
        'MEDIA_SECURE_TRANSFORMATION_REQUIRED',
        `Required photo variant "${required.type}" has an invalid output hash.`,
        409
      );
    }
    if (Number(row.width) !== required.width || Number(row.height) !== required.height) {
      throw new DirectoryServiceError(
        'MEDIA_SECURE_TRANSFORMATION_REQUIRED',
        `Required photo variant "${required.type}" does not have the expected dimensions.`,
        409
      );
    }
    if (Number(row.metadata_stripped || 0) !== 1) {
      throw new DirectoryServiceError(
        'MEDIA_SECURE_TRANSFORMATION_REQUIRED',
        `Required photo variant "${required.type}" is missing metadata-stripping confirmation.`,
        409
      );
    }
  }

  return asset;
}

// Idempotent classification pass. Scoped to one parish unless explicitly
// run platform-wide (internal use only -- every HTTP route calling into
// this must supply parishId; see handleDirectoryMediaReprocessing's
// callers, which never permit an unscoped request, per Part 23's "do not
// expose global bulk actions without strict capability and parish
// scoping").
export async function auditDirectoryMediaLegacyAssets(
  env: Partial<Env>,
  { parishId = null, correlationId = '' }: { parishId?: string | null; correlationId?: string } = {}
) {
  const assets = parishId
    ? await d1All<MediaSqlRow>(env, 'SELECT * FROM directory_media_assets WHERE parish_id = ?1', parishId)
    : await d1All<MediaSqlRow>(env, 'SELECT * FROM directory_media_assets');

  const counts: Record<string, number> = {};
  const actionable = [];
  const timestamp = nowMs();
  const statements: DirectoryStatement[] = [];

  for (const asset of assets) {
    const variantRows = await d1All<MediaSqlRow>(
      env,
      'SELECT * FROM directory_media_variants WHERE media_asset_id = ?1',
      asset.id
    );
    const classification = classifyMediaAssetRow(asset, variantRows);

    const bucketKey = `${asset.parish_id}:${asset.owner_type}:${classification}:${asset.lifecycle_status}`;
    counts[bucketKey] = (counts[bucketKey] || 0) + 1;

    if (classification === 'legacy_unverified' && asset.processing_status !== 'reprocessing_required') {
      statements.push({
        sql: "UPDATE directory_media_assets SET processing_status = 'reprocessing_required', updated_at = ?1 WHERE id = ?2",
        params: [timestamp, asset.id],
      });
      statements.push(
        auditStatement({
          action: 'directory.media.legacy_asset_marked_reprocessing_required',
          actor: { userId: 'system' },
          parishId: asset.parish_id,
          targetType: 'directory_media_asset',
          targetId: asset.id,
          metadata: { ownerType: asset.owner_type, previousProcessingStatus: asset.processing_status },
          correlationId,
        })
      );
      actionable.push({ mediaAssetId: asset.id, parishId: asset.parish_id, classification: 'reprocessing_required' });
    } else if (classification === 'source_unavailable' && !Number(asset.reupload_required)) {
      statements.push({
        sql: 'UPDATE directory_media_assets SET reupload_required = 1, updated_at = ?1 WHERE id = ?2',
        params: [timestamp, asset.id],
      });
      statements.push(
        auditStatement({
          action: 'directory.media.reupload_required',
          actor: { userId: 'system' },
          parishId: asset.parish_id,
          targetType: 'directory_media_asset',
          targetId: asset.id,
          metadata: { ownerType: asset.owner_type, reason: 'no_retained_source' },
          correlationId,
        })
      );
      actionable.push({ mediaAssetId: asset.id, parishId: asset.parish_id, classification: 'reupload_required' });
    }

    statements.push(
      auditStatement({
        action: 'directory.media.legacy_asset_classified',
        actor: { userId: 'system' },
        parishId: asset.parish_id,
        targetType: 'directory_media_asset',
        targetId: asset.id,
        metadata: { classification, ownerType: asset.owner_type, processingStatus: asset.processing_status },
        correlationId,
      })
    );
  }

  if (statements.length) await runAtomic(env, statements);

  return {
    totalAssets: assets.length,
    countsByParishOwnerClassificationStatus: counts,
    actionable,
    classifications: LEGACY_CLASSIFICATIONS,
  };
}

// Idempotent, per-asset reprocessing. Loads the retained private original,
// re-validates it, re-runs the SAME trusted transformation pipeline used
// for new uploads, writes new versioned variant objects, and only then
// updates the asset's technical status -- never leaves an asset in a
// half-updated state (Part 14).
export async function reprocessDirectoryMediaAsset(
  env: Partial<Env>,
  { context, mediaAssetId, correlationId = '' }: { context: MediaContext; mediaAssetId: string; correlationId?: string }
) {
  const asset = await d1First<MediaSqlRow>(
    env,
    'SELECT * FROM directory_media_assets WHERE id = ?1 AND parish_id = ?2',
    cleanText(mediaAssetId, { required: true, max: 180, field: 'mediaAssetId' }),
    context.parishId
  );
  if (!asset) throw new DirectoryServiceError('not_found', 'Directory media was not found.', 404);
  if (asset.lifecycle_status === 'deleted')
    throw new DirectoryServiceError('invalid_transition', 'Deleted media cannot be reprocessed.', 409);

  const actor = { userId: context.user!.id };
  const timestamp = nowMs();

  if (!Number(asset.source_retained) || !asset.original_object_key) {
    await runAtomic(env, [
      {
        sql: 'UPDATE directory_media_assets SET reupload_required = 1, updated_at = ?1 WHERE id = ?2',
        params: [timestamp, asset.id],
      },
      auditStatement({
        action: 'directory.media.reupload_required',
        actor,
        parishId: asset.parish_id,
        targetType: 'directory_media_asset',
        targetId: asset.id,
        metadata: { reason: 'no_retained_source' },
        correlationId,
      }),
    ]);
    return { id: asset.id, reuploadRequired: true };
  }

  await runAtomic(env, [
    {
      sql: "UPDATE directory_media_assets SET processing_status = 'processing', updated_at = ?1 WHERE id = ?2",
      params: [timestamp, asset.id],
    },
    auditStatement({
      action: 'directory.media.legacy_reprocessing_started',
      actor,
      parishId: asset.parish_id,
      targetType: 'directory_media_asset',
      targetId: asset.id,
      correlationId,
    }),
  ]);

  const bucket = mediaBucket(env);
  if (!bucket)
    throw new DirectoryServiceError('storage_unavailable', 'Directory media storage is not configured.', 503);
  const sourceObject = await bucket.get(asset.original_object_key);
  if (!sourceObject) {
    await runAtomic(env, [
      {
        sql: "UPDATE directory_media_assets SET processing_status = 'failed', processing_error_code = 'MEDIA_DECODE_FAILED', processing_attempt_count = processing_attempt_count + 1, updated_at = ?1 WHERE id = ?2",
        params: [nowMs(), asset.id],
      },
      auditStatement({
        action: 'directory.media.legacy_reprocessing_failed',
        actor,
        parishId: asset.parish_id,
        targetType: 'directory_media_asset',
        targetId: asset.id,
        metadata: { errorCode: 'MEDIA_DECODE_FAILED' },
        correlationId,
      }),
    ]);
    throw new DirectoryServiceError('MEDIA_DECODE_FAILED', 'The retained source object could not be read.', 422);
  }
  const sourceArrayBuffer = await new Response(sourceObject.body).arrayBuffer();

  let decodedSource;
  const requiredVariants = asset.owner_type === 'person' ? PERSON_VARIANTS : HOUSEHOLD_VARIANTS;
  const envName = env.AGAPAY_ENVIRONMENT || 'production';
  const transformedVariants = [];
  try {
    decodedSource = decodeAndNormalizeSource({
      sourceBytes: new Uint8Array(sourceArrayBuffer),
      sourceMimeType: asset.detected_mime_type,
    });
    for (const variant of requiredVariants) {
      const transformed = await transformVariant({
        decodedSource,
        targetWidth: variant.width,
        targetHeight: variant.height,
        crop: null,
      });
      transformedVariants.push({
        ...variant,
        // Versioned key: distinct from the original upload's variant key so
        // the old (unverified) object is never overwritten in place (Part 16).
        key: objectKey({
          envName,
          parishId: asset.parish_id,
          ownerType: asset.owner_type,
          ownerId: asset.owner_id,
          assetId: asset.id,
          variantType: `${variant.type}_${PIPELINE_VERSION}_${Date.now()}`,
          mimeType: transformed.mimeType,
        }),
        transformed,
      });
    }
  } catch (error) {
    const errorCode = error instanceof DirectoryServiceError ? error.code : 'MEDIA_TRANSFORMATION_FAILED';
    await runAtomic(env, [
      {
        sql: "UPDATE directory_media_assets SET processing_status = 'failed', processing_error_code = ?1, processing_attempt_count = processing_attempt_count + 1, updated_at = ?2 WHERE id = ?3",
        params: [errorCode, nowMs(), asset.id],
      },
      auditStatement({
        action: 'directory.media.legacy_reprocessing_failed',
        actor,
        parishId: asset.parish_id,
        targetType: 'directory_media_asset',
        targetId: asset.id,
        metadata: { errorCode },
        correlationId,
      }),
    ]);
    throw error;
  }

  const existingVariants = await d1All<MediaSqlRow>(
    env,
    'SELECT * FROM directory_media_variants WHERE media_asset_id = ?1',
    asset.id
  );
  const oldKeysToClean = existingVariants.map((row) => row.r2_object_key);

  for (const variant of transformedVariants)
    await putObject(env, variant.key, variant.transformed.bytes, variant.transformed.mimeType, asset.parish_id);

  // Part 14 "Approval Policy for Legacy Approved Photos": legacy crop
  // coordinates were never persisted by Phase 2B, so this reprocessing
  // pass cannot prove the visible output is unchanged from what was
  // originally approved. Per the brief's own fallback ("if crop or
  // visible output materially changes, require reviewer confirmation"),
  // a previously-approved asset is conservatively sent back to
  // pending_approval rather than silently kept approved -- the safe
  // default when equivalence cannot be proven, not an assumption of
  // sameness.
  const nextLifecycleStatus = asset.lifecycle_status === 'approved' ? 'pending_approval' : asset.lifecycle_status;
  const reviewReturnTimestamp = nowMs();

  const finalizeStatements = [
    {
      sql: `UPDATE directory_media_assets
            SET processing_status = 'securely_transformed', pipeline_version = ?1, lifecycle_status = ?2,
                processing_error_code = NULL, processing_attempt_count = processing_attempt_count + 1, updated_at = ?3
            WHERE id = ?4`,
      params: [PIPELINE_VERSION, nextLifecycleStatus, reviewReturnTimestamp, asset.id],
    },
    auditStatement({
      action: 'directory.media.legacy_reprocessing_completed',
      actor,
      parishId: asset.parish_id,
      targetType: 'directory_media_asset',
      targetId: asset.id,
      metadata: {
        ownerType: asset.owner_type,
        pipelineVersion: PIPELINE_VERSION,
        lifecycleStatus: nextLifecycleStatus,
        wasApproved: asset.lifecycle_status === 'approved',
      },
      correlationId,
    }),
  ];
  if (asset.lifecycle_status === 'approved' && nextLifecycleStatus === 'pending_approval') {
    finalizeStatements.push(
      auditStatement({
        action: 'directory.review_item.reprocessing_returned_to_review',
        actor,
        parishId: asset.parish_id,
        targetType: 'directory_media_asset',
        targetId: asset.id,
        metadata: { reason: 'legacy_reprocessing_crop_not_provable' },
        correlationId,
      })
    );
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
        variant.transformed.width,
        variant.transformed.height,
        variant.transformed.mimeType,
        variant.transformed.byteSize,
        variant.key,
        asset.content_hash,
        TRANSFORMER_NAME,
        TRANSFORMER_VERSION,
        PIPELINE_VERSION,
        reviewReturnTimestamp,
        variant.transformed.orientationNormalized ? 1 : 0,
        variant.transformed.cropApplied ? 1 : 0,
        variant.transformed.outputContentHash,
        asset.id,
        variant.type,
      ],
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

export async function cleanupDirectoryMediaObjects(env: Partial<Env>, { limit = 50 }: { limit?: number } = {}) {
  const rows = await d1All<MediaSqlRow>(
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
