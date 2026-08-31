import { readFileSync } from 'node:fs';
import { createFundReconciliationFixture } from './fund-reconciliation-fixture.mjs';
import { handleParishOutsideGifts } from '../../src/handlers/parish-outside-gifts.js';
export async function createOutsideGiftsFixture() {
  const fixture = await createFundReconciliationFixture();
  fixture.db.exec('PRAGMA foreign_keys=ON');
  for (const file of [
    '0016_manual_income_entries.sql',
    '0049_authoritative_stewardship_financial_snapshots.sql',
    '0115_outside_giver_contributions.sql',
  ])
    fixture.db.exec(readFileSync(new URL('../../migrations/' + file, import.meta.url), 'utf8'));
  fixture.db
    .exec(`CREATE TABLE household_pledges(donor_email TEXT,parish_id TEXT,fiscal_year INTEGER,target_amount_cents INTEGER,PRIMARY KEY(donor_email,parish_id,fiscal_year));
    ALTER TABLE donor_offerings ADD COLUMN donor_email TEXT;
    ALTER TABLE donor_offerings ADD COLUMN updated_at TEXT;
    UPDATE donor_offerings SET donor_email=json_extract(data,'$.donorEmail'), updated_at=created_at;`);
  fixture.db
    .prepare('INSERT INTO household_pledges VALUES(?,?,?,?)')
    .run('giver0@example.test', fixture.registration.parishId, new Date().getFullYear(), 120000);
  fixture.outside = (suffix = '', body, token = fixture.token) =>
    handleParishOutsideGifts(
      new Request('https://parish.test/api/parish/dashboard/synthetic-parish/outside-gifts' + suffix, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      fixture.env,
      fixture.registration.parishId,
      suffix.split('?')[0]
    );
  return fixture;
}
