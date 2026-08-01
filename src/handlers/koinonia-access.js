import { currentUser } from "../lib/authorization.js";
import { d1First, json, normalizeEmail } from "../lib/core.js";
import {
  HOUSEHOLD_VERIFICATION_REQUIRED_CODE,
  HOUSEHOLD_VERIFICATION_REQUIRED_MESSAGE,
  householdVerificationStatus,
  isHouseholdVerificationCurrent,
} from "../lib/household-verification.js";
import { requireDonor } from "./parish.js";

export class KoinoniaAccessError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "KoinoniaAccessError";
    this.code = code;
    this.status = status;
  }
}

function accessError(code, message, status) {
  return new KoinoniaAccessError(code, message, status);
}

export async function resolveDonorHouseholdContext(request, env) {
  const donor = await requireDonor(request, env);
  if (!donor?.email) {
    throw accessError("authentication_required", "Sign in to access Koinonia.", 401);
  }

  const parishId = String(donor.defaultParishId || "").trim();
  if (!parishId) {
    throw accessError("home_parish_required", "Choose your home parish to access Koinonia.", 422);
  }

  const user = await currentUser(request, env);
  if (!user?.id) {
    throw accessError("parish_profile_required", "Your donor account is not linked to a parish member profile.", 403);
  }

  const row = await d1First(env, `
    SELECT p.id AS person_id,
           h.id AS household_id,
           verification.verification_status,
           verification.verification_due_at,
           verification.last_verified_at,
           verification.verification_policy_version
    FROM directory_person_links link
    JOIN directory_people p
      ON p.id = link.person_id
     AND p.active = 1
    LEFT JOIN directory_household_members membership
      ON membership.person_id = p.id
     AND membership.active = 1
    LEFT JOIN directory_households h
      ON h.id = membership.household_id
     AND h.parish_id = ?
     AND h.active = 1
    LEFT JOIN directory_household_verifications verification
      ON verification.household_id = h.id
     AND verification.parish_id = h.parish_id
    WHERE link.link_type = 'platform_user'
      AND link.external_id = ?
      AND link.active = 1
    ORDER BY CASE WHEN h.id IS NULL THEN 1 ELSE 0 END,
      CASE membership.relationship
      WHEN 'head' THEN 0
      WHEN 'spouse' THEN 1
      ELSE 2
    END, membership.created_at ASC
    LIMIT 1
  `, parishId, user.id);

  if (!row?.person_id) {
    throw accessError("parish_profile_required", "Your account is not linked to an active parish member.", 403);
  }

  return {
    donor,
    donorId: normalizeEmail(donor.email),
    user,
    parishId,
    personId: row.person_id,
    householdId: row.household_id || "",
    verification: row.household_id ? {
      verification_status: row.verification_status,
      verification_due_at: row.verification_due_at,
      last_verified_at: row.last_verified_at,
      verification_policy_version: row.verification_policy_version,
    } : null,
  };
}

export async function requireVerifiedHousehold(request, env) {
  const context = await resolveDonorHouseholdContext(request, env);
  if (!context.householdId || !isHouseholdVerificationCurrent(context.verification)) {
    throw accessError(
      HOUSEHOLD_VERIFICATION_REQUIRED_CODE,
      HOUSEHOLD_VERIFICATION_REQUIRED_MESSAGE,
      403,
    );
  }
  return {
    ...context,
    verificationStatus: householdVerificationStatus(context.verification),
  };
}

export function koinoniaAccessErrorResponse(error) {
  if (!(error instanceof KoinoniaAccessError)) return null;
  return json({ error: error.message, code: error.code }, { status: error.status });
}

export async function verifiedHouseholdAccess(request, env) {
  try {
    return { context: await requireVerifiedHousehold(request, env), response: null };
  } catch (error) {
    const response = koinoniaAccessErrorResponse(error);
    if (response) return { context: null, response };
    throw error;
  }
}

export async function handleKoinoniaAccess(request, env) {
  const access = await verifiedHouseholdAccess(request, env);
  if (access.response) return access.response;
  return json({
    ok: true,
    parishId: access.context.parishId,
    householdId: access.context.householdId,
    verificationStatus: access.context.verificationStatus,
    verificationDueAt: Number(access.context.verification.verification_due_at || 0),
  });
}
