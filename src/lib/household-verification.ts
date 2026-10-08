export interface HouseholdVerificationRow {
  verification_status?: unknown;
  verification_due_at?: unknown;
}
export const HOUSEHOLD_VERIFICATION_REQUIRED_CODE = 'household_verification_required';
export const HOUSEHOLD_VERIFICATION_REQUIRED_MESSAGE =
  "Your household's directory information needs to be reconfirmed before you can access Koinonia. Contact your parish office.";

export function householdVerificationStatus(
  row: HouseholdVerificationRow | null | undefined,
  currentTime = Date.now()
) {
  if (!row) return 'due';
  const status = String(row.verification_status || 'due');
  const dueAt = Number(row.verification_due_at || 0);
  if (status === 'current' && (!Number.isFinite(dueAt) || dueAt <= 0 || dueAt < Number(currentTime))) return 'overdue';
  return status;
}

export function isHouseholdVerificationCurrent(
  row: HouseholdVerificationRow | null | undefined,
  currentTime = Date.now()
) {
  return householdVerificationStatus(row, currentTime) === 'current';
}
