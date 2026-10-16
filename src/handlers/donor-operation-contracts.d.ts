import type { DonorRecord } from '../lib/identity-contracts.js';
export type DonorEnvironment = Partial<Env> & { STRIPE_SECRET_KEY?: string | null; RESEND_API_KEY?: string | null };
export interface DonorSqlRow {
  id: string;
  data: string;
  email: string;
  user_id: string;
  session_token_hash: string;
}
export interface DonorVerificationResult {
  error?: string;
  detail?: string;
  token?: string;
  donor?: Partial<DonorRecord>;
  alreadyVerified?: boolean;
}

export interface DonorRequestBody extends Partial<DonorRecord> {
  parishId?: string;
  phone?: string;
  newPassword?: string;
  currentPassword?: string;
}
