CREATE TABLE directory_household_giving_consent (
  household_id TEXT NOT NULL REFERENCES directory_households(id) ON DELETE CASCADE,
  parish_id TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  spouse_user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  consenting_user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  CHECK (recipient_user_id <> spouse_user_id),
  CHECK (consenting_user_id IN (recipient_user_id, spouse_user_id)),
  PRIMARY KEY (household_id, recipient_user_id, spouse_user_id, consenting_user_id)
);
