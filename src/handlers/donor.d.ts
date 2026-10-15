import type { ReceiptDelivery } from '../payments/donation-receipts.js';
import type { EmailEnv, EmailResult } from '../lib/email.js';
export function sendDonorVerificationEmail(
  env: EmailEnv,
  donor: { email: string; donorName?: string; isDiagnostic?: boolean },
  verificationUrl: string
): Promise<EmailResult>;
export function sendDonorDonationReceiptEmail(
  env: EmailEnv,
  offering: Record<string, unknown>
): Promise<ReceiptDelivery>;
