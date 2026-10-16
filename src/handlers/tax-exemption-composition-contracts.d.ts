import type { ParishRegistration } from './parish-operation-contracts.js';

import type { TaxEnvironment, TaxClaimRow, TaxSyncRow, TaxRegistration } from '../lib/tax-exemption-contracts.js';
export interface TaxRequestBody extends Record<string, unknown> {
  certificateNumber?: string;
  effectiveDate?: string;
  expirationDate?: string;
}
export type { ParishRegistration, TaxEnvironment, TaxClaimRow, TaxSyncRow, TaxRegistration };
