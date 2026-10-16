// Consumed subscription boundary; exemption behavior remains in JavaScript.
export function applyApprovedExemptionIfExists(
  env: Partial<Env>,
  input: {
    registration: Readonly<Record<string, unknown>> & { reference: string };
    stripeCustomerId: string;
    customerRole: string;
  }
): Promise<{ applied: boolean; ok?: boolean }>;

export function processExpiredTaxExemptions(env: Partial<Env>): Promise<unknown>;

export function createTaxExemptionClaim(
  env: Partial<Env>,
  input: {
    registrationReference: string;
    parishId: string;
    jurisdiction: string;
    exemptionType: string;
    certificateNumber: string;
    effectiveDate: string;
    expirationDate: string;
    authorizedRepresentativeName: string;
    authorizedRepresentativeTitle: string;
    actorUserId: string;
    internalReviewStatus: string | null;
  }
): Promise<string>;
export function issueClaimUploadToken(env: Partial<Env>, id: string): Promise<{ token: string; expiresAt: string }>;
