export interface CoreSession {
  id?: string;
  actor?: string;
  tokenHash?: string;
  sessionSalt?: string;
  createdAt?: string;
  expiresAt?: string;
  mfaVerifiedAt?: string;
  accessType?: string;
}
export interface CoreAdminStore {
  version?: number;
  sessions: CoreSession[];
}
export interface MarketplaceEntry {
  name?: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  subtitle?: string;
  location?: string;
  badge?: string;
  shopName?: string;
  shop?: string;
  imageType?: string;
  imageUrl?: string;
  priceCents?: number;
  id?: string;
}
export type CoreEnvironment = Partial<Env> & {
  PRIVILEGED_MFA_REQUIRED?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
};
export interface PasswordRecord {
  version: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  hash: string;
}
export interface RegistrationCursorRow {
  received_at?: unknown;
  receivedAt?: unknown;
  reference?: unknown;
}
