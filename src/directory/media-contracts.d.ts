import type { DirectoryActorInput, DirectorySelfContext, DirectoryStatement } from './contracts.js';

import type { MediaCrop } from './media-transform.js';

export type MediaContext = DirectoryActorInput &
  Partial<Omit<DirectorySelfContext, 'user' | 'currentPerson'>> & {
    currentPerson?: { id: string; createdByParishId?: string } | null;
  };

export interface MediaSqlRow {
  created_by_user_id: string;
  status: string;
  expires_at: number;
  owner_type: string;
  owner_id: string;
  requested_visibility: string;
  width: number;
  height: number;
  type: string;
  key: string;
  transformed: string;
  id: string;
  parish_id: string;
  media_purpose: string;
  lifecycle_status: string;
  processing_status: string;
  visibility: string;
  publication_eligible: number;
  detected_mime_type: string;
  original_byte_size: number;
  original_width: number;
  original_height: number;
  reupload_required: number;
  pipeline_version: string;
  variant_type: string;
  ready: number;
  secure_transform_status: string;
  transformer_version: string;
  created_at: number;
  updated_at: number;
  r2_object_key: string;
  mime_type: string;
  transformer_name: string;
  output_content_hash: string;
  metadata_stripped: number;
  source_retained: string;
  original_object_key: string;
  content_hash: string;
}
export type { DirectoryActorInput, DirectorySelfContext, DirectoryStatement, MediaCrop };

export interface MediaCropInput {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
}
