interface DonorSaintStory {
  primary?: boolean;
  name?: string;
  title?: string;
  storyText?: string;
  iconUrl?: string;
  reposeCentury?: string;
  feastRank?: string;
}
interface DonorLiturgicalDay {
  feastRank?: string;
  civilDate?: string;
  calendarType?: string;
  calendarDate?: string;
  saintStories?: DonorSaintStory[];
  saints?: string[];
  primarySaintTitle?: string;
  readingAppointments?: { type: string; ref: string; appointment?: string }[];
  epistleRef?: string;
  gospelRef?: string;
  feastTitle?: string;
  fastingRule?: string;
  nameDays?: { displayName: string; saintName: string }[];
  sourceConnected?: boolean;
  tone?: string;
  saintQuote?: string;
  saintQuoteAttribution?: string;
}
interface DonorSacramentRequest {
  status: string;
  confirmedDate: string;
  requestedDate: string;
  confirmedTime?: string;
  requestedTimeWindow?: string;
  otherTypeLabel?: string;
  sacramentType: string;
  clergyAssigned?: string;
}
interface DonorParishCalendarEvent {
  typeLabel?: string;
  hostName?: string;
  availabilityLabel?: string;
  href?: string;
  startsAt?: string;
  allDay?: boolean;
  commerceKind?: string;
  title?: string;
  url?: string;
  location?: string;
  description?: string;
  endsAt?: string;
}
interface DonorCalendarCelebration {
  date: string;
  type: string;
  years?: number;
  detail?: string;
  typeLabel?: string;
  label?: string;
}
interface DonorCalendarCelebrations {
  items?: DonorCalendarCelebration[];
}
interface DonorPagePayload {
  ok?: boolean;
  calendar?: string;
  date?: string;
  today?: DonorLiturgicalDay;
  feast?: ParishCalendarFeast | null;
  error?: string;
  requests?: DonorSacramentRequest[];
  subscriptionUrl?: string;
  events?: DonorParishCalendarEvent[];
  connected?: boolean;
  unavailable?: boolean;
  milestones?: DonorCalendarCelebrations;
}
interface AppHeaderParish {
  liturgicalCalendar?: string;
  patronalFeast?: string;
  parishPatronalFeast?: string;
  patronalFeastId?: string;
  parishPatronalFeastName?: string;
  patronalFeastName?: string;
  parishName?: string;
  parishPatronalFeastDate?: string;
  patronalFeastDate?: string;
  funds?: ParishGivingOption[];
}
interface AppHeaderDonorProfile {
  liturgicalCalendar?: string;
}
declare function calendarLabel(calendar?: string): string;
declare function nextFeastForCalendar(calendar?: string): ParishCalendarFeast | null;
declare function donorGiftUrl(
  type: string,
  parish: AppHeaderParish | null | undefined,
  options: Record<string, unknown>
): string;
declare function parishHasGivingPlus(parish: AppHeaderParish): boolean;
declare function activeParishCampaigns(parish: AppHeaderParish): ParishGivingOption[];
declare function campaignGoalCents(campaign: ParishGivingOption): number;
declare function campaignRaisedCents(campaign: ParishGivingOption): number;
declare function campaignLabel(campaign: ParishGivingOption): string;
declare const sacramentTypeLabels: Record<string, string>;

declare function setHtml(id: string, html: string): void;
