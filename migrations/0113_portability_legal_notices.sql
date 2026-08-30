-- Append the published notice version; do not alter historical acceptance evidence.
INSERT INTO legal_terms_versions (
  version, content_sha256, snapshot_path, effective_for_new_users_at,
  effective_for_existing_users_at, created_at
) VALUES (
  '2026-08-30',
  'e30d2a1996f56b11b75c5f9b6fc55e8048b750bc14b5fb8356d640033b76103d',
  'docs/legal/terms/terms-2026-08-30.html',
  '2026-08-30T00:00:00.000Z',
  '2026-09-29T00:00:00.000Z',
  '2026-08-30T00:00:00.000Z'
);
