-- Allow a priest's blackout to cover one day or an inclusive date range.
ALTER TABLE parish_availability_blackouts ADD COLUMN end_date TEXT;

UPDATE parish_availability_blackouts
SET end_date = date
WHERE end_date IS NULL OR end_date = '';

CREATE INDEX IF NOT EXISTS idx_parish_availability_blackouts_parish_range
  ON parish_availability_blackouts(parish_id, date, end_date);

-- Each priest owns a separate calendar, so two priests may accept the same
-- wall-clock slot without being treated as a double booking.
DROP INDEX IF EXISTS uq_sacrament_requests_scheduled_slot;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sacrament_requests_scheduled_priest_slot
  ON sacrament_requests(parish_id, confirmed_date, confirmed_time, COALESCE(clergy_assigned, ''))
  WHERE status = 'scheduled';
-- Original filename retained because D1 identifies applied migrations by filename.
