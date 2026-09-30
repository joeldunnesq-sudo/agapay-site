import {
  putGivingStatementPdf,
  streamGivingStatementPdf,
  deleteGivingStatementPdf,
  type GivingStatementStorageEnv,
} from '../../src/lib/giving-statement-storage.js';
import {
  validateSacramentDocumentUpload,
  putSacramentDocument,
  streamSacramentDocument,
  type SacramentDocumentStorageEnv,
} from '../../src/lib/sacrament-document-storage.js';

declare const env: Env;
const givingEnv: GivingStatementStorageEnv = env;
const sacramentEnv: SacramentDocumentStorageEnv = env;
void putGivingStatementPdf(givingEnv, { parishId: 'parish', storageKey: 'gstmt/key', bytes: new Uint8Array(4) });
void streamGivingStatementPdf({}, { storageKey: 'gstmt/key' });
void deleteGivingStatementPdf(givingEnv, null);
void putSacramentDocument(sacramentEnv, {
  parishId: 'parish',
  arrayBuffer: new ArrayBuffer(4),
  mimeType: 'application/pdf',
});
void streamSacramentDocument({}, { storageKey: 'sacdoc/key', download: true });
const validation = validateSacramentDocumentUpload({ arrayBuffer: null });
if (validation.ok) {
  const mime: 'application/pdf' | 'image/jpeg' | 'image/png' = validation.mimeType;
  void mime;
  // @ts-expect-error: successful validation has no error branch.
  void validation.error;
} else {
  validation.error.toUpperCase();
  // @ts-expect-error: rejected content cannot be treated as a validated MIME type.
  void validation.mimeType;
}
// @ts-expect-error: storage requires bytes, not stringified data.
void putGivingStatementPdf(givingEnv, { parishId: 'parish', storageKey: 'key', bytes: 'pdf' });
// @ts-expect-error: upload validation receives a complete ArrayBuffer, not a typed-array view.
validateSacramentDocumentUpload({ arrayBuffer: new Uint8Array(4) });
// @ts-expect-error: donor download options remain boolean.
void streamSacramentDocument(sacramentEnv, { storageKey: 'key', download: 'yes' });
// @ts-expect-error: parish ownership metadata is mandatory on uploads.
void putGivingStatementPdf(givingEnv, { storageKey: 'key', bytes: new ArrayBuffer(4) });
// @ts-expect-error: the binding must provide the platform R2 API.
const invalidStorage: GivingStatementStorageEnv = { GIVING_STATEMENTS: {} };
void invalidStorage;
