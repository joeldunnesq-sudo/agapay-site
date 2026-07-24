-- Idempotent St. Fiacre directory preview seed.
-- Names are the distinct non-anonymous demo givers already displayed in the
-- St. Fiacre dashboard. No email, gift, amount, or payment data is copied.

-- Keep this CTE identical for every insert. D1 bulk execution intentionally
-- disallows the temporary-table shortcut.
WITH seed(donor_name, family_name, seed_key) AS (VALUES
  ('Aine McDermott','McDermott','mcdermott'), ('Brendan Murphy','Murphy','murphy'),
  ('Colleen Ryan','Ryan','ryan'), ('Cormac Hayes','Hayes','hayes'),
  ('Declan Brennan','Brennan','brennan'), ('Fiona Walsh','Walsh','walsh'),
  ('James McAllister','McAllister','mcallister'), ('Liam Boyle','Boyle','boyle'),
  ('Maeve Quinn','Quinn','quinn'), ('Mary O''Connell','O''Connell','oconnell'),
  ('Nora Gallagher','Gallagher','gallagher'), ('Patrick Fitzgerald','Fitzgerald','fitzgerald'),
  ('Roisin Lynch','Lynch','lynch'), ('Sean Doherty','Doherty','doherty'),
  ('Siobhan Kelly','Kelly','kelly'), ('Thomas Burke','Burke','burke')
)
INSERT OR IGNORE INTO directory_people
  (id, created_by_parish_id, preferred_name, biological_sex, deceased, active, notes, created_at, updated_at)
SELECT 'dir_demo_person_'||seed_key, 'st-fiacre', donor_name, 'unknown', 0, 1,
  'St. Fiacre giver-directory preview seed', 1784919000000, 1784919000000 FROM seed;

WITH seed(donor_name, family_name, seed_key) AS (VALUES
  ('Aine McDermott','McDermott','mcdermott'), ('Brendan Murphy','Murphy','murphy'), ('Colleen Ryan','Ryan','ryan'), ('Cormac Hayes','Hayes','hayes'),
  ('Declan Brennan','Brennan','brennan'), ('Fiona Walsh','Walsh','walsh'), ('James McAllister','McAllister','mcallister'), ('Liam Boyle','Boyle','boyle'),
  ('Maeve Quinn','Quinn','quinn'), ('Mary O''Connell','O''Connell','oconnell'), ('Nora Gallagher','Gallagher','gallagher'), ('Patrick Fitzgerald','Fitzgerald','fitzgerald'),
  ('Roisin Lynch','Lynch','lynch'), ('Sean Doherty','Doherty','doherty'), ('Siobhan Kelly','Kelly','kelly'), ('Thomas Burke','Burke','burke')
)
INSERT OR IGNORE INTO directory_households (id, parish_id, display_name, active, created_at, updated_at)
SELECT 'dir_demo_family_'||seed_key, 'st-fiacre', 'The '||family_name||' Family', 1, 1784919000000, 1784919000000 FROM seed;

WITH seed(donor_name, family_name, seed_key) AS (VALUES
  ('Aine McDermott','McDermott','mcdermott'), ('Brendan Murphy','Murphy','murphy'), ('Colleen Ryan','Ryan','ryan'), ('Cormac Hayes','Hayes','hayes'),
  ('Declan Brennan','Brennan','brennan'), ('Fiona Walsh','Walsh','walsh'), ('James McAllister','McAllister','mcallister'), ('Liam Boyle','Boyle','boyle'),
  ('Maeve Quinn','Quinn','quinn'), ('Mary O''Connell','O''Connell','oconnell'), ('Nora Gallagher','Gallagher','gallagher'), ('Patrick Fitzgerald','Fitzgerald','fitzgerald'),
  ('Roisin Lynch','Lynch','lynch'), ('Sean Doherty','Doherty','doherty'), ('Siobhan Kelly','Kelly','kelly'), ('Thomas Burke','Burke','burke')
)
INSERT OR IGNORE INTO directory_household_members (id, household_id, person_id, relationship, active, created_at, updated_at)
SELECT 'dir_demo_member_'||seed_key, 'dir_demo_family_'||seed_key, 'dir_demo_person_'||seed_key, 'head', 1, 1784919000000, 1784919000000 FROM seed;

