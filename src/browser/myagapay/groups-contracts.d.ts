export interface GroupUiGroup {
  id: string;
  name: string;
  role?: string;
  description?: string;
  headcountDelegated?: boolean;
  hasImage?: boolean;
  imageUrl?: string;
  messageCount?: number;
  unreadCount?: number;
}
export interface GroupUiMessage {
  id: string;
  body?: string;
  messageType?: string;
  attachmentUrl?: string;
  attachmentDurationSeconds?: number;
  authorName?: string;
  createdAt: string | number;
  read?: boolean;
  mine?: boolean;
}
export interface GroupUiMember {
  id?: string;
  personId?: string;
  name: string;
  role?: string;
  mine?: boolean;
  availabilityNote?: string;
  displayName?: string;
  accountLinked?: boolean;
  caughtUp?: boolean;
}
export interface GroupUiEvent {
  id: string;
  title: string;
  starts_at: string | number;
  location?: string;
  description?: string;
  attendance_count?: number;
}
export interface GroupUiResource {
  id: string;
  title: string;
  resource_type?: string;
  notes?: string;
  url?: string;
}
export interface GroupUiCommerceItem {
  id: string;
  variantId: string;
  name: string;
  offeringKind?: string;
  eventDate?: string;
  eventStartTime?: string;
  eventEndTime?: string;
  eventLocation?: string;
  description?: string;
  priceCents?: number;
  trackInventory?: boolean;
  stockQuantity?: number;
  maxQuantityPerOrder?: number | null;
  status?: string;
  showOnCalendar?: boolean;
}
export interface GroupUiSheet {
  id: string;
  title: string;
  name?: string;
  status?: string;
  category?: string;
  description?: string;
  slotCount?: number;
  openingCount?: number;
  ministryId?: string;
}
export interface GroupUiSlot {
  id: string;
  label: string;
  slotDate?: number | null;
  filledCount: number;
  neededCount: number;
  notes?: string;
  entries?: {
    id: string;
    personName?: string;
    comment?: string;
    completed?: boolean;
    attended?: boolean;
    thanked?: boolean;
  }[];
}
export interface GroupUiSignup {
  sheet: GroupUiSheet;
  slots?: GroupUiSlot[];
}
export interface GroupUiPayload extends MinistryHomeData {
  error?: string;
  groups?: GroupUiGroup[];
  group?: Partial<GroupUiGroup>;
  messages?: GroupUiMessage[];
  members?: GroupUiMember[];
  events?: GroupUiEvent[];
  items?: GroupUiCommerceItem[];
  resources?: GroupUiResource[];
  parishId?: string;
  headcount?: number;
  weekOf?: string;
  sheets?: GroupUiSheet[];
  templates?: GroupUiSheet[];
  sheet?: GroupUiSheet;
  slots?: GroupUiSlot[];
  sheetId?: string;
  variantId?: string;
  activity?: { created_at: string | number; actor_name?: string; action?: string; summary?: string }[];
  latestMessage?: { id: string; createdAt?: string | number; body?: string; created_at?: MinistryHomeDate } | null;
  caughtUpCount?: number;
  memberCount?: number;
}
export interface GroupUiAttachment {
  type: 'voice' | 'image';
  blob: Blob;
  previewUrl: string;
  durationSeconds: number | null;
  fileName?: string;
}
export interface GroupUiState {
  groups: GroupUiGroup[];
  activeGroupId: string;
  messages: GroupUiMessage[];
  catchUp: Record<string, GroupUiPayload>;
  pendingAttachment: GroupUiAttachment | null;
  activeTab: string;
  signupSheets: GroupUiSheet[];
  signupTemplates: GroupUiSheet[];
  activeSignup: GroupUiSignup | null;
  commerceParishId?: string;
  commerceItems?: GroupUiCommerceItem[];
}
export interface GroupUiCommerceForm extends HTMLFormElement {
  elements: HTMLFormControlsCollection &
    Record<
      | 'name'
      | 'offeringKind'
      | 'priceCents'
      | 'eventDate'
      | 'eventStartTime'
      | 'eventEndTime'
      | 'eventLocation'
      | 'stockQuantity'
      | 'maxQuantityPerOrder'
      | 'description'
      | 'status'
      | 'showOnCalendar',
      HTMLInputElement
    >;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
