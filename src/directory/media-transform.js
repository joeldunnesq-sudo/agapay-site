// Generated from src/directory/media-transform.ts by npm run build:server. Do not edit.
import { PhotonImage, crop as photonCrop, resize, rotate, fliph, flipv, SamplingFilter } from '@cf-wasm/photon';
import { DirectoryServiceError } from './foundation.js';
const PIPELINE_VERSION = 'directory-media-v2';
const TRANSFORMER_NAME = '@cf-wasm/photon';
const TRANSFORMER_VERSION = '0.4.0';
const ACCEPTED_PIPELINE_VERSIONS = Object.freeze(['directory-media-v1', PIPELINE_VERSION]);
function isAcceptedPipelineVersion(version) {
  return ACCEPTED_PIPELINE_VERSIONS.includes(version);
}
const TRANSFORM_LIMITS = Object.freeze({
  maxSourceBytes: 10 * 1024 * 1024,
  maxDecodedPixels: 36e6,
  maxOutputDimension: 4096,
  jpegQuality: 88,
});
function fail(code, message) {
  throw new DirectoryServiceError(code, message, 422);
}
function readJpegOrientation(bytes) {
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) return 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 255) break;
    const marker = bytes[offset + 1];
    if (marker === 216 || marker === 217) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) break;
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 225 && segmentLength >= 8) {
      const segmentStart = offset + 4;
      if (
        bytes[segmentStart] === 69 &&
        bytes[segmentStart + 1] === 120 &&
        bytes[segmentStart + 2] === 105 &&
        bytes[segmentStart + 3] === 102
      ) {
        const tiffStart = segmentStart + 6;
        if (tiffStart + 8 > bytes.length) return 1;
        const little = bytes[tiffStart] === 73 && bytes[tiffStart + 1] === 73;
        const readU16 = (pos) => (little ? bytes[pos] | (bytes[pos + 1] << 8) : (bytes[pos] << 8) | bytes[pos + 1]);
        const readU32 = (pos) =>
          little
            ? (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0
            : ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
        const ifd0Offset = tiffStart + readU32(tiffStart + 4);
        if (ifd0Offset + 2 > bytes.length) return 1;
        const entryCount = readU16(ifd0Offset);
        for (let i = 0; i < entryCount; i++) {
          const entryOffset = ifd0Offset + 2 + i * 12;
          if (entryOffset + 12 > bytes.length) break;
          const tag = readU16(entryOffset);
          if (tag === 274) {
            const value = readU16(entryOffset + 8);
            return value >= 1 && value <= 8 ? value : 1;
          }
        }
      }
    }
    offset += 2 + segmentLength;
  }
  return 1;
}
function normalizeOrientation(image, orientationValue) {
  if (!orientationValue || orientationValue === 1) return { image, normalized: false };
  let working = image;
  switch (orientationValue) {
    case 2:
      fliph(working);
      break;
    case 3:
      working = rotate(working, 180);
      break;
    case 4:
      flipv(working);
      break;
    case 5:
      working = rotate(working, 90);
      fliph(working);
      break;
    case 6:
      working = rotate(working, 90);
      break;
    case 7:
      working = rotate(working, 270);
      fliph(working);
      break;
    case 8:
      working = rotate(working, 270);
      break;
    default:
      return { image, normalized: false };
  }
  return { image: working, normalized: true };
}
async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function decodeAndNormalizeSource({ sourceBytes, sourceMimeType }) {
  if (!(sourceBytes instanceof Uint8Array))
    fail('MEDIA_DECODE_FAILED', 'Source bytes were not provided as a byte array.');
  if (sourceBytes.byteLength === 0) fail('MEDIA_DECODE_FAILED', 'Source image is empty.');
  if (sourceBytes.byteLength > TRANSFORM_LIMITS.maxSourceBytes)
    fail('MEDIA_FILE_TOO_LARGE', 'Source image exceeds the processing size limit.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(sourceMimeType)) {
    fail('MEDIA_UNSUPPORTED_FORMAT', 'Only JPEG, PNG, and WebP sources can be securely transformed.');
  }
  let decoded;
  try {
    decoded = PhotonImage.new_from_byteslice(sourceBytes);
  } catch {
    fail('MEDIA_DECODE_FAILED', 'The source image could not be decoded.');
  }
  const rawWidth = decoded.get_width();
  const rawHeight = decoded.get_height();
  if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
    fail('MEDIA_DECODE_FAILED', 'The decoded image has invalid dimensions.');
  }
  if (rawWidth > TRANSFORM_LIMITS.maxOutputDimension * 4 || rawHeight > TRANSFORM_LIMITS.maxOutputDimension * 4) {
    fail('MEDIA_DIMENSIONS_TOO_LARGE', 'Decoded image dimensions exceed the processing limit.');
  }
  const decodedPixels = rawWidth * rawHeight;
  if (decodedPixels > TRANSFORM_LIMITS.maxDecodedPixels) {
    fail('MEDIA_PIXEL_LIMIT_EXCEEDED', 'Decoded pixel count exceeds the processing limit.');
  }
  const orientationValue = sourceMimeType === 'image/jpeg' ? readJpegOrientation(sourceBytes) : 1;
  const { image, normalized } = normalizeOrientation(decoded, orientationValue);
  const width = image.get_width();
  const height = image.get_height();
  return { image, width, height, orientationNormalized: normalized };
}
function centerCropForAspect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const targetRatio = targetWidth / targetHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  if (sourceRatio > targetRatio) {
    const width = Math.round(sourceHeight * targetRatio);
    return { x: Math.round((sourceWidth - width) / 2), y: 0, width, height: sourceHeight };
  }
  const height = Math.round(sourceWidth / targetRatio);
  return { x: 0, y: Math.round((sourceHeight - height) / 2), width: sourceWidth, height };
}
async function transformVariant({ decodedSource, targetWidth, targetHeight, crop = null, outputFormat = 'webp' }) {
  const { image: sourceImage, width: sourceWidth, height: sourceHeight } = decodedSource;
  if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight) || targetWidth <= 0 || targetHeight <= 0) {
    fail('MEDIA_TRANSFORMATION_FAILED', 'Invalid target variant dimensions.');
  }
  if (targetWidth > TRANSFORM_LIMITS.maxOutputDimension || targetHeight > TRANSFORM_LIMITS.maxOutputDimension) {
    fail('MEDIA_DIMENSIONS_TOO_LARGE', 'Requested output dimensions exceed the processing limit.');
  }
  let working = sourceImage;
  let cropApplied = false;
  const effectiveCrop = crop || centerCropForAspect(sourceWidth, sourceHeight, targetWidth, targetHeight);
  if (effectiveCrop) {
    const { x, y, width, height } = effectiveCrop;
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      fail('MEDIA_TRANSFORMATION_FAILED', 'Crop values must be positive finite numbers.');
    }
    const x2 = x + width;
    const y2 = y + height;
    if (x2 > sourceWidth || y2 > sourceHeight) {
      fail('MEDIA_TRANSFORMATION_FAILED', 'Crop bounds fall outside the decoded image.');
    }
    try {
      working = photonCrop(working, Math.round(x), Math.round(y), Math.round(x2), Math.round(y2));
    } catch {
      fail('MEDIA_TRANSFORMATION_FAILED', 'Cropping the decoded image failed.');
    }
    cropApplied = Boolean(crop);
  }
  let resized;
  try {
    resized = resize(working, Math.round(targetWidth), Math.round(targetHeight), SamplingFilter.Lanczos3);
  } catch {
    fail('MEDIA_TRANSFORMATION_FAILED', 'Resizing the decoded image failed.');
  }
  const outputWidth = resized.get_width();
  const outputHeight = resized.get_height();
  if (outputWidth !== Math.round(targetWidth) || outputHeight !== Math.round(targetHeight)) {
    fail('MEDIA_TRANSFORMATION_FAILED', 'Transformed output dimensions did not match the declared variant.');
  }
  let outputBytes;
  let outputMimeType;
  try {
    if (outputFormat === 'jpeg') {
      outputBytes = resized.get_bytes_jpeg(TRANSFORM_LIMITS.jpegQuality);
      outputMimeType = 'image/jpeg';
    } else {
      outputBytes = resized.get_bytes_webp();
      outputMimeType = 'image/webp';
    }
  } catch {
    fail('MEDIA_TRANSFORMATION_FAILED', 'Encoding the transformed image failed.');
  }
  if (!outputBytes || outputBytes.byteLength === 0)
    fail('MEDIA_TRANSFORMATION_FAILED', 'Encoding produced no output bytes.');
  const outputContentHash = await sha256Hex(outputBytes);
  return {
    bytes: outputBytes,
    mimeType: outputMimeType,
    width: outputWidth,
    height: outputHeight,
    byteSize: outputBytes.byteLength,
    outputContentHash,
    cropApplied,
    orientationNormalized: decodedSource.orientationNormalized,
    metadataStripped: true,
    // structural guarantee of this pipeline -- see module header
    transformerName: TRANSFORMER_NAME,
    transformerVersion: TRANSFORMER_VERSION,
    pipelineVersion: PIPELINE_VERSION,
  };
}
export {
  ACCEPTED_PIPELINE_VERSIONS,
  PIPELINE_VERSION,
  TRANSFORMER_NAME,
  TRANSFORMER_VERSION,
  centerCropForAspect,
  decodeAndNormalizeSource,
  isAcceptedPipelineVersion,
  transformVariant,
};
