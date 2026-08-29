import { sanitizeFilename, sha256Hex } from "./tax-exemption-storage.js";

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const SIGNATURES = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }
];

function extensionFromFilename(filename) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(String(filename || ""));
  return match ? match[1].toLowerCase() : "";
}

function sniffSignature(bytes) {
  for (const signature of SIGNATURES) {
    if (bytes.length >= signature.bytes.length && signature.bytes.every((byte, index) => bytes[index] === byte)) return signature.mime;
  }
  return "";
}

export function generateStorageKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `acctdoc/${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function validateAccountingAttachmentUpload({ filename, declaredMimeType, arrayBuffer }) {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) return { ok: false, error: "The uploaded file is empty." };
  if (arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES) return { ok: false, error: "The uploaded file exceeds the 10 MB limit." };
  const extension = extensionFromFilename(filename);
  if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(String(declaredMimeType || "").toLowerCase())) return { ok: false, error: "Only PDF, JPG, JPEG, and PNG files are accepted." };
  const sniffed = sniffSignature(new Uint8Array(arrayBuffer.slice(0, 16)));
  if (!sniffed) return { ok: false, error: "The file's contents don't match an accepted file type." };
  const extensionImpliesMime = extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : "image/jpeg";
  if (sniffed !== extensionImpliesMime) return { ok: false, error: "The file's contents don't match its extension." };
  return { ok: true, mimeType: sniffed };
}

export async function putAccountingAttachment(env, { parishId, arrayBuffer, mimeType }) {
  if (!env.ACCOUNTING_ATTACHMENTS) throw new Error("ACCOUNTING_ATTACHMENTS R2 binding is not configured");
  const storageKey = generateStorageKey();
  await env.ACCOUNTING_ATTACHMENTS.put(storageKey, arrayBuffer, { customMetadata: { agapayParishId: parishId }, httpMetadata: { contentType: mimeType } });
  return storageKey;
}

export async function streamAccountingAttachment(env, { storageKey, mimeType, sanitizedFilename, mode = "inline" }) {
  if (!env.ACCOUNTING_ATTACHMENTS) return new Response("Storage not configured", { status: 500 });
  const object = await env.ACCOUNTING_ATTACHMENTS.get(storageKey);
  if (!object) return new Response("Document not found", { status: 404 });
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

export async function deleteAccountingAttachment(env, storageKey) {
  if (!env.ACCOUNTING_ATTACHMENTS) return;
  await env.ACCOUNTING_ATTACHMENTS.delete(storageKey);
}

export { sanitizeFilename, sha256Hex };
export const ACCOUNTING_ATTACHMENT_UPLOAD_LIMITS = Object.freeze({
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  allowedMimeTypes: Object.freeze(Array.from(ALLOWED_MIME_TYPES)),
  allowedExtensions: Object.freeze(Array.from(ALLOWED_EXTENSIONS))
});