WITH seed(donor_name, family_name, seed_key) AS (VALUES
  ('Aine McDermott','McDermott','mcdermott'), ('Brendan Murphy','Murphy','murphy'), ('Colleen Ryan','Ryan','ryan'), ('Cormac Hayes','Hayes','hayes'),
  ('Declan Brennan','Brennan','brennan'), ('Fiona Walsh','Walsh','walsh'), ('James McAllister','McAllister','mcallister'), ('Liam Boyle','Boyle','boyle'),
  ('Maeve Quinn','Quinn','quinn'), ('Mary O''Connell','O''Connell','oconnell'), ('Nora Gallagher','Gallagher','gallagher'), ('Patrick Fitzgerald','Fitzgerald','fitzgerald'),
  ('Roisin Lynch','Lynch','lynch'), ('Sean Doherty','Doherty','doherty'), ('Siobhan Kelly','Kelly','kelly'), ('Thomas Burke','Burke','burke')
)
INSERT OR IGNORE INTO directory_parish_affiliations (id, person_id, parish_id, status, active, created_at, updated_at)
SELECT 'dir_demo_affiliation_'||seed_key, 'dir_demo_person_'||seed_key, 'st-fiacre', 'member', 1, 1784919000000, 1784919000000 FROM seed;

WITH seed(donor_name, family_name, seed_key) AS (VALUES
  ('Aine McDermott','McDermott','mcdermott'), ('Brendan Murphy','Murphy','murphy'), ('Colleen Ryan','Ryan','ryan'), ('Cormac Hayes','Hayes','hayes'),
  ('Declan Brennan','Brennan','brennan'), ('Fiona Walsh','Walsh','walsh'), ('James McAllister','McAllister','mcallister'), ('Liam Boyle','Boyle','boyle'),
  ('Maeve Quinn','Quinn','quinn'), ('Mary O''Connell','O''Connell','oconnell'), ('Nora Gallagher','Gallagher','gallagher'), ('Patrick Fitzgerald','Fitzgerald','fitzgerald'),
  ('Roisin Lynch','Lynch','lynch'), ('Sean Doherty','Doherty','doherty'), ('Siobhan Kelly','Kelly','kelly'), ('Thomas Burke','Burke','burke')
)
INSERT OR IGNORE INTO directory_person_privacy_flags
  (id, parish_id, person_id, is_child, protected_person, active, created_at, updated_at)
SELECT 'dir_demo_privacy_'||seed_key, 'st-fiacre', 'dir_demo_person_'||seed_key, 0, 0, 1, 1784919000000, 1784919000000 FROM seed;

WITH seed(donor_name, family_name, seed_key) AS (VALUES
  ('Aine McDermott','McDermott','mcdermott'), ('Brendan Murphy','Murphy','murphy'), ('Colleen Ryan','Ryan','ryan'), ('Cormac Hayes','Hayes','hayes'),
  ('Declan Brennan','Brennan','brennan'), ('Fiona Walsh','Walsh','walsh'), ('James McAllister','McAllister','mcallister'), ('Liam Boyle','Boyle','boyle'),
  ('Maeve Quinn','Quinn','quinn'), ('Mary O''Connell','O''Connell','oconnell'), ('Nora Gallagher','Gallagher','gallagher'), ('Patrick Fitzgerald','Fitzgerald','fitzgerald'),
  ('Roisin Lynch','Lynch','lynch'), ('Sean Doherty','Doherty','doherty'), ('Siobhan Kelly','Kelly','kelly'), ('Thomas Burke','Burke','burke')
)
INSERT OR IGNORE INTO directory_publication_profiles
  (id, parish_id, owner_type, owner_id, status, approval_status, approved_by_user_id, approved_at, active, created_at, updated_at)
SELECT 'dir_demo_person_pub_'||seed_key, 'st-fiacre', 'person', 'dir_demo_person_'||seed_key,
  'approved', 'approved', 'st-fiacre-directory-seed', 1784919000000, 1, 1784919000000, 1784919000000 FROM seed;

