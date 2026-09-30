import {
  validateExemptionUpload,
  putExemptionDocument,
  streamExemptionDocument,
  deleteExemptionDocument,
  type ExemptionStorageEnv,
} from '../../src/lib/tax-exemption-storage.js';
import {
  validateNonprofitPricingUpload,
  putNonprofitPricingDocument,
  type NonprofitPricingStorageEnv,
} from '../../src/lib/nonprofit-pricing-storage.js';
import {
  validateAccountingAttachmentUpload,
  putAccountingAttachment,
  type AccountingAttachmentStorageEnv,
} from '../../src/lib/accounting-attachment-storage.js';

declare const env: Env;
const tax: ExemptionStorageEnv = env;
const nonprofit: NonprofitPricingStorageEnv = env;
const accounting: AccountingAttachmentStorageEnv = env;
const upload = { parishId: 'parish', arrayBuffer: new ArrayBuffer(4), mimeType: 'application/pdf' };
void putExemptionDocument(tax, upload);
void putNonprofitPricingDocument(nonprofit, upload);
void putAccountingAttachment(accounting, upload);
void streamExemptionDocument({}, { storageKey: 'key', mode: 'attachment' });
void deleteExemptionDocument({}, 'key');
for (const validate of [validateExemptionUpload, validateNonprofitPricingUpload, validateAccountingAttachmentUpload]) {
  void validate({ arrayBuffer: null }).then((result) => {
    if (result.ok) {
      const mime: 'application/pdf' | 'image/jpeg' | 'image/png' = result.mimeType;
      void mime;
      // @ts-expect-error: successful results have no error.
      void result.error;
    } else {
      result.error.toUpperCase();
      // @ts-expect-error: rejected uploads have no validated MIME type.
      void result.mimeType;
    }
  });
}
// @ts-expect-error: validation must be awaited before its outcome is used.
void validateNonprofitPricingUpload({}).ok;
// @ts-expect-error: upload bodies require an ArrayBuffer, not text.
void putAccountingAttachment(accounting, { ...upload, arrayBuffer: 'pdf' });
// @ts-expect-error: ownership metadata cannot be omitted.
void putNonprofitPricingDocument(nonprofit, { arrayBuffer: upload.arrayBuffer, mimeType: upload.mimeType });
// @ts-expect-error: display modes are the supported inline/attachment options.
void streamExemptionDocument(tax, { storageKey: 'key', mode: 'public' });
// @ts-expect-error: R2 bindings cannot be replaced by bucket names.
const invalidTaxStorage: ExemptionStorageEnv = { TAX_EXEMPTION_DOCS: 'public-assets' };
void invalidTaxStorage;
