// Parish Directory Phase 2B.1 -- Secure Image Transformation pipeline.
//
// The ONLY module in this codebase permitted to produce bytes that may be
// recorded as a "securely transformed" media variant. Every stage fails
// closed (throws DirectoryServiceError) rather than returning a partial or
// best-effort result -- src/directory/media.js must never mark a variant
// ready unless this module returns successfully.
//
// Transformer: @cf-wasm/photon (WASM, Rust `photon` image library).
// Verified Worker-compatible: its package.json declares conditional
// exports for "workerd" (used automatically when Wrangler bundles this
// Worker) and "node" (used by this repository's `node scripts/*.mjs` test
// runner) -- the same source module resolves to a runtime-appropriate,
// synchronously-initialized WASM build in both environments, with no
// native binary/addon dependency (unlike `sharp`, which requires a
// platform-specific native binding `workerd` cannot load -- see
// docs/directory/24-phase-2b1-media-security-policy.md for the full
// evaluation of Options A/B/C).
//
// Decoding through PhotonImage.new_from_byteslice() and re-encoding via
// get_bytes_jpeg()/get_bytes_webp() is, by construction, a clean pixel
// round-trip: Photon's in-memory representation is a raw RGBA buffer with
// no EXIF/ICC/XMP/IPTC segments attached, so nothing from the source
// file's metadata can survive into the encoded output. This is the
// "safest implementation is clean decoding and re-encoding from pixel
// data" approach Part 8 calls for -- metadata is not filtered after the
// fact, it structurally cannot be carried through this pipeline.
//
// The one thing Photon does NOT do automatically is honor a JPEG's EXIF
// Orientation tag (it decodes the raw pixel grid as stored) -- this module
// reads that tag itself, BEFORE decoding through Photon, and applies the
// equivalent rotate/flip so the final output is visually correct without
// ever depending on EXIF again (Part 7).

import { PhotonImage, crop as photonCrop, resize, rotate, fliph, flipv, SamplingFilter } from "@cf-wasm/photon";
import { DirectoryServiceError } from "./foundation.js";

export const PIPELINE_VERSION = "directory-media-v1";
export const TRANSFORMER_NAME = "@cf-wasm/photon";
export const TRANSFORMER_VERSION = "0.3.7";

// Pipeline versions this deployment currently accepts as "securely
// transformed" for approval/delivery purposes (Part 18: "create a
// centralized accepted-pipeline policy... do not hardcode accepted
// versions in many locations"). A future security-relevant pipeline change
// bumps PIPELINE_VERSION and adds it here; old, no-longer-accepted
// versions simply age out of this set, which is the single place every
// approval/delivery check consults.
export const ACCEPTED_PIPELINE_VERSIONS = Object.freeze([PIPELINE_VERSION]);

export function isAcceptedPipelineVersion(version) {
  return ACCEPTED_PIPELINE_VERSIONS.includes(version);
}

// Resource limits enforced before and during decoding (Part 10). These are
// intentionally at least as strict as src/directory/media.js's existing
// upload-time DIRECTORY_MEDIA_LIMITS -- re-enforced here, independently,
// so this module never trusts a caller's prior validation and can be
// exercised safely on its own.
const TRANSFORM_LIMITS = Object.freeze({
  maxSourceBytes: 10 * 1024 * 1024,
  maxDecodedPixels: 36_000_000,
  maxOutputDimension: 4096,
  jpegQuality: 88
});

function fail(code, message) {
  throw new DirectoryServiceError(code, message, 422);
}

