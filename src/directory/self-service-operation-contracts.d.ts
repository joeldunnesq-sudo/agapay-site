export interface SelfServiceSqlRow {
  publication_eligible: number;
  intended_household_id: string;
  id: string;
  preferred_name: string;
  legal_name: string;
  middle_name: string;
  suffix: string;
  date_of_birth: string;
  biological_sex: string;
  active: number;
  updated_at: number;
  parish_id: string;
  display_name: string;
  anniversary_date: string;
  anniversary_visibility: string;
  status: string;
  person_id: string;
  relationship: string;
  is_child: number;
  protected_person: number;
  account_linked: number;
  person_updated_at: number;
  label: string;
  value: string;
  primary: string;
  verified: string;
  visibility: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  country: string;
  request_type: string;
  target_type: string;
  target_id: string;
  household_id: string;
  summary: string;
  created_at: number;
  created_by_parish_id: string;
  saint_name: string;
  feast_month_day: string;
  owner_type: string;
  owner_id: string;
  requester_person_id: string;
}
export interface SelfServiceUser {
  id: string;
  email: string;
  displayName?: string;
}
export interface SelfPerson {
  id: string;
  preferredName: string;
  legalName: string;
  middleName: string;
  suffix: string;
  dateOfBirth: string;
  biologicalSex: string;
  active: boolean;
  protectedPerson: boolean;
  child: boolean;
  version: number;
}
interface SelfServiceContextBase {
  user: SelfServiceUser;
  activeParishContexts: { parishId: string; status: string; active: boolean }[];
  memberHouseholds: { id: string; parishId: string; displayName: string; relationship: string }[];
  manageableHouseholds: { id: string; parishId: string; displayName: string }[];
  permissions: { canSelfManage: boolean; canManageHouseholds: boolean; canInviteAdults?: boolean };
  pendingRequests: {
    id: string;
    parishId: string;
    requestType: string;
    targetType: string;
    targetId: string;
    householdId: string;
    status: string;
    summary: string;
    createdAt: number;
    updatedAt: number;
  }[];
  entitlement: { mission: boolean; parish: boolean; phase2AAvailable: boolean };
}
export interface SelfPrivacyFlags {
  protectedPerson?: boolean;
  isChild?: boolean;
}

export type SelfServiceContext = SelfServiceContextBase &
  ({ claimed: false; currentPerson: null } | { claimed: true; currentPerson: SelfPerson });

export interface SelfHousehold {
  id: string;
  parishId: string;
  displayName: string;
  anniversaryDate: string;
  anniversaryVisibility: string;
  active: boolean;
  version: number;
}
export interface SelfActorContext {
  user: { id: string };
  currentPerson?: { id: string } | null;
}
