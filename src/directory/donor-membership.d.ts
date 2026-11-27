export const DONOR_MEMBERSHIP_SOURCE: 'myagapay_donor_membership';
export function donorMembershipStillEligible(env: Partial<Env>, parishId: string, userId: string): Promise<unknown>;
export function queueEligibleDonorMemberships(env: Partial<Env>, parishId: string): Promise<void>;
