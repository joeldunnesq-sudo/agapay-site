import {
  outsidePledgeGiving,
  parishPledgeReceivedCents,
  addOutsideDonorPledgeSummary,
} from '../../src/lib/pledge-report-reads.js';
declare const env: Env;
const total: Promise<number> = parishPledgeReceivedCents(env, 'a', 2026);
void total;
async function contracts() {
  const rows = await outsidePledgeGiving(env, 'a', 2026);
  // @ts-expect-error: query values require conversion before arithmetic.
  const cents: number = rows[0].given_cents;
  void cents;
  const result = await addOutsideDonorPledgeSummary(
    env,
    { defaultParishId: 'a', email: 'a@example.test' },
    { year: 2026, stewardshipYtdCents: 0, stewardshipMonthCents: 0, label: 'retained' }
  );
  const label: string = result.label;
  void label;
  // @ts-expect-error: early fallback can return the original summary without outside amounts.
  const outside: number = result.outsidePledgeYtdCents;
  void outside;
}
void contracts;
// @ts-expect-error: the parish aggregate requires a database binding.
parishPledgeReceivedCents({}, 'a', 2026);
// @ts-expect-error: year arithmetic requires a number.
outsidePledgeGiving(env, 'a', '2026');
// @ts-expect-error: numeric summary fields are required.
addOutsideDonorPledgeSummary(env, {}, { year: 2026, stewardshipYtdCents: '0', stewardshipMonthCents: 0 });
// @ts-expect-error: explicit report clock must be a Date.
addOutsideDonorPledgeSummary(env, {}, { year: 2026, stewardshipYtdCents: 0, stewardshipMonthCents: 0 }, '2026-07-01');
