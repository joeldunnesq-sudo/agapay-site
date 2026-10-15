// Narrow declarations for the still-JavaScript facade consumed by migrated catalog and Stripe-volume code.
// These re-exports describe existing bindings; core.js is not yet type-checked.
export { d1, d1First, d1All } from './database-reads.js';
export { DONOR_OFFERING_KEY_PREFIX, listKvKeys } from './kv-reads.js';

import type { DatabaseReadEnv } from './database-reads.js';
export function d1Run(env: DatabaseReadEnv, sql: string, ...params: unknown[]): Promise<D1Result | null>;
export function d1Batch(
  env: DatabaseReadEnv,
  statements: readonly { sql: string; params?: readonly unknown[] }[] | null | undefined
): Promise<D1Result[] | null>;

export { normalizeEmail } from './normalize-email.js';
import type { EntitlementRegistration } from './entitlements.js';
export function hasActiveStewardshipComp(registration: EntitlementRegistration | null | undefined): boolean;
export function hasStewardshipAccess(registration: EntitlementRegistration | null | undefined): boolean;
export function stewardshipStatus(registration: EntitlementRegistration | null | undefined): string;
export function sha256Hex(value: unknown): Promise<string>;
export function d1GetSetting(env: DatabaseReadEnv, key: string): Promise<string>;
export function d1SetSetting(env: DatabaseReadEnv, key: string, value: string): Promise<void>;

export { json } from './http-responses.js';
import type { DashboardRegistration, DashboardSession } from '../handlers/parish-dashboard-handler.js';
export function getBearerToken(request: Request): string;
export function hasProductionStore(env: Partial<Env>): boolean;
export function missingProductionStoreResponse(): Response;
export function unauthorized(): Response;
export function rateLimit(
  request: Request,
  env: Partial<Env>,
  bucket: string,
  options?: { limit?: number; windowSeconds?: number }
): Promise<Response | null>;
export function applyParishDashboardPassword(
  registration: DashboardRegistration,
  password: string,
  options?: { temporary?: boolean; keepLegacyToken?: boolean }
): Promise<DashboardRegistration>;
export function issueParishDashboardSession(
  registration: DashboardRegistration,
  options?: { mfaVerifiedAt?: string; accessType?: string }
): Promise<DashboardSession>;

export function generateSecret(prefix?: string | number): string;

export { safeParseJsonRow } from './json-rows.js';
export function clampListLimit(value: unknown, defaultLimit?: number, maxLimit?: number): number;
export interface RegistrationCursorRow {
  received_at?: unknown;
  receivedAt?: unknown;
  reference?: unknown;
}
export function encodeListCursor(row?: RegistrationCursorRow): string;
export function decodeListCursor(cursor: unknown): { receivedAt: unknown; reference: unknown } | null;

export function clientIp(request: Request): string;
export function isSystemKvKey(keyName: unknown): boolean;
export interface PasswordRecord {
  version: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  hash: string;
}
export function createPasswordRecord(password: string): Promise<PasswordRecord>;
export function verifyPasswordRecord(password: string, record: unknown): Promise<boolean>;
export function hashSessionToken(token: string, salt: string): Promise<string>;
export function secureCompare(a: string, b: string): boolean;
export { parseJsonRow } from './json-rows.js';
export const COMMEMORATION_KEY_PREFIX: string;

export interface ResolvedParishDashboardSession {
  id: string;
  expiresAt: string;
  mfaVerifiedAt: string;
  accessType: string;
}
export function resolveParishDashboardSession(
  registration: DashboardRegistration | null | undefined,
  token: string
): Promise<ResolvedParishDashboardSession | null>;

export function randomHex(bytes?: number): string;

export function verifyTurnstileIfConfigured(
  request: Request,
  env: Partial<Env>,
  token: unknown
): Promise<Response | null>;

import type { DonorRecord } from './identity-contracts.js';
export function loadDonor(env: Partial<Env>, email: unknown): Promise<DonorRecord | null>;
export function publicDonor(donor: DonorRecord): Record<string, unknown>;
export function privilegedMfaRequired(env: Partial<Env>): boolean;
export function rateLimitByKey(
  request: Request,
  env: Partial<Env>,
  bucket: string,
  identifier: unknown,
  options?: { limit?: number; windowSeconds?: number }
): Promise<Response | null>;

export function issueAdminSession(
  env: Partial<Env>,
  actor?: string,
  options?: { mfaVerifiedAt?: string }
): Promise<{ token: string; actor: string; createdAt: string; expiresAt: string; mfaVerifiedAt: string }>;
export function markAdminSessionMfaVerified(
  env: Partial<Env>,
  sessionId: string | undefined,
  verifiedAt?: string
): Promise<boolean>;
export function resolveAdminSession(
  env: Partial<Env>,
  token: string
): Promise<{ id: string; actor: string; expiresAt: string; mfaVerifiedAt: string } | null>;
export function resolveParishDashboardSession(
  registration: import('../handlers/parish-dashboard-handler.js').DashboardRegistration,
  token: string
): Promise<{ id: string; expiresAt: string; mfaVerifiedAt: string; accessType: string } | null>;
export function markParishDashboardSessionMfaVerified<
  T extends import('../handlers/parish-dashboard-handler.js').DashboardRegistration,
>(registration: T, sessionId: string | undefined, verifiedAt?: string): { registration: T; changed: boolean };

export { corsHeaders } from './http-responses.js';
export function claimStripeEvent(
  env: Partial<Env>,
  event?: { id?: string; type?: string }
): Promise<{ claimed: boolean; reason?: string }>;
export function finishStripeEvent(
  env: Partial<Env>,
  eventId: string,
  status?: string,
  errorMessage?: string
): Promise<void>;

export function donorCheckoutIndexKey(id: string): string;
export function donorOfferingKey(email: string, id: string): string;
export function stripePaymentIntentIndexKey(id: string): string;

export const handleSecurityConfig: import('../routes/public.js').PublicActions<Env>['handleSecurityConfig'];

export { corsJson } from './http-responses.js';
