import type { PaidOfferingStatusInput } from '../lib/paid-offering-status.js';
export { paidOfferingStatus } from '../lib/paid-offering-status.js';
export interface ReceiptOffering extends PaidOfferingStatusInput {
  [field: string]: unknown;
  id?: string;
  parishId?: string;
  donorEmail?: unknown;
  checkoutSessionId?: string;
  stripePaymentIntentId?: string;
  emailReceiptSentAt?: string;
  isDiagnostic?: boolean;
}
export function loadDonorOfferingByCheckout(
  env: Partial<Env>,
  checkoutSessionId: string
): Promise<ReceiptOffering | null>;
export function loadDonorOfferingByPaymentIntent(
  env: Partial<Env>,
  paymentIntentId: string
): Promise<ReceiptOffering | null>;
export function storeDonorOffering(env: Partial<Env>, offering: ReceiptOffering): Promise<ReceiptOffering | null>;
