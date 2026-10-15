export type LearnStoreEnvironment = Partial<Env> & import('../lib/email.js').EmailEnv;
export interface LearnSubmitter {
  email: string;
  householdId: string;
}
export interface LearnAdministrator {
  actor?: string;
}
export interface ResourceFlag {
  email: string;
  reason: string;
  createdAt: string;
}
export interface CommunityResource extends Record<string, unknown> {
  id: string;
  source?: string;
  title?: string;
  url?: string;
  description?: string;
  subtitle?: string;
  status?: string;
  vetted?: boolean;
  pinned?: boolean;
  sharedBy?: string;
  submittedBy?: string;
  householdId?: string;
  flags?: ResourceFlag[];
  createdAt?: string;
  updatedAt?: string;
  curatedBy?: string;
}
export interface FeedbackNotification {
  status: string;
  detail?: unknown;
  error?: string;
  body?: string;
  httpStatus?: number | string;
  sentAt?: string;
}
export interface LearnFeedback extends Record<string, unknown> {
  id: string;
  status: string;
  subject?: string;
  submittedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  seenAt?: string;
  consideredAt?: string;
  consideredBy?: string;
  userNotification?: FeedbackNotification | null;
}
