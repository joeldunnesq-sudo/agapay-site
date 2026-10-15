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

export const handleDonorClaimCheckout: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorClaimCheckout'];

export const handleDonorSession: import('../routes/donor.js').DonorActions<Env, ExecutionContext>['handleDonorSession'];

export const handleDonorPasswordResetRequest: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorPasswordResetRequest'];

export const handleDonorPasswordResetConfirm: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorPasswordResetConfirm'];

export const handleDonorSignup: import('../routes/donor.js').DonorActions<Env, ExecutionContext>['handleDonorSignup'];

export const handleDonorLogin: import('../routes/donor.js').DonorActions<Env, ExecutionContext>['handleDonorLogin'];

export const handleDonorVerify: import('../routes/donor.js').DonorActions<Env, ExecutionContext>['handleDonorVerify'];

export const handleDonorVerifyPage: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorVerifyPage'];

export const handleDonorDashboard: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorDashboard'];

export const handleDonorSupportTicket: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorSupportTicket'];

export const handleDonorAccountDeletion: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorAccountDeletion'];

export const handleDonorParishCalendar: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorParishCalendar'];

export const handleDonorGivingPlusFeatureRequest: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorGivingPlusFeatureRequest'];

export const handleDonorMinistryServiceInterest: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorMinistryServiceInterest'];

export const handleDonorStewardshipFeatureRequest: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorStewardshipFeatureRequest'];

export const handleDonorOfferings: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorOfferings'];

export const handleDonorSubscriptionPortal: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorSubscriptionPortal'];

export const handleDonorBookstore: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorBookstore'];

export const handleParishBookstoreReadiness: import('../routes/parish.js').ParishActions<
  Env,
  ExecutionContext
>['handleParishBookstoreReadiness'];

export const handleDonorBookstoreItemFields: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorBookstoreItemFields'];

export const handleDonorBookstoreIsbnLookup: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorBookstoreIsbnLookup'];

export const handleDonorBookstoreRequestFeature: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorBookstoreRequestFeature'];

export const handleDonorCommemorations: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorCommemorations'];

export const handleDonorSacraments: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorSacraments'];

export const handleDonorSacramentAvailability: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorSacramentAvailability'];

export const handleDonorSacramentBook: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorSacramentBook'];

export const handleDonorSacramentCancel: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorSacramentCancel'];

export const handleDonorNotifications: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorNotifications'];

export const handleDonorNotificationDismiss: import('../routes/donor.js').DonorActions<
  Env,
  ExecutionContext
>['handleDonorNotificationDismiss'];
