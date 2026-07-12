-- Migration: 0019_sacrament_priests
--
-- Adds optional priest ownership to Sacraments & Services availability.
-- Existing parish-wide rows remain valid with NULL priest_name.

ALTER TABLE parish_availability_rules ADD COLUMN priest_name TEXT;
ALTER TABLE parish_availability_rules ADD COLUMN priest_email TEXT;

ALTER TABLE parish_availability_blackouts ADD COLUMN priest_name TEXT;
ALTER TABLE parish_availability_blackouts ADD COLUMN priest_email TEXT;

DROP INDEX IF EXISTS uq_sacrament_requests_scheduled_slot;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sacrament_requests_scheduled_slot
  ON sacrament_requests(parish_id, confirmed_date, confirmed_time, COALESCE(clergy_assigned, ''))
  WHERE status = 'scheduled';
