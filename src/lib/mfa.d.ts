export function mfaReadiness(env: Partial<Env>): Promise<{ required: boolean; ok: boolean; error?: string }>;

export interface MfaMetadata extends Record<string, unknown> {
  sessionId?: string;
  actor?: string;
  parishId?: string;
  parish?: unknown;
  identityEmail?: string;
  membershipId?: string;
  enrollmentMethod?: string;
}
export interface MfaTransaction {
  purpose: string;
  principal_type: string;
  principal_id: string;
  metadata?: MfaMetadata;
}
export interface MfaVerification {
  transaction: MfaTransaction;
  verifiedAt: string;
  recoveryCodes?: string[];
}
export interface MfaBody extends Record<string, unknown> {
  pendingToken?: unknown;
  method?: unknown;
  code?: unknown;
  credential?: unknown;
}
export function beginMfaAuthentication(
  env: Partial<Env>,
  request: Request,
  input: { principalType: string; principalId: string; purpose?: string; metadata?: MfaMetadata }
): Promise<{
  mfaRequired: boolean;
  enrollmentRequired: boolean;
  pendingToken: string;
  expiresAt: string;
  methods: string[];
  [key: string]: unknown;
}>;
export function beginMfaEnrollment(
  env: Partial<Env>,
  request: Request,
  pendingToken: unknown,
  input: { method?: unknown; displayName?: string; credentialLabel?: string }
): Promise<Record<string, unknown>>;
export function freshMfaAt(value: unknown, nowMs?: number): boolean;
export function loadMfaTransaction(
  env: Partial<Env>,
  pendingToken: unknown,
  options?: { consumeAttempt?: boolean }
): Promise<MfaTransaction | null>;
export function mfaStatus(
  env: Partial<Env>,
  principalType: string,
  principalId: string
): Promise<{ methods: string[]; enrolled: boolean }>;
export function verifyMfaAuthentication(
  env: Partial<Env>,
  request: Request,
  pendingToken: unknown,
  input?: MfaBody
): Promise<MfaVerification>;
export function verifyMfaEnrollment(
  env: Partial<Env>,
  request: Request,
  pendingToken: unknown,
  input?: MfaBody
): Promise<MfaVerification>;
