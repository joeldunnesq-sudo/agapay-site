import {
  readUpload,
  persistDocument,
  type PreparationDocumentInput,
  type PreparationDocumentWriter,
} from '../../src/sacraments/document-upload.js';

declare const env: Env;
declare const request: Request;
declare const input: PreparationDocumentInput;
void readUpload(request, (body, init) => Response.json(body, init)).then((result) => {
  if (result.error) {
    result.error.headers.get('Content-Type');
    // @ts-expect-error: failed uploads contain no validated bytes.
    void result.arrayBuffer;
  } else {
    result.mimeType.toUpperCase();
    result.file.name.toUpperCase();
    // @ts-expect-error: upload metadata is readonly for callers.
    result.sha256 = 'replaced';
  }
});
const writer: PreparationDocumentWriter<Env, PreparationDocumentInput> = async (bindings, record) => {
  void bindings.AGAPAY_DB.prepare('SELECT 1');
  record.storageKey.toUpperCase();
  return 'document-id';
};
void persistDocument(env, input, writer);
// @ts-expect-error: persistence returns an asynchronous document ID, not a number.
void persistDocument(env, input, async () => 123);
// @ts-expect-error: a synchronous callback cannot satisfy persistence ordering.
void persistDocument(env, input, () => 'document-id');
// @ts-expect-error: document roles must be guide or supporting.
void persistDocument(env, { ...input, documentRole: 'public' }, writer);
// @ts-expect-error: successful storage requires an actual upload buffer.
void persistDocument(env, { ...input, arrayBuffer: 'file' }, writer);
// @ts-expect-error: error responses must be real HTTP responses.
void readUpload(request, () => ({ status: 422 }));
