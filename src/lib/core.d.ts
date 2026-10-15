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
