// Generated from src/lib/outside-pledges.ts by npm run build:server. Do not edit.
import { OutsideGiftError } from './outside-gifts.js';
async function validateOutsidePledge(db, parishId, input, giver) {
  if (input.givingKind !== 'pledge') return;
  if (!giver.email) throw new OutsideGiftError('Pledge payments require a giver with an email-linked pledge.');
  const pledge = await db
    .prepare(
      'SELECT target_amount_cents FROM household_pledges WHERE parish_id=? AND lower(donor_email)=? AND fiscal_year=?'
    )
    .bind(parishId, giver.email.trim().toLowerCase(), input.pledgeYear)
    .first();
  if (!pledge || Number(pledge.target_amount_cents) <= 0)
    throw new OutsideGiftError(
      'This giver has no pledge for the selected year. Have them set their pledge first, or record this as other giving.'
    );
}
import { outsidePledgeGiving, parishPledgeReceivedCents, addOutsideDonorPledgeSummary } from './pledge-report-reads.js';
export { addOutsideDonorPledgeSummary, outsidePledgeGiving, parishPledgeReceivedCents, validateOutsidePledge };
