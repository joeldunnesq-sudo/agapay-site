export interface EventCatalogItem {
  id: string;
  variantId: string;
  name: string;
  variantName?: string;
  description?: string;
  priceCents: number;
  trackInventory?: boolean;
  stockQuantity: number;
  maxQuantityPerOrder: number;
  eventDate?: string;
  eventLocation?: string;
  salesCloseAt?: string;
  eventStartTime?: string;
}
export interface EventCartRow {
  productId?: string;
  variantId: string;
  name: string;
  priceCents: number;
  quantity: number;
  eventDate?: string;
}
export interface EventsPayload {
  error?: string;
  available?: boolean;
  items?: EventCatalogItem[];
  orders?: unknown[];
  parish?: { name: string };
  sellerDisclosure?: string;
  url?: string;
}
export interface BookstoreProduct {
  id: string;
  variantId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  category?: string;
  categoryLabel?: string;
  onSale?: boolean;
  savingsPercent?: number;
  regularPriceCents?: number;
  priceCents: number;
  trackInventory?: boolean;
  stockQuantity: number;
  unitsSold?: number;
  barcode?: string;
  sku?: string;
}
export interface BookstoreCartRow {
  name: string;
  priceCents: number;
  quantity: number;
  variantId?: string;
  productId?: string;
  buyerAdded?: boolean;
  source?: string;
  itemCategory?: string;
  categoryLabel?: string;
  specifics?: Record<string, string | undefined>;
}
export interface BookstorePayload {
  error?: string;
  available?: boolean;
  products?: BookstoreProduct[];
  parish?: { name: string };
  sellerDisclosure?: string;
  url?: string;
  found?: boolean;
  title?: string;
  author?: string;
}
