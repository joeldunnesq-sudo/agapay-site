// Generated from src/lib/tax-exemption-storage.ts by npm run build:server. Do not edit.
const ALLOWED_MIME_TYPES = /* @__PURE__ */ new Set(['application/pdf', 'image/jpeg', 'image/png']);
const ALLOWED_EXTENSIONS = /* @__PURE__ */ new Set(['pdf', 'jpg', 'jpeg', 'png']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const SIGNATURES = [
  { mime: 'application/pdf', bytes: [37, 80, 68, 70] },
  // %PDF
  { mime: 'image/jpeg', bytes: [255, 216, 255] },
  { mime: 'image/png', bytes: [137, 80, 78, 71, 13, 10, 26, 10] },
];
function extensionFromFilename(filename) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(String(filename || ''));
  return match ? match[1].toLowerCase() : '';
}
function sniffSignature(bytes) {
  for (const sig of SIGNATURES) {
    if (bytes.length < sig.bytes.length) continue;
    if (sig.bytes.every((byte, index) => bytes[index] === byte)) return sig.mime;
  }
  return '';
}
function sanitizeFilename(filename) {
  const base = String(filename || 'document')
    .replace(/[\\/]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/["'\r\n]/g, '')
    .trim()
    .slice(0, 180);
  return base || 'document';
}
function generateStorageKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `texdoc/${hex}`;
}
async function sha256Hex(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function validateExemptionUpload({ filename, declaredMimeType, arrayBuffer }) {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return { ok: false, error: 'The uploaded file is empty.' };
  }
  if (arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: 'The uploaded file exceeds the 10 MB limit.' };
  }
  const extension = extensionFromFilename(filename);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, error: 'Only PDF, JPG, JPEG, and PNG files are accepted.' };
  }
  if (!ALLOWED_MIME_TYPES.has(String(declaredMimeType || '').toLowerCase())) {
    return { ok: false, error: 'Only PDF, JPG, JPEG, and PNG files are accepted.' };
  }
  const head = new Uint8Array(arrayBuffer.slice(0, 16));
  const sniffed = sniffSignature(head);
  if (!sniffed) {
    return { ok: false, error: "The file's contents don't match an accepted file type." };
  }
  const extensionImpliesMime =
    extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg';
  if (sniffed !== extensionImpliesMime) {
    return { ok: false, error: "The file's contents don't match its extension." };
  }
  return { ok: true, mimeType: sniffed };
}
async function putExemptionDocument(env, { parishId, arrayBuffer, mimeType }) {
  if (!env.TAX_EXEMPTION_DOCS) {
    throw new Error('TAX_EXEMPTION_DOCS R2 binding is not configured');
  }
  const storageKey = generateStorageKey();
  await env.TAX_EXEMPTION_DOCS.put(storageKey, arrayBuffer, {
    customMetadata: { agapayParishId: parishId },
    httpMetadata: { contentType: mimeType },
  });
  return storageKey;
}
async function streamExemptionDocument(env, { storageKey, mimeType, sanitizedFilename, mode = 'inline' }) {
  if (!env.TAX_EXEMPTION_DOCS) {
    return new Response('Storage not configured', { status: 500 });
  }
  const object = await env.TAX_EXEMPTION_DOCS.get(storageKey);
  if (!object) {
    return new Response('Document not found', { status: 404 });
  }
  const disposition = mode === 'attachment' ? 'attachment' : 'inline';
  const safeName = sanitizeFilename(sanitizedFilename).replace(/[^\x20-\x7e]/g, '_');
  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
async function deleteExemptionDocument(env, storageKey) {
  if (!env.TAX_EXEMPTION_DOCS) return;
  await env.TAX_EXEMPTION_DOCS.delete(storageKey);
}
const TAX_EXEMPTION_UPLOAD_LIMITS = {
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
  allowedExtensions: Array.from(ALLOWED_EXTENSIONS),
};
export {
  TAX_EXEMPTION_UPLOAD_LIMITS,
  deleteExemptionDocument,
  generateStorageKey,
  putExemptionDocument,
  sanitizeFilename,
  sha256Hex,
  streamExemptionDocument,
  validateExemptionUpload,
};
