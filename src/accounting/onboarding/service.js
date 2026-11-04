// Generated from src/accounting/onboarding/service.ts by npm run build:server. Do not edit.
import { getAccountingSetupOverview } from '../setup/service.js';
import { assetRegister } from '../assets/service.js';
import { onboardingAccess, onboardingEvidence, onboardingReviews } from './evidence.js';
async function accountingOnboardingJourney(db, actor, tier) {
  onboardingAccess(actor);
  const [setup, evidence, reviews] = await Promise.all([
    getAccountingSetupOverview(db, { actor, entitlementTier: tier }),
    onboardingEvidence(db),
    onboardingReviews(db),
  ]);
  const facts = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM accounting_journal_entries WHERE status IN ('posted','reversed')) journals,(SELECT COUNT(*) FROM accounting_opening_balance_batches WHERE status='posted') openings,(SELECT COUNT(*) FROM accounting_bank_accounts WHERE is_active=1) banks,(SELECT COUNT(*) FROM accounting_reconciliation_sessions WHERE status='completed') reconciliations,(SELECT COUNT(*) FROM accounting_fixed_assets a WHERE NOT EXISTS(SELECT 1 FROM accounting_asset_cancellations c WHERE c.asset_id=a.id)) assets`
    )
    .first();
  const today = /* @__PURE__ */ new Date().toISOString().slice(0, 10),
    register = facts?.assets ? await assetRegister(db, actor, today) : null;
  const review = (id) => reviews.find((r) => r.task_id === id),
    current = (id) => review(id)?.evidence_hash === evidence[id];
  const item = (id, title, complete, description, action, view) => ({
    id,
    title,
    status: complete ? 'complete' : 'action_needed',
    description,
    action,
    view,
    evidenceHash: evidence[id] || null,
    review: review(id) || null,
  });
  const tasks = [
    item(
      'fiscal',
      'Confirm your fiscal year',
      Boolean(setup.currentFiscalYear) && current('fiscal'),
      'Confirm the dates match your parish records before importing or posting.',
      'Review fiscal settings',
      'settings'
    ),
    item(
      'accounts',
      'Review your categories',
      setup.activeAccountCount > 0 && current('accounts'),
      'The seeded chart is a starting point. Review income, expense, bank and asset categories.',
      'Open chart of accounts',
      'setup'
    ),
    item(
      'funds',
      'Review funds and giving destinations',
      setup.activeFundCount > 0 && current('funds'),
      'Confirm operating and restricted funds, then check online-giving destinations in integrations.',
      'Review funds',
      'funds'
    ),
    item(
      'records',
      'Choose how to bring your books over',
      review('records')?.choice !== 'importing' &&
        (Boolean(facts?.openings) ||
          (current('records') &&
            (review('records').choice === 'new_books' ||
              (review('records').choice === 'existing_books' && Boolean(facts?.journals))))),
      'Import reviewed opening balances, explicitly confirm new books, or document why existing posted books need no additional opening entry. Importing is not completion.',
      'Open import wizard',
      'migration'
    ),
    item(
      'assets',
      'Review older property and equipment',
      current('assets') &&
        ((review('assets')?.choice === 'none' && !facts?.assets) ||
          (review('assets')?.choice === 'reviewed' && Boolean(register?.reconciliation.balanced))),
      'Link historical cost and accumulated depreciation to existing posted entries. Deferral stays visible; it does not count as complete.',
      'Review asset register',
      'assets'
    ),
    item(
      'bank',
      'Connect a bank ledger account',
      Boolean(facts?.banks),
      'Add the ledger bank account used for statement reconciliation. Bank credentials stay with your payment provider.',
      'Open bank reconciliation',
      'banking'
    ),
    item(
      'validation',
      'Check the ledger foundation',
      setup.validation.ok && setup.warnings.length === 0,
      'Resolve validation warnings before relying on reports. A balanced ledger does not prove every source document has been entered.',
      'Open setup checks',
      'setup'
    ),
    item(
      'reconciliation',
      'Complete your first reconciliation',
      Boolean(facts?.reconciliations),
      'Import a real statement when available, match the entries and complete a zero-difference reconciliation. This milestone is based on completed reconciliation records.',
      'Reconcile a statement',
      'banking'
    ),
  ];
  const completed = tasks.filter((t) => t.status === 'complete').length;
  return {
    tasks,
    completed,
    total: tasks.length,
    nextTaskId: tasks.find((t) => t.status !== 'complete')?.id || null,
    readyForFirstReconciliation: tasks.slice(0, -1).every((t) => t.status === 'complete'),
    firstReconciliationComplete: Boolean(facts?.reconciliations),
    fiscalYear: setup.currentFiscalYear,
    choices: {
      fiscal: ['reviewed'],
      accounts: ['reviewed'],
      funds: ['reviewed'],
      records: ['importing', 'new_books', 'existing_books'],
      assets: ['reviewed', 'none', 'deferred'],
    },
    warnings: setup.warnings,
  };
}
export { accountingOnboardingJourney };
