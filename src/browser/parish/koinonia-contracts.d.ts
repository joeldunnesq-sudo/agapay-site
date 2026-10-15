// Koinonia views consume these response fields; assertions preserve existing JSON trust boundaries.
type KoinoniaSubfeatureField = 'signupsEnabled' | 'exchangeEnabled' | 'prayerRequestsEnabled';
interface ParishWorkspaceIdentity {
  parishLifeAvailable?: boolean;
  communicationsEnabled?: boolean;
  signupsEnabled?: boolean;
  exchangeEnabled?: boolean;
  prayerRequestsEnabled?: boolean;
  koinoniaCalendarUrl?: string;
}
interface KoinoniaContent {
  id: string;
  title?: string;
  status: string;
  category?: string;
  pinned?: boolean;
  heroImageUrl?: string;
  body?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  readCount?: number;
}
interface KoinoniaReaders {
  readers?: { displayName?: string; donorId?: string; readAt: string }[];
}
interface KoinoniaBlog {
  enabled?: boolean;
  sourceUrl?: string;
  feedUrl?: string;
}
interface KoinoniaCommunicationsState {
  loaded: boolean;
  announcements: KoinoniaContent[];
  teaching: KoinoniaContent[];
  videos: KoinoniaContent[];
  youtube: KoinoniaContent[];
  youtubeChannel: KoinoniaYouTubeChannel | null;
  blog: KoinoniaBlog | null;
  readers: Record<string, KoinoniaReaders>;
}
interface KoinoniaMinistriesState {
  loaded: boolean;
  ministries: KoinoniaMinistryDetail[];
  selectedId: string;
  editingId: string;
  people: unknown[];
}
interface ParishPrayerRequest {
  id: string;
  status: string;
  visibility: string;
  reportCount?: number;
  actualRequesterName?: string;
  requesterName?: string;
  anonymous?: boolean;
  body?: string;
  createdAt?: number;
  prayerCount?: number;
  revision?: number;
  expectedRevision?: number;
  moderationNote?: string;
  declineReason?: string;
}
interface ParishPrayerSettings {
  approvalRequired?: boolean;
  allowAnonymous?: boolean;
  autoArchiveDays?: number;
  pastoralNotice?: string;
}
interface ParishPrayerAdminState {
  loaded: boolean;
  requests: ParishPrayerRequest[];
  settings: ParishPrayerSettings | null;
  metrics: Record<string, number>;
  filter: string;
  selectedId: string;
}
interface KoinoniaResponse extends KoinoniaReaders {
  error?: string;
  detail?: string;
  parish?: Partial<ParishWorkspaceIdentity>;
  announcements?: KoinoniaContent[];
  posts?: KoinoniaContent[];
  videos?: KoinoniaContent[];
  youtube?: KoinoniaContent[];
  youtubeChannel?: KoinoniaYouTubeChannel;
  blog?: KoinoniaBlog;
  announcement: KoinoniaContent;
  requests?: ParishPrayerRequest[];
  settings?: ParishPrayerSettings;
  metrics?: Record<string, number>;
}
declare function loadBulletins(force?: boolean): Promise<unknown>;

interface KoinoniaYouTubeChannel {
  channelUrl?: string;
  channelTitle?: string;
}
interface KoinoniaContent {
  audioUrl?: string;
  audioSource?: string;
  description?: string;
  readyToStream?: boolean;
  durationSeconds?: number;
  streamState?: string;
  watchCount?: number;
  thumbnailUrl?: string;
}
interface KoinoniaMinistry {
  id: string;
  displayName?: string;
  hasImage?: boolean;
  category?: string;
  status?: string;
  shortDescription?: string;
  detailedDescription?: string;
  version?: number;
  requestPolicy?: string;
  visibility?: string;
  displayOrder?: number;
}
interface KoinoniaMinistryParticipant {
  id: string;
  personId?: string;
  displayName?: string;
  approvedPublication?: boolean;
  publicationPreference?: string;
  participationType?: string;
}
interface KoinoniaMinistryDetail extends Partial<KoinoniaMinistry> {
  ministry: KoinoniaMinistry;
  participants?: KoinoniaMinistryParticipant[];
  requests?: { id: string; status: string; displayName?: string; interestType?: string; memberNote?: string }[];
}
interface KoinoniaResponse {
  message?: string;
  post: KoinoniaContent;
  video: KoinoniaContent;
  uploadUrl: string;
  ministries?: KoinoniaMinistry[];
  ministry: KoinoniaMinistryDetail;
  people?: { personId?: string; candidateId?: string; displayName?: string; email?: string }[];
}
declare function directoryAdminApi(path: string): string;
declare let activeParishFeatureRequest: Record<string, unknown> | null;
declare function dismissParishFeatureRequest(acknowledge: boolean): Promise<unknown>;

declare namespace renderVideoAdminList {
  let pollTimer: number | undefined;
}
