export type DirectoryEnvironment = Partial<Env>;
export interface DirectoryActorInput {
  userId?: unknown;
  parishId?: unknown;
  personId?: unknown;
  actorType?: unknown;
  capabilities?: unknown;
  user?: { id?: unknown } | null;
  membership?: { parishId?: unknown } | null;
}
export interface DirectoryStatement {
  sql: string;
  params?: readonly unknown[];
}
export interface DirectoryAudit {
  action: string;
  actor: DirectoryActorInput;
  parishId: string;
  targetType: string;
  targetId: string;
  householdId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  correlationId?: string;
}
export interface DirectoryMutation {
  correlationId?: string;
  actor: DirectoryActorInput;
  parishId?: unknown;
  personId?: unknown;
  householdId?: unknown;
  preferredName?: unknown;
  legalName?: unknown;
  middleName?: unknown;
  suffix?: unknown;
  dateOfBirth?: unknown;
  biologicalSex?: unknown;
  deceased?: unknown;
  active?: unknown;
  notes?: unknown;
  displayName?: unknown;
  relationship?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  linkType?: unknown;
  externalId?: unknown;
  status?: unknown;
  joinedDate?: unknown;
  leftDate?: unknown;
}
export interface DirectoryPersonRow extends Record<string, unknown> {
  id: string;
  created_by_parish_id: string;
  preferred_name: string;
  legal_name: string | null;
  middle_name: string | null;
  suffix: string | null;
  date_of_birth: string | null;
  biological_sex: string;
  deceased: number;
  active: number;
  notes: string | null;
  created_at: number;
  updated_at: number;
}
export interface DirectoryHouseholdRow extends Record<string, unknown> {
  id: string;
  parish_id: string;
  display_name: string;
  active: number;
  created_at: number;
  updated_at: number;
}
export interface DirectoryRelationRow extends Record<string, unknown> {
  id: string;
  person_id: string;
  household_id?: string;
  relationship?: string;
  status?: string;
  active?: number;
}
export interface DirectoryOwner {
  ownerType: unknown;
  ownerId: unknown;
  parishId: string;
}
export type DirectoryVisibility = 'private' | 'household' | 'clergy' | 'staff' | 'leadership' | 'directory_members';
export type NullablePatch<T> = { [K in keyof T]?: T[K] | null };

export interface DirectorySettingsRow extends Record<string, unknown> {
  parish_id: string;
  address_max_visibility: string;
  contact_max_visibility: string;
  clergy_staff_access_policy: string;
  default_household_publication_status: string;
  skills_disclaimer_text?: string | null;
  skills_contact_fallback?: string | null;
}
export interface DirectoryPrivacyRow extends Record<string, unknown> {
  id?: string;
  visibility?: string;
  publication_eligible?: number;
}
export interface DirectoryPublicationRow extends Record<string, unknown> {
  id: string;
  parish_id: string;
  owner_type: string;
  owner_id: string;
  status: string;
  approval_status: string;
  approved_by_user_id: string | null;
  approved_at: number | null;
  active: number;
  created_at: number;
  updated_at: number;
}
export interface DirectoryPublicationProfile {
  parishId: string;
  ownerType: string;
  ownerId: string;
  status: string;
  approvalStatus: string;
  active: boolean;
  id?: string;
  approvedByUserId?: string;
  approvedAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
  persisted?: boolean;
}

export interface DirectoryContactInput extends DirectoryMutation {
  ownerType?: unknown;
  ownerId?: unknown;
  contactType?: unknown;
  value?: unknown;
  label?: unknown;
  primary?: unknown;
  verified?: unknown;
  smsCapable?: unknown;
  visibility?: unknown;
  contactId?: unknown;
  addressId?: unknown;
  patch?: Record<string, unknown>;
  correlationId?: string;
  addressType?: unknown;
  line1?: unknown;
  line2?: unknown;
  city?: unknown;
  region?: unknown;
  postalCode?: unknown;
  country?: unknown;
  protectedAddress?: unknown;
}
export interface DirectoryContactRow extends Record<string, unknown> {
  id: string;
  parish_id: string;
  owner_type: string;
  owner_id: string;
  contact_type: string;
  label: string;
  value: string;
  normalized_value: string;
  visibility: string;
  is_primary: number;
  verified: number;
  sms_capable: number | null;
  active: number;
  created_at: number;
  updated_at: number;
}
export interface DirectoryAddressRow extends Record<string, unknown> {
  id: string;
  parish_id: string;
  owner_type: string;
  owner_id: string;
  address_type: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postal_code: string | null;
  country: string;
  normalized_value: string;
  visibility: string;
  is_primary: number;
  protected_address: number;
  active: number;
  created_at: number;
  updated_at: number;
}

export interface DirectoryInvitationRow extends Record<string, unknown> {
  id: string;
  parish_id: string;
  invitation_type: string;
  intended_person_id: string;
  intended_household_id: string | null;
  intended_authority: string;
  recipient_email: string | null;
  recipient_label: string | null;
  issued_by_user_id: string;
  status: string;
  requires_review: number;
  resend_count: number;
  token_hash: string;
  last_sent_at: number | null;
  created_at: number;
  expires_at: number;
  accepted_at: number | null;
  revoked_at: number | null;
  completed_at: number | null;
}
export interface DirectoryInvitationInput {
  actor: DirectoryActorInput;
  parishId: unknown;
  invitationType: unknown;
  intendedPersonId: unknown;
  intendedHouseholdId?: unknown;
  intendedAuthority: unknown;
  recipientEmail?: unknown;
  recipientPhone?: unknown;
  recipientLabel?: unknown;
  ttlMs?: unknown;
  correlationId?: string;
}
export interface DirectoryContext extends DirectoryActorInput {
  parishId: string;
}

export interface DirectorySelfContext {
  user: { id: string };
  claimed?: boolean;
  currentPerson?: { id: string } | null;
  manageableHouseholds?: readonly { id: string; parishId: string }[];
  memberHouseholds?: readonly { id: string; parishId: string }[];
  activeParishContexts?: readonly { parishId: string }[];
}
export interface DirectoryShareInvitationRow extends Record<string, unknown> {
  id: string;
  parish_id: string;
  household_id: string;
  person_id: string;
  status: string;
  expires_at: string;
  person_name: string;
  household_name: string;
  created_by_user_id: string;
  relationship: string | null;
}
export interface ChildPublicationRow extends Record<string, unknown> {
  id: string;
  parish_id: string;
  household_id: string;
  child_person_id: string;
  status: string;
  requested_fields_json: string | null;
  approved_fields_json: string | null;
  parent_note: string | null;
  reviewer_note: string | null;
  reason_code: string | null;
  requester_user_id: string;
  requester_person_id: string | null;
}
