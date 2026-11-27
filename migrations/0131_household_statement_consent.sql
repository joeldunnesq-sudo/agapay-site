ALTER TABLE directory_household_invitations
  ADD COLUMN combine_giving INTEGER NOT NULL DEFAULT 0 CHECK (combine_giving IN (0, 1));
