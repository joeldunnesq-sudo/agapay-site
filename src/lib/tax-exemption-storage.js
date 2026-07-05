// src/lib/tax-exemption-storage.js
//
// Private document storage for sales-tax exemption certificates. Uses a
// dedicated, non-public R2 binding (TAX_EXEMPTION_DOCS) -- NEVER the
// existing public CAMPAIGN_ASSETS bucket. Every access goes through a
// Worker route that re-checks authorization on every request and streams
// the object directly (no presigned URLs -- see Phase 2 plan section 4 for
// why: this repo's R2 usage is all via the native binding, not the
// S3-compatible API, so presigned URLs would need a new credential surface
// this feature doesn't need).
//
// Binary content NEVER touches D1. Only metadata (src/lib/tax-exemption.js
// tax_exemption_documents table) is stored there.

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// Magic-byte signatures for the three allowed types. Checked against the
// first few bytes of the uploaded file so a renamed executable/script can't
// pass validation just by having a matching extension/Content-Type.
const SIGNATURES = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }
];

function extensionFromFilename(filename) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(String(filename || ""));
  return match ? match[1].toLowerCase() : "";
}

function sniffSignature(bytes) {
  for (const sig of SIGNATURES) {
    if (bytes.length < sig.bytes.length) continue;
    if (sig.bytes.every((byte, index) => bytes[index] === byte)) return sig.mime;
  }
  return "";
}

/**
 * Strips path separators, control characters, and anything else that could
 * enable path traversal or header injection, collapsing to a safe display
 * name. This is metadata only -- it is never used to build the storage key
 * or any filesystem/R2 path.
 */
export function sanitizeFilename(filename) {
  const base = String(filename || "document")
    .replace(/[\\/]/g, "_")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/["'\r\n]/g, "")
    .trim()
    .slice(0, 180);
  return base || "document";
}

/**
 * Fully randomized object key -- no parish name, reference, certificate
 * number, email, filename, state, or sequential id anywhere in it. 32
 * random bytes, hex-encoded, under a fixed prefix.
 */
export function generateStorageKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `texdoc/${hex}`;
}

export async function sha256Hex(arrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validates an uploaded file's extension, declared MIME type, magic bytes,
 * and size. Returns { ok: true, mimeType } or { ok: false, error }. Never
 * trusts the client-declared Content-Type or extension alone -- the magic
 * bytes are authoritative for what actually gets stored as mime_type.
 */
export async function validateExemptionUpload({ filename, declaredMimeType, arrayBuffer }) {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return { ok: false, error: "The uploaded file is empty." };
  }
  if (arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: "The uploaded file exceeds the 10 MB limit." };
  }

  const extension = extensionFromFilename(filename);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, error: "Only PDF, JPG, JPEG, and PNG files are accepted." };
  }
  if (!ALLOWED_MIME_TYPES.has(String(declaredMimeType || "").toLowerCase())) {
    return { ok: false, error: "Only PDF, JPG, JPEG, and PNG files are accepted." };
  }

  const head = new Uint8Array(arrayBuffer.slice(0, 16));
  const sniffed = sniffSignature(head);
  if (!sniffed) {
    return { ok: false, error: "The file's contents don't match an accepted file type." };
  }
  // JPEG signature is a 3-byte prefix shared by all JPEG variants; PNG/PDF
  // are exact. Cross-check sniffed type is compatible with the declared one
  // (allow jpg/jpeg extension for image/jpeg regardless of exact variant).
  const extensionImpliesMime = extension === "pdf" ? "application/pdf"
    : extension === "png" ? "image/png"
    : "image/jpeg";
  if (sniffed !== extensionImpliesMime) {
    return { ok: false, error: "The file's contents don't match its extension." };
  }

  return { ok: true, mimeType: sniffed };
}

/**
 * Uploads validated content to the private R2 bucket under a fresh random
 * key. Caller is responsible for writing the corresponding
 * tax_exemption_documents D1 row (src/lib/tax-exemption.js
 * attachTaxExemptionDocument) -- this function only touches R2.
 */
export async function putExemptionDocument(env, { arrayBuffer, mimeType }) {
  if (!env.TAX_EXEMPTION_DOCS) {
    throw new Error("TAX_EXEMPTION_DOCS R2 binding is not configured");
  }
  const storageKey = generateStorageKey();
  await env.TAX_EXEMPTION_DOCS.put(storageKey, arrayBuffer, {
    httpMetadata: { contentType: mimeType }
  });
  return storageKey;
}

/**
 * Streams a stored document back as a Response with safe headers. `mode`
 * is "inline" (default, for viewing) or "attachment" (explicit download).
 * Caller must already have authorized the request and resolved the correct
 * document row before calling this.
 */
export async function streamExemptionDocument(env, { storageKey, mimeType, sanitizedFilename, mode = "inline" }) {
  if (!env.TAX_EXEMPTION_DOCS) {
    return new Response("Storage not configured", { status: 500 });
  }
  const object = await env.TAX_EXEMPTION_DOCS.get(storageKey);
  if (!object) {
    return new Response("Document not found", { status: 404 });
  }
  const disposition = mode === "attachment" ? "attachment" : "inline";
  const safeName = sanitizeFilename(sanitizedFilename).replace(/[^\x20-\x7e]/g, "_");
  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": mimeType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'"
    }
  });
}

export async function deleteExemptionDocument(env, storageKey) {
  if (!env.TAX_EXEMPTION_DOCS) return;
  await env.TAX_EXEMPTION_DOCS.delete(storageKey);
}

export const TAX_EXEMPTION_UPLOAD_LIMITS = {
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
  allowedExtensions: Array.from(ALLOWED_EXTENSIONS)
};
