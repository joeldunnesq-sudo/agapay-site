import { d1All } from '../../lib/core.js';
import { parishClosureState } from '../../portability/closure.js';
import { resolveScheduledAccountingDatabase } from '../provisioning/adapters.js';
import { processDueRecurringBills } from '../payables/recurring-bills.js';
import { processDueRecurringTransactions } from './service.js';

const SYSTEM_ACTOR = Object.freeze({
  id: 'accounting-recurring-scheduler',
  type: 'system',
  capabilities: Object.freeze(['accounting.journals.create', 'accounting.journals.post', 'ap.enter']),
});

export async function runScheduledRecurringTransactions(env: Partial<Env>, scheduledTime = Date.now()) {
  const rows = await d1All<{ parish_id: string; subscription_tier: string; database_identifier: string }>(
    env,
    `SELECT e.parish_id,e.subscription_tier,d.database_identifier
    FROM accounting_entities e JOIN accounting_databases d ON d.accounting_entity_id=e.id
    WHERE e.entity_status='ready' AND e.activation_status='active'
      AND d.environment='production' AND d.provisioning_status='ready'`
  );
  const asOfDate = new Date(scheduledTime).toISOString().slice(0, 10),
    results = [];
  let failures = 0;
  for (const row of rows) {
    if (await parishClosureState(env, row.parish_id)) continue;
    const db = await resolveScheduledAccountingDatabase(env, row.database_identifier);
    if (!db) continue;
    try {
      const settled = await Promise.allSettled([
        processDueRecurringTransactions(db, { asOfDate, actor: SYSTEM_ACTOR }),
        processDueRecurringBills(db, { asOfDate, actor: SYSTEM_ACTOR, entitlementTier: 'parish' }),
      ]);
      const rejected = settled.find((result) => result.status === 'rejected');
      if (rejected?.status === 'rejected') throw rejected.reason;
      const postings = settled[0].status === 'fulfilled' ? settled[0].value : [];
      const bills = settled[1].status === 'fulfilled' ? settled[1].value : [];
      failures += [...postings, ...bills].filter((result) => result.status === 'failed').length;
      results.push({ parishId: row.parish_id, processed: postings.length + bills.length, postings, bills });
    } catch (error) {
      if (String((error as { message?: string } | null)?.message || '').includes('no such table')) continue;
      failures++;
      results.push({
        parishId: row.parish_id,
        error: (error as { message?: string } | null)?.message || String(error),
      });
    }
  }
  if (failures)
    throw new Error(
      `Scheduled accounting recurring work has ${failures} failure(s); inspect the saved recurring runs before retrying.`
    );
  return Object.freeze({ asOfDate, parishes: results.length, results: Object.freeze(results) });
}
