-- Allow each annual parish meeting packet to control the amount of printable
-- writing space on its sign-in and minutes pages.
ALTER TABLE stewardship_annual_meetings
  ADD COLUMN signature_line_count INTEGER NOT NULL DEFAULT 24;

ALTER TABLE stewardship_annual_meetings
  ADD COLUMN note_line_count INTEGER NOT NULL DEFAULT 12;
