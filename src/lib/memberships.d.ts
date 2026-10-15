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
export function revokeInvitation(
  env: DatabaseReadEnv,
  options: { invitationId: string; actorUserId?: string | null; request?: Request | null }
): Promise<boolean>;
export function createInvitation(
  env: DatabaseReadEnv,
  options: {
    parishId: string;
    email: string;
    roleTemplate: string;
    invitedByLegacyBearer: boolean;
    capabilities?: readonly string[];
    invitedByUserId?: string | null;
    request?: Request | null;
  }
): Promise<{ ok: true; id: string; token: string; expiresAt: string } | { ok: false; code: string; error: string }>;

export function listMembershipsForParish(
  env: DatabaseReadEnv,
  parishId: string
): Promise<{ id: string; parishId: string; status: string }[]>;

export function listMembershipsForUser(
  env: DatabaseReadEnv,
  userId: string
): Promise<{ id: string; parishId: string; status: string }[]>;
export function acceptInvitation(
  env: DatabaseReadEnv,
  input: { token: string; password: string; displayName?: string; request?: Request | null }
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      userId: string;
      membershipId: string;
      parishId: string;
      email: string;
      roleTemplate: string;
      acceptedAt: string;
    }
>;
