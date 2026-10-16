export interface ParishSacCustomService {
  id: string;
  label: string;
  mode: string;
}
export interface ParishSacPriest {
  name: string;
  email: string;
  serviceTypes?: string[];
  customServices?: ParishSacCustomService[];
}
export interface ParishSacPreparationDocument {
  id: string;
  displayName: string;
  reviewStatus: string;
}
export interface ParishSacPreparationItem {
  id: string;
  status: string;
  title: string;
  description?: string;
  required?: boolean;
  parishionerNote?: string;
  reviewerNote?: string;
  documents?: ParishSacPreparationDocument[];
}
export interface ParishSacRequest {
  id: string;
  sacramentType: string;
  status: string;
  otherTypeLabel?: string;
  createdAt?: string;
  confirmedDate?: string;
  confirmedTime?: string;
  requestedDate?: string;
  requestedTimeWindow?: string;
  clergyAssigned?: string;
  participantNames?: string;
  donorEmail?: string;
  phone?: string;
  locationAddress?: string;
  notes?: string;
  declineReason?: string;
  parishNotes?: string;
  preparation?: {
    progress?: { completed: number; total: number; percent: number };
    requirementsNotice?: string;
    items: ParishSacPreparationItem[];
  };
}
export interface ParishSacRule {
  id: string;
  sacramentType: string;
  priestName?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes?: number;
  timezone?: string;
}
export interface ParishSacBlackout {
  id: string;
  priestName?: string;
  startDate?: string;
  endDate?: string;
  date?: string;
  reason?: string;
  startTime?: string;
  endTime?: string;
}
export interface ParishSacGoogleConnection {
  email?: string;
  connected?: boolean;
  lastSyncedAt?: string;
  calendarName?: string;
  lastError?: string;
}
export interface ParishSacPayload {
  ok?: boolean;
  error?: string;
  authUrl?: string;
  requests?: ParishSacRequest[];
  preparationTemplates?: ParishPreparationTemplate[];
  preparationDocumentsConfigured?: boolean;
  timezone?: string;
  rules?: ParishSacRule[];
  blackouts?: ParishSacBlackout[];
  configured?: boolean;
  connections?: ParishSacGoogleConnection[];
  parish?: ParishWorkspaceIdentity;
  calendarSync?: { status?: string; error?: string };
}
export interface ParishSacState {
  loaded: boolean;
  requests: ParishSacRequest[];
  preparationTemplates: ParishPreparationTemplate[];
  preparationDocumentsConfigured: boolean;
}
export interface ParishSacGoogleState {
  loaded: boolean;
  loading: boolean;
  configured: boolean;
  connections: ParishSacGoogleConnection[];
  error?: string;
}
export interface ParishSacAvailabilityState {
  loaded: boolean;
  loading: boolean;
  error: string;
  timezone: string;
  rules: ParishSacRule[];
  blackouts: ParishSacBlackout[];
}

declare global {
  interface ParishWorkspaceIdentity {
    sacramentPriests?: ParishSacPriest[];
    priestEmail?: string;
    sacramentsEnabled?: boolean;
  }
  function formatSacramentDateRange(startDate?: string, endDate?: string): string;
}
export type ParishSacCalendarItem = Partial<ParishSacRequest> & { sacramentType: string; blackout?: boolean };
