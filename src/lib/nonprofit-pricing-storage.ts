export type NonprofitPricingStorageEnv = Partial<Pick<Env, 'NONPROFIT_PRICING_DOCS'>>;
import type {
  ExemptionUploadInput,
  ExemptionUploadResult,
  ExemptionDocumentPutInput,
  ExemptionDocumentStreamInput,
} from './tax-exemption-storage.js';
import { sanitizeFilename, sha256Hex, validateExemptionUpload } from './tax-exemption-storage.js';

export { sanitizeFilename, sha256Hex };

export async function validateNonprofitPricingUpload(input: ExemptionUploadInput): Promise<ExemptionUploadResult> {
  return validateExemptionUpload(input);
}

export function generateNonprofitPricingStorageKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `nonprofit-pricing/${hex}`;
}

export async function putNonprofitPricingDocument(
  env: NonprofitPricingStorageEnv,
  { parishId, arrayBuffer, mimeType }: ExemptionDocumentPutInput
): Promise<string> {
  if (!env.NONPROFIT_PRICING_DOCS) {
    throw new Error('NONPROFIT_PRICING_DOCS R2 binding is not configured');
  }
  const storageKey = generateNonprofitPricingStorageKey();
  await env.NONPROFIT_PRICING_DOCS.put(storageKey, arrayBuffer, {
    customMetadata: { agapayParishId: parishId },
    httpMetadata: { contentType: mimeType },
  });
  return storageKey;
}

export async function streamNonprofitPricingDocument(
  env: NonprofitPricingStorageEnv,
  { storageKey, mimeType, sanitizedFilename, mode = 'inline' }: ExemptionDocumentStreamInput
): Promise<Response> {
  if (!env.NONPROFIT_PRICING_DOCS) {
    return new Response('Storage not configured', { status: 500 });
  }
  const object = await env.NONPROFIT_PRICING_DOCS.get(storageKey);
  if (!object) return new Response('Document not found', { status: 404 });
  const disposition = mode === 'attachment' ? 'attachment' : 'inline';
  const safeName = sanitizeFilename(sanitizedFilename).replace(/[^\x20-\x7e]/g, '_');
  return new Response(object.body, {
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