WITH seed(donor_name, family_name, seed_key) AS (VALUES
  ('Aine McDermott','McDermott','mcdermott'), ('Brendan Murphy','Murphy','murphy'), ('Colleen Ryan','Ryan','ryan'), ('Cormac Hayes','Hayes','hayes'),
  ('Declan Brennan','Brennan','brennan'), ('Fiona Walsh','Walsh','walsh'), ('James McAllister','McAllister','mcallister'), ('Liam Boyle','Boyle','boyle'),
  ('Maeve Quinn','Quinn','quinn'), ('Mary O''Connell','O''Connell','oconnell'), ('Nora Gallagher','Gallagher','gallagher'), ('Patrick Fitzgerald','Fitzgerald','fitzgerald'),
  ('Roisin Lynch','Lynch','lynch'), ('Sean Doherty','Doherty','doherty'), ('Siobhan Kelly','Kelly','kelly'), ('Thomas Burke','Burke','burke')
)
INSERT OR IGNORE INTO directory_publication_profiles
  (id, parish_id, owner_type, owner_id, status, approval_status, approved_by_user_id, approved_at, active, created_at, updated_at)
SELECT 'dir_demo_family_pub_'||seed_key, 'st-fiacre', 'household', 'dir_demo_family_'||seed_key,
  'approved', 'approved', 'st-fiacre-directory-seed', 1784919000000, 1, 1784919000000, 1784919000000 FROM seed;

WITH seed(donor_name, family_name, seed_key) AS (VALUES
  ('Aine McDermott','McDermott','mcdermott'), ('Brendan Murphy','Murphy','murphy'), ('Colleen Ryan','Ryan','ryan'), ('Cormac Hayes','Hayes','hayes'),
  ('Declan Brennan','Brennan','brennan'), ('Fiona Walsh','Walsh','walsh'), ('James McAllister','McAllister','mcallister'), ('Liam Boyle','Boyle','boyle'),
  ('Maeve Quinn','Quinn','quinn'), ('Mary O''Connell','O''Connell','oconnell'), ('Nora Gallagher','Gallagher','gallagher'), ('Patrick Fitzgerald','Fitzgerald','fitzgerald'),
  ('Roisin Lynch','Lynch','lynch'), ('Sean Doherty','Doherty','doherty'), ('Siobhan Kelly','Kelly','kelly'), ('Thomas Burke','Burke','burke')
)
INSERT OR IGNORE INTO directory_addresses
  (id, parish_id, owner_type, owner_id, address_type, line1, city, region, country, normalized_value,
   is_primary, protected_address, visibility, active, created_at, updated_at)
SELECT 'dir_demo_address_'||seed_key, 'st-fiacre', 'household', 'dir_demo_family_'||seed_key,
  'residential', 'Directory preview', 'Munster', 'IN', 'US', 'directory-preview|'||seed_key,
  1, 0, 'directory_members', 1, 1784919000000, 1784919000000 FROM seed;

WITH namedays(donor_name, seed_key, saint_name, feast_month_day) AS (VALUES
  ('Brendan Murphy','murphy','St. Brendan the Navigator','05-16'),
  ('James McAllister','mcallister','St. James the Brother of the Lord','10-23'),
  ('Mary O''Connell','oconnell','Dormition of the Theotokos','08-15'),
  ('Patrick Fitzgerald','fitzgerald','St. Patrick of Ireland','03-17'),
  ('Thomas Burke','burke','Holy Apostle Thomas','10-06')
)
INSERT OR IGNORE INTO directory_household_namedays
  (id, parish_id, household_id, person_id, display_name, saint_name, feast_month_day,
   visibility, active, created_by_user_id, created_at, updated_at)
SELECT 'dir_demo_nameday_'||seed_key, 'st-fiacre', 'dir_demo_family_'||seed_key,
  'dir_demo_person_'||seed_key, donor_name, saint_name, feast_month_day,
  'directory_members', 1, 'st-fiacre-directory-seed', 1784919000000, 1784919000000 FROM namedays;
