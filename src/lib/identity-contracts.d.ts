export interface PlatformUserRow {
  id: string;
  email: string;
  display_name?: string | null;
  email_verified_at?: string | null;
  status: string;
  password_record?: string | null;
  created_at: string;
  updated_at: string;
  session_token_hash?: string | null;
  session_salt?: string | null;
  session_expires_at?: string | null;
  session_mfa_verified_at?: string | null;
}
export interface DonorRecord extends Record<string, unknown> {
  email: string;
  donorName?: string;
  householdName?: string;
  emailVerifiedAt?: string;
  defaultParishId?: string;
  sessionTokenHash?: string;
  sessionSalt?: string;
  sessionExpiresAt?: string;
  accountDeletionRequestedAt?: string;
}
