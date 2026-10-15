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

import type { DonorRecord } from '../lib/identity-contracts.js';
export function issueDonorSession(
  env: Partial<Env>,
  donor: DonorRecord
): Promise<{ token: string; donor: DonorRecord }>;

export function offeringLabel(offering: Record<string, unknown>): string;

export function sendDonationReceiptIfNeeded(
  env: Partial<Env>,
  offering: import('./parish-donor-offerings.js').ReceiptOffering
): Promise<import('./parish-donor-offerings.js').ReceiptOffering | null>;
