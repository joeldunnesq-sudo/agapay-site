import type { DirectoryActorInput, DirectorySelfContext, DirectoryStatement } from './contracts.js';

export type MinistryContext = DirectoryActorInput & Partial<Omit<DirectorySelfContext, 'user'>>;

export interface MinistrySqlRow {
  survivor_entity_id: string;
  id: string;
  parish_id: string;
  canonical_name: string;
  display_name: string;
  slug: string;
  short_description: string;
  detailed_description: string;
  category: string;
  status: string;
  visibility: string;
  request_policy: string;
  participant_publication_policy: string;
  leader_publication_policy: string;
  child_participation_policy: string;
  display_order: number;
  image_storage_key: string;
  image_updated_at: number;
  updated_at: number;
  revision: number;
  ministry_id: string;
  person_id: string;
  preferred_name: string;
  assignment_type: string;
  publication_state: string;
  participation_type: string;
  publication_preference: string;
  approved_publication: number;
  source: string;
  requester_user_id: string;
  requester_person_id: string;
  interest_type: string;
  member_note: string;
  reviewer_note: string;
  created_at: number;
  protected_person: string;
  is_child: number;
  email: string;
  data: string;
  active: number;
  source_id: string;
  leadership_type: string;
}
export type { DirectoryActorInput, DirectorySelfContext, DirectoryStatement };
