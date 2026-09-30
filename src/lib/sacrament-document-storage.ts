export type SacramentDocumentStorageEnv = Partial<Pick<Env, 'SACRAMENT_DOCUMENTS'>>;
export type SacramentDocumentMime = 'application/pdf' | 'image/jpeg' | 'image/png';
export interface SacramentDocumentUploadInput {
  readonly filename?: unknown;
  readonly declaredMimeType?: unknown;
  readonly arrayBuffer?: ArrayBuffer | null;
}
export type SacramentDocumentUploadResult =
  { readonly ok: true; readonly mimeType: SacramentDocumentMime } | { readonly ok: false; readonly error: string };
export interface SacramentDocumentPutInput {
  readonly parishId: unknown;
  readonly arrayBuffer: ArrayBuffer;
  readonly mimeType: string;
}
export interface SacramentDocumentStreamInput {
  readonly storageKey: string;
  readonly mimeType?: string | null;
  readonly filename?: unknown;
  readonly download?: boolean;
}

// Private Wedding/Baptism preparation documents. Objects never receive a
// public URL; authenticated Worker routes stream them after an ownership
// check. Only metadata is persisted in D1.

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_MULTIPART_BODY_BYTES = MAX_FILE_SIZE_BYTES + 1024 * 1024;

const SIGNATURES: readonly { readonly mime: SacramentDocumentMime; readonly bytes: readonly number[] }[] = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

function extensionFromFilename(filename: unknown): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(String(filename || ''));
  return match ? match[1].toLowerCase() : '';
}

function sniffSignature(bytes: Uint8Array): SacramentDocumentMime | '' {
  for (const signature of SIGNATURES) {
    if (bytes.length >= signature.bytes.length && signature.bytes.every((byte, index) => bytes[index] === byte))
      return signature.mime;
  }
  return '';
}

export function sanitizeSacramentDocumentFilename(filename: unknown): string {
  return (
    String(filename || 'document')
      .replace(/[\\/]/g, '_')
      .replace(/[\x00-\x1f\x7f]/g, '')
      .replace(/["'\r\n]/g, '')
      .trim()
      .slice(0, 180) || 'document'
  );
}

export function generateSacramentDocumentStorageKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sacdoc/${token}`;
}

export async function sacramentDocumentSha256(arrayBuffer: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function validateSacramentDocumentUpload({
  filename,
  declaredMimeType,
  arrayBuffer,
}: SacramentDocumentUploadInput): SacramentDocumentUploadResult {
  if (!arrayBuffer?.byteLength) return { ok: false, error: 'The uploaded file is empty.' };
  if (arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: 'The uploaded file exceeds the 10 MB limit.' };
  }
  const extension = extensionFromFilename(filename);
  const declared = String(declaredMimeType || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(declared)) {
    return { ok: false, error: 'Only PDF, JPG, JPEG, and PNG files are accepted.' };
  }
  const sniffed = sniffSignature(new Uint8Array(arrayBuffer.slice(0, 16)));
  const extensionMime = extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg';
  if (!sniffed || sniffed !== extensionMime || sniffed !== declared) {
    return { ok: false, error: 'The file contents do not match the selected file type.' };
  }
  return { ok: true, mimeType: sniffed };
}

export async function putSacramentDocument(
  env: SacramentDocumentStorageEnv,
  { parishId, arrayBuffer, mimeType }: SacramentDocumentPutInput
): Promise<string> {
  if (!env.SACRAMENT_DOCUMENTS) throw new Error('Sacrament document storage is not configured.');
  const storageKey = generateSacramentDocumentStorageKey();
  await env.SACRAMENT_DOCUMENTS.put(storageKey, arrayBuffer, {
    customMetadata: { agapayParishId: String(parishId || '') },
    httpMetadata: { contentType: mimeType },
  });
  return storageKey;
}

export async function streamSacramentDocument(
  env: SacramentDocumentStorageEnv,
  { storageKey, mimeType, filename, download = false }: SacramentDocumentStreamInput
): Promise<Response> {
  if (!env.SACRAMENT_DOCUMENTS) return new Response('Storage not configured', { status: 500 });
  const object = await env.SACRAMENT_DOCUMENTS.get(storageKey);
  if (!object || !object.body) return new Response('Document not found', { status: 404 });
  const safeName = sanitizeSacramentDocumentFilename(filename).replace(/[^\x20-\x7e]/g, '_');
  const headers = new Headers({
    'Content-Type': mimeType || 'application/octet-stream',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeName}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'",
  });
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return new Response(object.body, { status: 200, headers });
}

export async function deleteSacramentDocumentObject(
  env: SacramentDocumentStorageEnv,
  storageKey: string | null | undefined
): Promise<void> {
  if (env.SACRAMENT_DOCUMENTS && storageKey) await env.SACRAMENT_DOCUMENTS.delete(storageKey);
}

export const SACRAMENT_DOCUMENT_UPLOAD_LIMITS = {
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  allowedMimeTypes: [...ALLOWED_MIME_TYPES],
  allowedExtensions: [...ALLOWED_EXTENSIONS],
};
