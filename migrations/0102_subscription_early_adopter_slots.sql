CREATE TABLE IF NOT EXISTS subscription_early_adopter_slots (
  slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 20),
  registration_reference TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'active', 'retired')),
  reserved_at TEXT,
  activated_at TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO subscription_early_adopter_slots (slot, status, updated_at) VALUES
  (1, 'available', CURRENT_TIMESTAMP), (2, 'available', CURRENT_TIMESTAMP),
  (3, 'available', CURRENT_TIMESTAMP), (4, 'available', CURRENT_TIMESTAMP),
  (5, 'available', CURRENT_TIMESTAMP), (6, 'available', CURRENT_TIMESTAMP),
  (7, 'available', CURRENT_TIMESTAMP), (8, 'available', CURRENT_TIMESTAMP),
  (9, 'available', CURRENT_TIMESTAMP), (10, 'available', CURRENT_TIMESTAMP),
  (11, 'available', CURRENT_TIMESTAMP), (12, 'available', CURRENT_TIMESTAMP),
  (13, 'available', CURRENT_TIMESTAMP), (14, 'available', CURRENT_TIMESTAMP),
  (15, 'available', CURRENT_TIMESTAMP), (16, 'available', CURRENT_TIMESTAMP),
  (17, 'available', CURRENT_TIMESTAMP), (18, 'available', CURRENT_TIMESTAMP),
  (19, 'available', CURRENT_TIMESTAMP), (20, 'available', CURRENT_TIMESTAMP);
