import type { RegistrationRecord } from '../organizations/types.js';
import type { ResolvedParishSession } from './parish-sessions.js';

// Session resolution owns hashing, expiry, and persisted MFA metadata.
// Stored metadata remains unknown; the resolver's result is a checked shape.
export type ParishDashboardSessionResolver = (
  registration: RegistrationRecord | null | undefined,
  token: string
) => Promise<ResolvedParishSession | null>;

export function createParishDashboardBearerVerifier(resolveParishDashboardSession: ParishDashboardSessionResolver) {
  return async function verifyParishDashboardBearer(
    registration: RegistrationRecord | null | undefined,
    token: string
  ): Promise<boolean> {
    return Boolean(await resolveParishDashboardSession(registration, token));
  };
}
