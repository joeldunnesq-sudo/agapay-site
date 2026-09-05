import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { memoryRateLimiter } from './memory-rate-limiter.mjs';

export function contactTestStore() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
  db.exec(readFileSync('migrations/0124_contact_notification_recovery.sql', 'utf8'));
  const env = { AGAPAY_RATE_LIMITER: memoryRateLimiter(), RESEND_API_KEY: 'local-test', AGAPAY_DB: {
    prepare(sql) {
      return { bind(...values) { return {
        async run() { return db.prepare(sql).run(...values); },
        async first() { return db.prepare(sql).get(...values) || null; },
        async all() { return { results: db.prepare(sql).all(...values) }; },
      }; } };
    },
  } };
  return { db, env };
}