// ---- Minimal EXIF orientation reader (JPEG only) --------------------------
// Reads only the single big-endian/little-endian uint16 Orientation tag
// (0x0112) out of a JPEG's APP1/EXIF segment. Does not parse, retain, or
// expose any other EXIF field (GPS, device, timestamps, etc.) -- those are
// simply never read, which is a stronger guarantee than "read and discard."
function readJpegOrientation(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    if (offset + 4 > bytes.length) break;
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 0xe1 && segmentLength >= 8) {
      const segmentStart = offset + 4;
      // "Exif\0\0" header
      if (
        bytes[segmentStart] === 0x45 && bytes[segmentStart + 1] === 0x78 &&
        bytes[segmentStart + 2] === 0x69 && bytes[segmentStart + 3] === 0x66
      ) {
        const tiffStart = segmentStart + 6;
        if (tiffStart + 8 > bytes.length) return 1;
        const little = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
        const readU16 = (pos) => little ? (bytes[pos] | (bytes[pos + 1] << 8)) : ((bytes[pos] << 8) | bytes[pos + 1]);
        const readU32 = (pos) => little
          ? (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0
          : ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
        const ifd0Offset = tiffStart + readU32(tiffStart + 4);
        if (ifd0Offset + 2 > bytes.length) return 1;
        const entryCount = readU16(ifd0Offset);
        for (let i = 0; i < entryCount; i++) {
          const entryOffset = ifd0Offset + 2 + i * 12;
          if (entryOffset + 12 > bytes.length) break;
          const tag = readU16(entryOffset);
          if (tag === 0x0112) {
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

// Applies the rotate/flip sequence equivalent to a given EXIF orientation
// value, then returns { image, normalized } -- normalized is false only for
// orientation 1 (nothing to do), so callers can record whether a real
// normalization occurred.
function normalizeOrientation(image, orientationValue) {
  if (!orientationValue || orientationValue === 1) return { image, normalized: false };
  let working = image;
  switch (orientationValue) {
    case 2: fliph(working); break;
    case 3: working = rotate(working, 180); break;
    case 4: flipv(working); break;
    case 5: working = rotate(working, 90); fliph(working); break;
    case 6: working = rotate(working, 90); break;
    case 7: working = rotate(working, 270); fliph(working); break;
    case 8: working = rotate(working, 270); break;
    default: return { image, normalized: false };
  }
  return { image: working, normalized: true };
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Decodes once and returns a reusable decoded PhotonImage plus its
// (orientation-normalized) dimensions -- callers producing multiple
// variants from one source call this once and pass the result to
// transformVariant() repeatedly, rather than re-decoding per variant.
export function decodeAndNormalizeSource({ sourceBytes, sourceMimeType }) {
  if (!(sourceBytes instanceof Uint8Array)) fail("MEDIA_DECODE_FAILED", "Source bytes were not provided as a byte array.");
  if (sourceBytes.byteLength === 0) fail("MEDIA_DECODE_FAILED", "Source image is empty.");
  if (sourceBytes.byteLength > TRANSFORM_LIMITS.maxSourceBytes) fail("MEDIA_FILE_TOO_LARGE", "Source image exceeds the processing size limit.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(sourceMimeType)) {
    fail("MEDIA_UNSUPPORTED_FORMAT", "Only JPEG, PNG, and WebP sources can be securely transformed.");
  }

  let decoded;
  try {
    decoded = PhotonImage.new_from_byteslice(sourceBytes);
  } catch {
    fail("MEDIA_DECODE_FAILED", "The source image could not be decoded.");
  }

  const rawWidth = decoded.get_width();
  const rawHeight = decoded.get_height();
  if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
    fail("MEDIA_DECODE_FAILED", "The decoded image has invalid dimensions.");
  }
  if (rawWidth > TRANSFORM_LIMITS.maxOutputDimension * 4 || rawHeight > TRANSFORM_LIMITS.maxOutputDimension * 4) {
    // A generous multiple of the largest legitimate output dimension --
    // guards against a decoder that reports implausibly large dimensions
    // from a crafted header even though upload-time validation (Part 10's
    // "reject excessive decoded dimensions even if compressed size is
    // small") already checked the declared header dimensions once.
    fail("MEDIA_DIMENSIONS_TOO_LARGE", "Decoded image dimensions exceed the processing limit.");
  }
  const decodedPixels = rawWidth * rawHeight;
  if (decodedPixels > TRANSFORM_LIMITS.maxDecodedPixels) {
    fail("MEDIA_PIXEL_LIMIT_EXCEEDED", "Decoded pixel count exceeds the processing limit.");
  }

  const orientationValue = sourceMimeType === "image/jpeg" ? readJpegOrientation(sourceBytes) : 1;
  const { image, normalized } = normalizeOrientation(decoded, orientationValue);
  const width = image.get_width();
  const height = image.get_height();

  return { image, width, height, orientationNormalized: normalized };
}

// Produces one output variant from an already-decoded, orientation-
// normalized source image. Re-validates crop bounds against the ACTUAL
// decoded (post-orientation-normalization) dimensions -- never trusts a
// client-declared source size (Part 6: "the server must reproduce the
// transformation independently").
export async function transformVariant({ decodedSource, targetWidth, targetHeight, crop = null, outputFormat = "webp" }) {
  const { image: sourceImage, width: sourceWidth, height: sourceHeight } = decodedSource;
  if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight) || targetWidth <= 0 || targetHeight <= 0) {
    fail("MEDIA_TRANSFORMATION_FAILED", "Invalid target variant dimensions.");
  }
  if (targetWidth > TRANSFORM_LIMITS.maxOutputDimension || targetHeight > TRANSFORM_LIMITS.maxOutputDimension) {
    fail("MEDIA_DIMENSIONS_TOO_LARGE", "Requested output dimensions exceed the processing limit.");
  }

  let working = sourceImage;
  let cropApplied = false;

  if (crop) {
    const { x, y, width, height } = crop;
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      fail("MEDIA_TRANSFORMATION_FAILED", "Crop values must be positive finite numbers.");
    }
    const x2 = x + width;
    const y2 = y + height;
    if (x2 > sourceWidth || y2 > sourceHeight) {
      fail("MEDIA_TRANSFORMATION_FAILED", "Crop bounds fall outside the decoded image.");
    }
    try {
      working = photonCrop(working, Math.round(x), Math.round(y), Math.round(x2), Math.round(y2));
    } catch {
      fail("MEDIA_TRANSFORMATION_FAILED", "Cropping the decoded image failed.");
    }
    cropApplied = true;
  }

  let resized;
  try {
    resized = resize(working, Math.round(targetWidth), Math.round(targetHeight), SamplingFilter.Lanczos3);
  } catch {
    fail("MEDIA_TRANSFORMATION_FAILED", "Resizing the decoded image failed.");
  }

  const outputWidth = resized.get_width();
  const outputHeight = resized.get_height();
  if (outputWidth !== Math.round(targetWidth) || outputHeight !== Math.round(targetHeight)) {
    fail("MEDIA_TRANSFORMATION_FAILED", "Transformed output dimensions did not match the declared variant.");
  }

  let outputBytes;
  let outputMimeType;
  try {
    if (outputFormat === "jpeg") {
      outputBytes = resized.get_bytes_jpeg(TRANSFORM_LIMITS.jpegQuality);
      outputMimeType = "image/jpeg";
    } else {
      outputBytes = resized.get_bytes_webp();
      outputMimeType = "image/webp";
    }
  } catch {
    fail("MEDIA_TRANSFORMATION_FAILED", "Encoding the transformed image failed.");
  }
  if (!outputBytes || outputBytes.byteLength === 0) fail("MEDIA_TRANSFORMATION_FAILED", "Encoding produced no output bytes.");

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
    metadataStripped: true, // structural guarantee of this pipeline -- see module header
    transformerName: TRANSFORMER_NAME,
    transformerVersion: TRANSFORMER_VERSION,
    pipelineVersion: PIPELINE_VERSION
  };
}
