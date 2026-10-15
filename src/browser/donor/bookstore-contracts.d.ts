interface DonorBookstoreExperienceProduct {
  unitsSold?: number;
}
interface DonorBookstoreParish extends AppHeaderParish {
  city?: string;
  state?: string;
  jurisdictionLabel?: string;
  jurisdiction?: string;
}
interface DonorBookstoreCartRow {
  type: 'product' | 'manual';
  productId?: string;
  variantId?: string;
  name?: string;
  categoryLabel?: string;
  imageUrl?: string;
  unitPriceCents: number;
  quantity: number;
  itemCategory?: string;
  specifics?: Record<string, string>;
  unitPrice?: number;
  source?: string;
}
type DonorBookstoreField = { key: string; label: string; required?: boolean } & (
  { type: 'select'; options: string[] } | { type?: 'text'; maxLength?: number }
);
interface DonorBookstoreFields {
  category: string;
  label: string;
  fields: DonorBookstoreField[];
}
interface DonorBookstoreOrder {
  paymentStatus?: string;
  fulfillmentStatus: string;
  items?: { name: string; quantity: number; totalCents: number }[];
  pickupNote?: string;
  taxCents?: number;
}
interface DonorPagePayload {
  categories?: DonorBookstoreFields[];
  found?: boolean;
  product?: DonorBookstoreExperienceProduct;
  title?: string;
  author?: string;
  isbn?: string;
  parish?: DonorBookstoreParish | null;
  products?: DonorBookstoreExperienceProduct[];
  available?: boolean;
  alreadySent?: boolean;
  url?: string;
  message?: string;
}
interface Window {
  agapayPublicParishes?: DonorBookstoreParish[];
  BarcodeDetector?: {
    new (options: { formats: string[] }): DonorBarcodeDetector;
    getSupportedFormats(): Promise<string[]>;
  };
}
interface DonorBarcodeDetector {
  detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
interface DonorZxingReader {
  decodeFromVideoElement(
    video: HTMLVideoElement,
    callback: (result: { text?: string } | null, err?: unknown) => void
  ): void;
  reset(): void;
}
declare const ZXing: { BrowserMultiFormatReader: new () => DonorZxingReader };
interface MediaTrackCapabilities {
  torch?: boolean;
}
interface MediaTrackConstraintSet {
  torch?: boolean;
}
declare function fetchPublicParishes(): Promise<DonorBookstoreParish[]>;
declare function primeCommemorationParishDisplay(): void;

interface AppHeaderDonorProfile {
  defaultParishName?: string;
}
