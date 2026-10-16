interface DirectoryUiPhoto {
  url?: string;
  lifecycleStatus?: string;
  visibility?: string;
  processingStatus?: string;
  ownerType?: string;
  publicationEligible?: boolean;
}
interface DirectoryUiPreference {
  visibility?: string;
  publicationEligible?: boolean;
}
interface DirectoryUiContact extends DirectoryUiPreference {
  value?: string;
  label?: string;
  contact_type?: string;
  contactType?: string;
  personName?: string;
}
interface DirectoryUiAddress extends DirectoryUiPreference {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  primary?: boolean;
  addressType?: string;
}
interface DirectoryUiInvitation {
  id: string;
  status?: string;
  recipientEmail?: string;
  expiresAt: string;
}
interface DirectoryUiRow {
  id?: string;
  displayName?: string;
  display_name?: string;
  preferredName?: string;
  preferred_name?: string;
  legalName?: string;
  person_id?: string;
  personId?: string;
  household_id?: string;
  householdId?: string;
  feast_month_day?: string;
  feastMonthDay?: string;
  saint_name?: string;
  saintName?: string;
  memberCount?: number;
  administratorCount?: number;
  adminCount?: number;
  pendingRequestCount?: number;
  householdCount?: number;
  child?: boolean;
  claimed?: boolean;
  deceased?: boolean;
  accountLinked?: boolean;
  parishConnected?: boolean;
  relationship?: string;
  version?: string;
  personVersion?: string;
  invitation?: DirectoryUiInvitation;
  email?: string;
  photo?: DirectoryUiPhoto;
  household?: DirectoryUiRow;
  person?: DirectoryUiRow;
  householdDisplayName?: string;
  staffContact?: { email?: DirectoryUiContact; phone?: DirectoryUiContact; address?: DirectoryUiAddress };
  displayLabel?: string;
  skill?: { name?: string };
  status?: string;
  experienceLevel?: string;
  serviceMode?: string;
  sourceType?: string;
  sourceId?: string;
  priority?: string;
  targetLabel?: string;
  summary?: string;
  ageDays?: number;
  queueStatus?: string;
  reviewType?: string;
  requesterLabel?: string;
  targetType?: string;
  targetId?: string;
  permittedActions?: string[];
}
interface DirectoryUiNote {
  title?: string;
  noteType?: string;
  body?: string;
  note?: string;
  summary?: string;
}
interface DirectoryUiAccess {
  activeInvitation?: DirectoryUiInvitation;
  linked?: boolean;
  child?: boolean;
}
interface DirectoryUiDetail {
  person?: DirectoryUiRow;
  household?: DirectoryUiRow;
  accountAccess?: DirectoryUiAccess;
  households?: DirectoryUiRow[];
  members?: DirectoryUiRow[];
  administrators?: DirectoryUiRow[];
  parishConnected?: boolean;
  publication?: { status?: string; approval_status?: string };
  householdVerification?: { status?: string };
  verification?: { status?: string };
  contacts?: DirectoryUiContact[];
  addresses?: DirectoryUiAddress[];
  notes?: DirectoryUiNote[];
  photo?: DirectoryUiPhoto;
}
interface DirectoryUiPrint {
  households?: DirectoryUiRow[];
  listings?: DirectoryUiRow[];
  privacyReminder?: string;
  generatedAt?: string;
  disclaimer?: string;
}
interface DirectoryUiSettings {
  directoryEnabled?: boolean;
  ordinaryMemberAccessEnabled?: boolean;
}
interface DirectoryUiDashboard {
  metrics?: Record<string, number>;
}
interface DirectoryUiSkills {
  listings?: DirectoryUiRow[];
}
interface DirectoryUiReview {
  item?: DirectoryUiRow;
  proposed?: Record<string, unknown> & {
    photo?: DirectoryUiPhoto;
    publicationPreferences?: Record<string, DirectoryUiPreference>;
  };
  media?: DirectoryUiPhoto;
  current?: Record<string, unknown>;
  conversation?: { direction?: string; body?: string }[];
}
interface DirectoryUiPayload {
  ok?: boolean;
  message?: string;
  error?: string;
  settings?: DirectoryUiSettings;
  dashboard?: DirectoryUiDashboard;
  items?: DirectoryUiRow[];
  people?: DirectoryUiRow[];
  households?: DirectoryUiRow[];
  skills?: DirectoryUiSkills;
  maintenance?: Record<string, number>;
  print?: DirectoryUiPrint;
  person?: DirectoryUiDetail;
  household?: DirectoryUiDetail;
  review?: DirectoryUiReview;
  delivery?: string;
  invitationUrl?: string;
}
interface DirectoryUiState {
  dashboard: DirectoryUiDashboard;
  queue: DirectoryUiRow[];
  people: DirectoryUiRow[];
  households: DirectoryUiRow[];
  skills: DirectoryUiSkills;
  maintenance: Record<string, number>;
  print: DirectoryUiPrint;
  settings: DirectoryUiSettings;
}

interface ParishWorkspaceIdentity {
  directoryEnabled?: boolean;
}
declare function renderDirectoryAdminAccessError(status?: number, message?: string): string;
declare function renderDirectoryAdminGenericError(message?: string): string;
