import {
  MAX_MULTIPART_BODY_BYTES,
  deleteSacramentDocumentObject,
  putSacramentDocument,
  sacramentDocumentSha256,
  sanitizeSacramentDocumentFilename,
  validateSacramentDocumentUpload,
  type SacramentDocumentStorageEnv,
  type SacramentDocumentMime,
} from '../lib/sacrament-document-storage.js';

export type UploadErrorResponse = (body: { error: string }, init: { status: number }) => Response;
export interface PreparationUpload {
  readonly error?: undefined;
  readonly file: File;
  readonly form: FormData;
  readonly arrayBuffer: ArrayBuffer;
  readonly mimeType: SacramentDocumentMime;
  readonly sanitizedFilename: string;
  readonly sha256: string;
}
export type PreparationUploadResult = PreparationUpload | { readonly error: Response };
export interface PreparationDocumentInput {
  readonly parishId: string;
  readonly templateId?: string | null;
  readonly requestId?: string | null;
  readonly requestItemId?: string | null;
  readonly documentRole: 'guide' | 'supporting';
  readonly uploadedByType: 'parish' | 'donor';
  readonly uploadedByEmail: string;
  readonly displayName: string;
  readonly originalFilename: string;
  readonly sanitizedFilename: string;
  readonly mimeType: SacramentDocumentMime;
  readonly fileSize: number;
  readonly sha256: string;
  readonly arrayBuffer: ArrayBuffer;
}
export type PreparationDocumentWriter<Environment, Input extends PreparationDocumentInput> = (
  env: Environment,
  input: Input & { readonly storageKey: string }
) => Promise<string>;

export async function readUpload(request: Request, json: UploadErrorResponse): Promise<PreparationUploadResult> {
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
  // FormData entries are File or string; the existing method check rejects text entries.
  const file = form.get('document') as File | null;
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

export async function persistDocument<
  Environment extends SacramentDocumentStorageEnv,
  Input extends PreparationDocumentInput,
>(
  env: Environment,
  input: Input,
  addPreparationDocument: PreparationDocumentWriter<Environment, Input>
): Promise<{ documentId: string; storageKey: string }> {
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
