import { readFileSync } from 'node:fs';

// Directory domain fixtures still need a real eligible parish registration.
// This supplies catalog entitlement only, never session or capability bypasses.
export function seedDirectoryEntitlement(db, parishId = 'st-fiacre') {
  db.exec(readFileSync(new URL('../../migrations/0001_production_records.sql', import.meta.url), 'utf8'));
  db.prepare(`INSERT INTO registrations(reference, parish_id, data, updated_at)
    VALUES(?, ?, ?, datetime('now')) ON CONFLICT(reference) DO NOTHING`).run(
    `reg_${parishId}`, parishId,
    JSON.stringify({ parishId, subscriptionTier: 'giving', subscriptionStatus: 'active' })
  );
}
