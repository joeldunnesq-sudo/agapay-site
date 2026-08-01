-- Category taxonomies for the Koinonia announcement and audio filters.
-- Teaching remains the product/table name; its category vocabulary is broad
-- enough to include pastoral recordings such as choir and special events.

ALTER TABLE parish_announcements ADD COLUMN category TEXT NOT NULL DEFAULT 'general'
  CHECK (category IN ('services', 'events', 'youth', 'outreach', 'education', 'general'));

ALTER TABLE parish_teaching_posts ADD COLUMN category TEXT NOT NULL DEFAULT 'homilies'
  CHECK (category IN ('homilies', 'catechism', 'liturgical', 'choir', 'special_events'));
