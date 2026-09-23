-- Synthetic conversation for the St. Fiacre Brotherhood demo only.
-- Apply with: npx wrangler d1 execute agapay-production --remote --file scripts/brotherhood-st-fiacre-message-seed.sql
-- Stable IDs make reruns safe. Existing messages and read states are preserved.
-- Authors must still be active participants in this exact demo ministry.
WITH seed(id, author_person_id, body, created_at) AS (VALUES
  ('demo_st_fiacre_brotherhood_20260923_01', 'dir_person_30427e6354faef3329aa4982858c29e562b45530ee7c6ef4',
   '[Demo] Welcome to the Brotherhood group! We can use this space to coordinate service projects, share reminders, and stay connected between gatherings.', '2026-09-23 14:00:00'),
  ('demo_st_fiacre_brotherhood_20260923_02', 'dir_person_30427e6354faef3329aa4982858c29e562b45530ee7c6ef4',
   '[Demo] Our next parish workday is Saturday at 9:00 a.m. Meet in the fellowship hall for coffee before we organize the pantry shelves and tidy the church grounds. Who can help?', '2026-09-23 14:05:00'),
  ('demo_st_fiacre_brotherhood_20260923_03', 'dir_person_household_stephanie_dunncrew_20260801',
   '[Demo] I can help with the pantry! I will bring labels and markers. Are there particular supplies we should collect?', '2026-09-23 14:12:00'),
  ('demo_st_fiacre_brotherhood_20260923_04', 'dir_person_30427e6354faef3329aa4982858c29e562b45530ee7c6ef4',
   '[Demo] Thank you! Canned vegetables, pasta, and unopened toiletries would be helpful. Please leave donations at the fellowship hall collection table.', '2026-09-23 14:20:00'),
  ('demo_st_fiacre_brotherhood_20260923_05', 'dir_person_household_stephanie_dunncrew_20260801',
   '[Demo] I will also bring coffee and cups for the volunteers. New members are welcome to join us, even if they can only stay for an hour.', '2026-09-23 14:28:00'),
  ('demo_st_fiacre_brotherhood_20260923_06', 'dir_person_30427e6354faef3329aa4982858c29e562b45530ee7c6ef4',
   '[Demo] Wonderful. After Sunday Liturgy, let us take a few minutes over coffee to plan our next service project. Please share your ideas here beforehand.', '2026-09-23 14:35:00')
)
INSERT INTO parish_group_messages
  (id, parish_id, ministry_id, author_person_id, body, message_type, created_at)
SELECT seed.id, ministry.parish_id, ministry.id, seed.author_person_id,
  seed.body, 'text', seed.created_at
FROM seed
JOIN directory_ministries ministry
  ON ministry.id = 'dir_ministry_8294187ada1a03557d3d745504de43935b7590030fbb5b2f'
  AND ministry.parish_id = 'st-fiacre'
  AND ministry.display_name = 'Brotherhood'
  AND ministry.status = 'active'
JOIN directory_people person ON person.id = seed.author_person_id AND person.active = 1
WHERE EXISTS (
  SELECT 1 FROM directory_ministry_participants participant
  WHERE participant.ministry_id = ministry.id
    AND participant.parish_id = ministry.parish_id
    AND participant.person_id = seed.author_person_id
    AND participant.status = 'active'
)
ON CONFLICT(id) DO NOTHING;
