// Generated from src/directory/media.ts by npm run build:server. Do not edit.
import {
  DIRECTORY_MEDIA_LIMITS,
  PERSON_VARIANTS,
  HOUSEHOLD_VARIANTS,
  mediaBucket,
  sanitizeFilename,
  parsePng,
  parseJpeg,
  parseWebp,
  sha256ArrayBufferHex,
  objectKey,
  actorFromContext,
  resolveOwnerAuthority,
  putObject,
  mediaAssetDto,
  d1All,
  d1First,
  generateSecret,
  DirectoryServiceError,
  getPublicationProfile,
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
import './media-maintenance.js';
import {
  assertMediaAssetSecurelyTransformed,
  auditDirectoryMediaLegacyAssets,
  reprocessDirectoryMediaAsset,
  cleanupDirectoryMediaObjects,
} from './media-maintenance.js';
function validateCrop(crop = {}, ownerType = 'person') {
  if (!crop || Object.keys(crop).length === 0) return null;
  const x = Number(crop.x),
    y = Number(crop.y),
    width = Number(crop.width),
    height = Number(crop.height);
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0) {
    throw new DirectoryServiceError('invalid_crop', 'Crop values must be positive finite numbers.', 422);
  }
  const ratio = width / height;
  const expected = ownerType === 'person' ? 1 : 4 / 3;
  if (Math.abs(ratio - expected) > 0.05) {
    throw new DirectoryServiceError('invalid_crop', 'Crop ratio is not supported for this photo type.', 422);
  }
  return { x, y, width, height };
}
function validateDirectoryImageUpload({
  filename = '',
  declaredMimeType = '',
  arrayBuffer,
  ownerType = 'person',
  crop = null,
}) {
  if (!arrayBuffer || arrayBuffer.byteLength === 0)
    throw new DirectoryServiceError('empty_upload', 'The uploaded image is empty.', 422);
  if (arrayBuffer.byteLength > DIRECTORY_MEDIA_LIMITS.maxFileSizeBytes)
    throw new DirectoryServiceError('file_too_large', 'The uploaded image exceeds the 10 MB limit.', 422);
  const declared = String(declaredMimeType || '').toLowerCase();
  if (declared && !DIRECTORY_MEDIA_LIMITS.allowedMimeTypes.includes(declared)) {
    throw new DirectoryServiceError('unsupported_media_type', 'Only JPEG, PNG, and WebP images are accepted.', 422);
  }
  const detected = parsePng(arrayBuffer) || parseJpeg(arrayBuffer) || parseWebp(arrayBuffer);
  if (!detected)
    throw new DirectoryServiceError('unsupported_media_type', 'The file contents are not a supported image.', 422);
  if (declared && declared !== detected.mimeType)
    throw new DirectoryServiceError(
      'mime_spoof_denied',
      'The file contents do not match the declared image type.',
      422
    );
  if (detected.width < DIRECTORY_MEDIA_LIMITS.minWidth || detected.height < DIRECTORY_MEDIA_LIMITS.minHeight) {
    throw new DirectoryServiceError('image_too_small', 'The image dimensions are too small.', 422);
  }
  if (detected.width > DIRECTORY_MEDIA_LIMITS.maxWidth || detected.height > DIRECTORY_MEDIA_LIMITS.maxHeight) {
    throw new DirectoryServiceError('image_too_large', 'The image dimensions exceed the directory limit.', 422);
  }
  const pixels = detected.width * detected.height;
  if (pixels > DIRECTORY_MEDIA_LIMITS.maxDecodedPixels)
    throw new DirectoryServiceError('image_pixel_limit', 'The image is too large to process safely.', 422);
  const normalizedCrop = validateCrop(crop, ownerType);
  if (
    normalizedCrop &&
    (normalizedCrop.x + normalizedCrop.width > detected.width ||
      normalizedCrop.y + normalizedCrop.height > detected.height)
  ) {
    throw new DirectoryServiceError('invalid_crop', 'Crop bounds are outside the image.', 422);
  }
  return {
    filename: sanitizeFilename(filename),
    mimeType: detected.mimeType,
    width: detected.width,
    height: detected.height,
    pixels,
    crop: normalizedCrop,
  };
}
async function createDirectoryMediaUploadSession(
  env,
  { context, ownerType, ownerId, visibility = 'private', correlationId = '' }
) {
  const auth = await resolveOwnerAuthority(env, context, { ownerType, ownerId, visibility });
  const timestamp = nowMs();
  const sessionId = generateSecret('dir_media_session');
  await runAtomic(env, [
    {
      sql: `INSERT INTO directory_media_upload_sessions
              (id, parish_id, owner_type, owner_id, media_purpose, requested_visibility,
               created_by_user_id, status, expires_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      params: [
        sessionId,
        auth.parishId,
        auth.ownerType,
        auth.ownerId,
        auth.mediaPurpose,
        auth.visibility,
        context.user.id,
        timestamp + DIRECTORY_MEDIA_LIMITS.uploadSessionTtlMs,
        timestamp,
        timestamp,
      ],
    },
    auditStatement({
      action:
        auth.ownerType === 'person'
          ? 'directory.media.person_upload_initiated'
          : 'directory.media.household_upload_initiated',
      actor: actorFromContext(context, auth.parishId),
      parishId: auth.parishId,
      targetType: `directory_${auth.ownerType}`,
      targetId: auth.ownerId,
      metadata: { mediaPurpose: auth.mediaPurpose },
      correlationId,
    }),
  ]);
  return {
    id: sessionId,
    parishId: auth.parishId,
    ownerType: auth.ownerType,
    ownerId: auth.ownerId,
    mediaPurpose: auth.mediaPurpose,
    visibility: auth.visibility,
    expiresAt: timestamp + DIRECTORY_MEDIA_LIMITS.uploadSessionTtlMs,
  };
}
async function completeDirectoryMediaUpload(
  env,
  { context, sessionId, file, arrayBuffer, crop = null, correlationId = '' }
) {
  const session = await d1First(
    env,
    'SELECT * FROM directory_media_upload_sessions WHERE id = ?1',
    cleanText(sessionId, { required: true, max: 180, field: 'sessionId' })
  );
  if (!session || session.created_by_user_id !== context.user.id)
    throw new DirectoryServiceError('not_found', 'Upload session was not found.', 404);
  if (session.status !== 'pending')
    throw new DirectoryServiceError('upload_session_used', 'Upload session is no longer pending.', 409);
  if (Number(session.expires_at) <= nowMs())
    throw new DirectoryServiceError('upload_session_expired', 'Upload session expired.', 409);
  const auth = await resolveOwnerAuthority(env, context, {
    ownerType: session.owner_type,
    ownerId: session.owner_id,
    visibility: session.requested_visibility,
  });
  const validation = validateDirectoryImageUpload({
    filename: file?.name,
    declaredMimeType: file?.type,
    arrayBuffer,
    ownerType: auth.ownerType,
    crop,
  });
  const contentHash = await sha256ArrayBufferHex(arrayBuffer);
  const timestamp = nowMs();
  const assetId = generateSecret('dir_media');
  const assignmentId = generateSecret('dir_media_asn');
  const envName = env.AGAPAY_ENVIRONMENT || 'production';
  const originalKey = objectKey({
    envName,
    parishId: auth.parishId,
    ownerType: auth.ownerType,
    ownerId: auth.ownerId,
    assetId,
    variantType: 'original_private',
    mimeType: validation.mimeType,
  });
  const variants = auth.ownerType === 'person' ? PERSON_VARIANTS : HOUSEHOLD_VARIANTS;
  const decodedSource = decodeAndNormalizeSource({
    sourceBytes: new Uint8Array(arrayBuffer),
    sourceMimeType: validation.mimeType,
  });
  const transformedVariants = [];
  for (const variant of variants) {
    const transformed = await transformVariant({
      decodedSource,
      targetWidth: variant.width,
      targetHeight: variant.height,
      crop: validation.crop,
    });
    transformedVariants.push({
      ...variant,
      id: generateSecret('dir_media_var'),
      key: objectKey({
        envName,
        parishId: auth.parishId,
        ownerType: auth.ownerType,
        ownerId: auth.ownerId,
        assetId,
        variantType: variant.type,
        mimeType: transformed.mimeType,
      }),
      transformed,
    });
  }
  await putObject(env, originalKey, arrayBuffer, validation.mimeType, auth.parishId);
  for (const variant of transformedVariants)
    await putObject(env, variant.key, variant.transformed.bytes, variant.transformed.mimeType, auth.parishId);
  const statements = [
    {
      sql: "UPDATE directory_media_upload_sessions SET status = 'completed', completed_at = ?1, updated_at = ?1 WHERE id = ?2 AND status = 'pending'",
      params: [timestamp, session.id],
    },
    {
      sql: `UPDATE directory_media_assignments
            SET assignment_status = 'replaced', replaced_at = ?1, updated_at = ?1
            WHERE parish_id = ?2 AND owner_type = ?3 AND owner_id = ?4 AND media_purpose = ?5 AND assignment_status = 'candidate'`,
      params: [timestamp, auth.parishId, auth.ownerType, auth.ownerId, auth.mediaPurpose],
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
        assetId,
        auth.parishId,
        auth.ownerType,
        auth.ownerId,
        auth.mediaPurpose,
        auth.visibility,
        auth.publicationEligible ? 1 : 0,
        validation.filename,
        validation.mimeType,
        arrayBuffer.byteLength,
        validation.width,
        validation.height,
        validation.pixels,
        contentHash,
        originalKey,
        context.user.id,
        assignmentId,
        PIPELINE_VERSION,
        correlationId || null,
        timestamp,
        timestamp,
      ],
    },
    {
      sql: `INSERT INTO directory_media_assignments
              (id, parish_id, owner_type, owner_id, media_purpose, media_asset_id,
               assignment_status, assigned_by_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?)`,
      params: [
        assignmentId,
        auth.parishId,
        auth.ownerType,
        auth.ownerId,
        auth.mediaPurpose,
        assetId,
        context.user.id,
        timestamp,
        timestamp,
      ],
    },
    auditStatement({
      action: 'directory.media.secure_transformation_completed',
      actor: actorFromContext(context, auth.parishId),
      parishId: auth.parishId,
      targetType: 'directory_media_asset',
      targetId: assetId,
      metadata: {
        ownerType: auth.ownerType,
        ownerId: auth.ownerId,
        variants: transformedVariants.map((v) => v.type),
        pipelineVersion: PIPELINE_VERSION,
        transformerName: TRANSFORMER_NAME,
        transformerVersion: TRANSFORMER_VERSION,
      },
      correlationId,
    }),
    auditStatement({
      action:
        auth.ownerType === 'person'
          ? 'directory.media.person_photo_replaced'
          : 'directory.media.household_photo_replaced',
      actor: actorFromContext(context, auth.parishId),
      parishId: auth.parishId,
      targetType: `directory_${auth.ownerType}`,
      targetId: auth.ownerId,
      metadata: { mediaAssetId: assetId, visibility: auth.visibility },
      correlationId,
    }),
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
        variant.id,
        assetId,
        variant.type,
        variant.transformed.width,
        variant.transformed.height,
        variant.transformed.mimeType,
        variant.transformed.byteSize,
        variant.key,
        contentHash,
        TRANSFORMER_NAME,
        TRANSFORMER_VERSION,
        PIPELINE_VERSION,
        timestamp,
        variant.transformed.orientationNormalized ? 1 : 0,
        variant.transformed.cropApplied ? 1 : 0,
        1,
        variant.transformed.outputContentHash,
        timestamp,
        timestamp,
      ],
    });
  }
  await runAtomic(env, statements);
  return getDirectoryMediaAsset(env, { context, mediaAssetId: assetId });
}
async function getCurrentDirectoryMediaForOwner(env, { context, ownerType, ownerId }) {
  const auth = await resolveOwnerAuthority(env, context, { ownerType, ownerId, visibility: 'private' });
  const rows = await d1All(
    env,
    `SELECT a.* FROM directory_media_assets a
     JOIN directory_media_assignments asn ON asn.media_asset_id = a.id
     WHERE asn.parish_id = ?1 AND asn.owner_type = ?2 AND asn.owner_id = ?3 AND asn.media_purpose = ?4
       AND asn.assignment_status IN ('active','candidate') AND a.lifecycle_status != 'deleted'
     ORDER BY CASE asn.assignment_status WHEN 'active' THEN 0 ELSE 1 END, a.created_at DESC`,
    auth.parishId,
    auth.ownerType,
    auth.ownerId,
    auth.mediaPurpose
  );
  return rows.map((asset) => mediaAssetDto(asset, []));
}
async function getDirectoryMediaAsset(env, { context, mediaAssetId }) {
  const asset = await d1First(
    env,
    'SELECT * FROM directory_media_assets WHERE id = ?1',
    cleanText(mediaAssetId, { required: true, max: 180, field: 'mediaAssetId' })
  );
  if (!asset) throw new DirectoryServiceError('not_found', 'Directory media was not found.', 404);
  await resolveOwnerAuthority(env, context, {
    ownerType: asset.owner_type,
    ownerId: asset.owner_id,
    visibility: asset.visibility,
  });
  const variants = await d1All(
    env,
    'SELECT * FROM directory_media_variants WHERE media_asset_id = ?1 ORDER BY variant_type',
    asset.id
  );
  return mediaAssetDto(asset, variants);
}
async function updateDirectoryMediaVisibility(
  env,
  { context, mediaAssetId, visibility = 'private', correlationId = '' }
) {
  const asset = await d1First(
    env,
    'SELECT * FROM directory_media_assets WHERE id = ?1',
    cleanText(mediaAssetId, { required: true, max: 180, field: 'mediaAssetId' })
  );
  if (!asset || asset.lifecycle_status === 'deleted')
    throw new DirectoryServiceError('not_found', 'Directory media was not found.', 404);
  const auth = await resolveOwnerAuthority(env, context, {
    ownerType: asset.owner_type,
    ownerId: asset.owner_id,
    visibility,
  });
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: 'UPDATE directory_media_assets SET visibility = ?, publication_eligible = ?, updated_at = ? WHERE id = ?',
      params: [auth.visibility, auth.publicationEligible ? 1 : 0, timestamp, asset.id],
    },
    auditStatement({
      action: 'directory.media.visibility_changed',
      actor: actorFromContext(context, auth.parishId),
      parishId: auth.parishId,
      targetType: 'directory_media_asset',
      targetId: asset.id,
      before: { visibility: asset.visibility, publicationEligible: Number(asset.publication_eligible || 0) === 1 },
      after: { visibility: auth.visibility, publicationEligible: auth.publicationEligible },
      correlationId,
    }),
  ]);
  return getDirectoryMediaAsset(env, { context, mediaAssetId: asset.id });
}
async function submitDirectoryMediaForReview(env, { context, mediaAssetId, correlationId = '' }) {
  const asset = await d1First(
    env,
    'SELECT * FROM directory_media_assets WHERE id = ?1',
    cleanText(mediaAssetId, { required: true, max: 180, field: 'mediaAssetId' })
  );
  if (!asset) throw new DirectoryServiceError('not_found', 'Directory media was not found.', 404);
  const auth = await resolveOwnerAuthority(env, context, {
    ownerType: asset.owner_type,
    ownerId: asset.owner_id,
    visibility: asset.visibility,
  });
  if (asset.lifecycle_status !== 'ready')
    throw new DirectoryServiceError('invalid_transition', 'Only ready media can be submitted.', 409);
  const publication = await getPublicationProfile(env, {
    parishId: auth.parishId,
    ownerType: auth.ownerType,
    ownerId: auth.ownerId,
  });
  const nextStatus = publication.approvalStatus === 'approved' ? 'approved' : 'pending_approval';
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: "UPDATE directory_media_assets SET lifecycle_status = ?, updated_at = ? WHERE id = ? AND lifecycle_status = 'ready'",
      params: [nextStatus, timestamp, asset.id],
    },
    auditStatement({
      action: 'directory.media.photo_submitted',
      actor: actorFromContext(context, auth.parishId),
      parishId: auth.parishId,
      targetType: 'directory_media_asset',
      targetId: asset.id,
      metadata: { ownerType: auth.ownerType, publicationStatus: publication.status, nextStatus },
      correlationId,
    }),
  ]);
  return getDirectoryMediaAsset(env, { context, mediaAssetId: asset.id });
}
async function removeDirectoryMedia(env, { context, mediaAssetId, correlationId = '' }) {
  const asset = await d1First(
    env,
    'SELECT * FROM directory_media_assets WHERE id = ?1',
    cleanText(mediaAssetId, { required: true, max: 180, field: 'mediaAssetId' })
  );
  if (!asset) throw new DirectoryServiceError('not_found', 'Directory media was not found.', 404);
  const auth = await resolveOwnerAuthority(env, context, {
    ownerType: asset.owner_type,
    ownerId: asset.owner_id,
    visibility: asset.visibility,
  });
  const timestamp = nowMs();
  await runAtomic(env, [
    {
      sql: "UPDATE directory_media_assets SET lifecycle_status = 'deleted', deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
      params: [timestamp, asset.id],
    },
    {
      sql: "UPDATE directory_media_assignments SET assignment_status = 'deleted', deleted_at = ?1, updated_at = ?1 WHERE media_asset_id = ?2",
      params: [timestamp, asset.id],
    },
    auditStatement({
      action:
        auth.ownerType === 'person'
          ? 'directory.media.person_photo_removed'
          : 'directory.media.household_photo_removed',
      actor: actorFromContext(context, auth.parishId),
      parishId: auth.parishId,
      targetType: 'directory_media_asset',
      targetId: asset.id,
      metadata: { ownerType: auth.ownerType },
      correlationId,
    }),
  ]);
  return { id: asset.id, deleted: true };
}
async function streamDirectoryMediaVariant(env, { context, mediaAssetId, variantType }) {
  const asset = await d1First(
    env,
    'SELECT * FROM directory_media_assets WHERE id = ?1',
    cleanText(mediaAssetId, { required: true, max: 180, field: 'mediaAssetId' })
  );
  if (
    !asset ||
    asset.lifecycle_status === 'deleted' ||
    asset.lifecycle_status === 'replaced' ||
    asset.lifecycle_status === 'failed'
  )
    throw new DirectoryServiceError('not_found', 'Directory media was not found.', 404);
  await resolveOwnerAuthority(env, context, {
    ownerType: asset.owner_type,
    ownerId: asset.owner_id,
    visibility: asset.visibility,
  });
  const variant = await d1First(
    env,
    "SELECT * FROM directory_media_variants WHERE media_asset_id = ?1 AND variant_type = ?2 AND ready = 1 AND secure_transform_status = 'securely_transformed'",
    asset.id,
    cleanText(variantType, { required: true, max: 60, field: 'variantType' })
  );
  if (!variant || !isAcceptedPipelineVersion(variant.pipeline_version)) {
    throw new DirectoryServiceError('not_found', 'Directory media variant was not found.', 404);
  }
  const bucket = mediaBucket(env);
  if (!bucket)
    throw new DirectoryServiceError('storage_unavailable', 'Directory media storage is not configured.', 503);
  const object = await bucket.get(variant.r2_object_key);
  if (!object) throw new DirectoryServiceError('not_found', 'Directory media object was not found.', 404);
  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': variant.mime_type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': asset.visibility === 'private' ? 'private, no-store' : 'private, max-age=300',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
import { DIRECTORY_MEDIA_BUCKET, DIRECTORY_MEDIA_LIMITS as DIRECTORY_MEDIA_LIMITS2 } from './media-shared.js';
export {
  DIRECTORY_MEDIA_BUCKET,
  DIRECTORY_MEDIA_LIMITS2 as DIRECTORY_MEDIA_LIMITS,
  assertMediaAssetSecurelyTransformed,
  auditDirectoryMediaLegacyAssets,
  cleanupDirectoryMediaObjects,
  completeDirectoryMediaUpload,
  createDirectoryMediaUploadSession,
  getCurrentDirectoryMediaForOwner,
  getDirectoryMediaAsset,
  removeDirectoryMedia,
  reprocessDirectoryMediaAsset,
  streamDirectoryMediaVariant,
  submitDirectoryMediaForReview,
  updateDirectoryMediaVisibility,
  validateCrop,
  validateDirectoryImageUpload,
};
