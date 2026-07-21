CREATE TABLE IF NOT EXISTS accounting_check_settings(
  bank_account_id TEXT PRIMARY KEY,
  next_check_number INTEGER NOT NULL DEFAULT 1001,
  check_style TEXT NOT NULL DEFAULT 'top_check_two_stubs',
  payer_name TEXT NOT NULL DEFAULT '',
  payer_address TEXT NOT NULL DEFAULT '',
  signature_line_1 TEXT NOT NULL DEFAULT '',
  signature_line_2 TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  CHECK(next_check_number>0),
  FOREIGN KEY(bank_account_id) REFERENCES accounting_bank_accounts(id)
);
CREATE TABLE IF NOT EXISTS accounting_check_print_events(
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  print_sequence INTEGER NOT NULL,
  print_type TEXT NOT NULL DEFAULT 'original',
  printed_by_actor_id TEXT NOT NULL,
  printed_at TEXT NOT NULL DEFAULT(datetime('now')),
  reason TEXT,
  UNIQUE(payment_id,print_sequence),
  FOREIGN KEY(payment_id) REFERENCES accounting_payments(id),
  CHECK(print_type IN('original','reprint'))
);
CREATE INDEX IF NOT EXISTS idx_check_print_events_payment ON accounting_check_print_events(payment_id,printed_at);
