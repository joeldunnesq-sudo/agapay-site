import type { SignupContext } from './signup-contracts.js';
export type GroupEnvironment = Partial<Env> & { DB?: D1Database };
export type GroupContext = Pick<SignupContext, 'parishId' | 'personId'>;
export interface GroupRow {
  headcount_delegate_ministry_id: string;
  sheet_id: string;
  id: string;
  parish_id: string;
  ministry_id: string;
  author_person_id: string;
  author_name: string;
  ministry_name: string;
  body: string;
  message_type: string;
  attachment_url: string;
  attachment_duration_seconds: number;
  created_at: number;
  display_name: string;
  slug: string;
  category: string;
  short_description: string;
  image_storage_key: string;
  image_updated_at: string;
  is_leader: number;
  authorPersonId: string;
  donor_id: string;
  person_id: string;
  preferred_name: string;
  role: string;
  availability_note: string;
  ministryName: string;
  authorName: string;
}
export interface GroupRequest {
  title?: unknown;
  startsAt?: unknown;
  repeatCount?: unknown;
  description?: unknown;
  location?: unknown;
  endsAt?: unknown;
  personId?: unknown;
  status?: string;
  resourceType?: string;
  url?: unknown;
  notes?: unknown;
  body?: unknown;
  availabilityNote?: unknown;
  weekOf?: unknown;
  headcount?: unknown;
}
export interface GroupMemberKey {
  parishId: string;
  ministryId: string;
  personId: string;
  donorId: string;
  messageId: string;
}
export interface GroupMessageInput {
  parishId: string;
  ministryId: string;
  personId: string;
  body: unknown;
  messageType?: string;
  attachmentUrl?: string | null;
  attachmentDurationSeconds?: number | null;
  messageId?: string;
}
export interface GroupAttachmentInput {
  parishId: string;
  key: string;
  source: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number;
  maxBytes?: number;
}
