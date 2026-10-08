// Narrow invitation boundary used by notifications. Authorization remains in memberships.js.
import type { DatabaseReadEnv } from './database-reads.js';
export interface ParishInvitation {
  id: string;
  email: string;
  status: string;
  roleTemplate: string;
  expiresAt: string;
}
export function listInvitationsForParish(env: DatabaseReadEnv, parishId: string): Promise<ParishInvitation[]>;
export function revokeInvitation(env: DatabaseReadEnv, options: { invitationId: string }): Promise<boolean>;
export function createInvitation(
  env: DatabaseReadEnv,
  options: { parishId: string; email: string; roleTemplate: string; invitedByLegacyBearer: boolean }
): Promise<{ ok: true; id: string; token: string; expiresAt: string } | { ok: false; code: string; error: string }>;
