interface SacSlotSelection {
  label?: string;
  date: string;
  time: string;
  priestName?: string;
  priestEmail?: string;
}
interface SacSlot extends SacSlotSelection {
  label: string;
}
interface SacCard {
  id: string;
  type?: string;
  schedulingType?: string;
  section: string;
  mode: string;
  title: string;
  description: string;
  icon: string;
  locationType?: string;
  otherTypeLabel?: string;
  href?: string;
}
interface SacPreparationDocument {
  id: string;
  displayName: string;
  reviewStatus: string;
  uploadedByType: string;
}
interface SacPreparationItem {
  id: string;
  status: string;
  itemType: string;
  title: string;
  required?: boolean;
  description?: string;
  reviewerNote?: string;
  documents?: SacPreparationDocument[];
}
interface SacPreparation {
  title?: string;
  introduction?: string;
  canonicalNote?: string;
  requirementsNotice?: string;
  guides?: { id: string; displayName: string }[];
  items?: SacPreparationItem[];
  progress?: { completed: number; total: number; percent: number; complete: boolean };
}
interface SacRequest {
  id: string;
  status: string;
  sacramentType: string;
  otherTypeLabel?: string;
  confirmedDate?: string;
  confirmedTime?: string;
  requestedDate?: string;
  requestedTimeWindow?: string;
  createdAt?: string;
  clergyAssigned?: string;
  locationType?: string;
  locationAddress?: string;
  declineReason?: string;
  preparation?: SacPreparation;
}
interface SacOfferings {
  types: string[];
  custom: { id: string; label: string; mode: string }[];
}
interface SacPayload extends Omit<DonorPagePayload, 'offerings'> {
  slots?: SacSlot[];
  requests?: SacRequest[];
  available?: boolean;
  offerings?: SacOfferings;
  parishId?: string;
  message?: string;
}
interface SacState {
  openId: string;
  requests: SacRequest[];
  available: boolean;
  slotsByType: Record<string, SacSlot[] | null>;
  loadingSlots: Record<string, boolean>;
  selectedSlots: Record<string, SacSlotSelection | null>;
  offerings: SacOfferings;
  dashboard: import('./app-contracts.js').DonorAppPayload | null;
  commemorations: import('./app-contracts.js').DonorAppPayload | null;
}
type SacRequestError = Error & { data?: { slotTaken?: boolean } };
declare function donorDefaultParish(): AppHeaderParish | null;
declare function renderCommemorationParish(parish: AppHeaderParish | null): void;
declare const renderCommemorationsPayload: import('./app-commemorations-and-checkout.js').DonorAppPart4['renderCommemorationsPayload'];

interface SacForm extends HTMLFormElement {
  elements: HTMLFormControlsCollection & Record<string, HTMLInputElement>;
}
interface SacRequestBody extends Record<string, unknown> {
  parishId: string;
  sacramentType: string;
}
