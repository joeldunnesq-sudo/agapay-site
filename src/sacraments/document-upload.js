// Generated from src/sacraments/document-upload.ts by npm run build:server. Do not edit.
import {
  MAX_MULTIPART_BODY_BYTES,
  deleteSacramentDocumentObject,
  putSacramentDocument,
  sacramentDocumentSha256,
  sanitizeSacramentDocumentFilename,
  validateSacramentDocumentUpload,
} from '../lib/sacrament-document-storage.js';
async function readUpload(request, json) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return { error: json({ error: 'A Content-Length header is required for document uploads.' }, { status: 411 }) };
  }
  if (contentLength > MAX_MULTIPART_BODY_BYTES) {
    return { error: json({ error: 'The upload exceeds the 10 MB document limit.' }, { status: 413 }) };
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return { error: json({ error: 'Expected multipart/form-data with a document file.' }, { status: 400 }) };
  }
  const file = form.get('document');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return { error: json({ error: 'Choose a document to upload.' }, { status: 422 }) };
  }
  const arrayBuffer = await file.arrayBuffer();
  const validation = validateSacramentDocumentUpload({
    filename: file.name,
    declaredMimeType: file.type,
    arrayBuffer,
  });
  if (!validation.ok) return { error: json({ error: validation.error }, { status: 422 }) };
  return {
    file,
    form,
    arrayBuffer,
    mimeType: validation.mimeType,
    sanitizedFilename: sanitizeSacramentDocumentFilename(file.name),
    sha256: await sacramentDocumentSha256(arrayBuffer),
  };
}
async function persistDocument(env, input, addPreparationDocument) {
  const storageKey = await putSacramentDocument(env, {
    parishId: input.parishId,
    arrayBuffer: input.arrayBuffer,
    mimeType: input.mimeType,
  });
  try {
    const documentId = await addPreparationDocument(env, { ...input, storageKey });
    return { documentId, storageKey };
  } catch (error) {
    await deleteSacramentDocumentObject(env, storageKey).catch(() => {});
    throw error;
  }
}
export { persistDocument, readUpload };
