// Generated from src/accounting/assets/setup.ts by npm run build:server. Do not edit.
import { ValidationError } from '../errors.js';
import { assetAccount, hash, permitted, text } from './service.js';
async function setupAssetAccounts(db, actor, input) {
  permitted(actor, 'accounting.configure');
  const key = text(input.operationKey, 'Operation key', 100, true),
    fundId = text(input.fundId, 'Default fund', 100, true);
  const fund = await db
    .prepare('SELECT id FROM accounting_funds WHERE id=? AND is_active=1 AND archived_at IS NULL')
    .bind(fundId)
    .first();
  if (!fund) throw new ValidationError('Choose an active default fund.');
  const prefix = (await hash(key)).slice(0, 32),
    statements = [],
    ids = {};
  const specs = [
    {
      role: 'cost',
      category: 'asset',
      normal: 'debit',
      classification: 'investing',
      existing: input.costExistingId,
      number: input.costNumber,
      name: input.costName,
    },
    {
      role: 'accumulated',
      category: 'asset',
      normal: 'credit',
      classification: 'operating',
      existing: input.accumulatedExistingId,
      number: input.accumulatedNumber,
      name: input.accumulatedName,
    },
    {
      role: 'expense',
      category: 'expense',
      normal: 'debit',
      classification: 'operating',
      existing: input.expenseExistingId,
      number: input.expenseNumber,
      name: input.expenseName,
    },
  ];
  const numbers = /* @__PURE__ */ new Set();
  for (const spec of specs) {
    const existingId = text(spec.existing, 'Existing account', 100);
    if (existingId) {
      const existing = await assetAccount(db, existingId, spec.category, spec.normal);
      if (
        existing.cash_flow_classification !== spec.classification ||
        (spec.category === 'asset' && Number(existing.account_number) < 1100)
      )
        throw new ValidationError(
          `Choose a ${spec.classification} ${spec.role} account with the required normal balance; cash accounts cannot be fixed assets.`
        );
      ids[spec.role] = existingId;
      continue;
    }
    const number = text(spec.number, 'Account number', 24, true),
      name = text(spec.name, 'Account name', 120, true);
    if (!/^\d{4,6}$/.test(number) || Number(number) < 1100 || numbers.has(number))
      throw new ValidationError('Use distinct four- to six-digit account numbers above 1099.');
    numbers.add(number);
    const id = `assetsetup_${prefix}_${spec.role}`;
    ids[spec.role] = id;
    const prior = await db
      .prepare(
        'SELECT account_number,name,account_type_id,normal_balance,cash_flow_classification FROM accounting_accounts WHERE id=?'
      )
      .bind(id)
      .first();
    if (prior) {
      const presentation =
        spec.role === 'expense'
          ? await db
              .prepare('SELECT default_fund_id FROM accounting_account_presentations WHERE account_id=?')
              .bind(id)
              .first()
          : null;
      if (
        prior.account_number !== number ||
        prior.name !== name ||
        prior.account_type_id !== `type_${spec.category}` ||
        prior.normal_balance !== spec.normal ||
        prior.cash_flow_classification !== spec.classification ||
        (presentation && presentation.default_fund_id !== fundId)
      )
        throw new ValidationError('This setup request was already used with different details. Start a new setup.');
      continue;
    }
    if (await db.prepare('SELECT id FROM accounting_accounts WHERE account_number=?').bind(number).first())
      throw new ValidationError(
        `Account number ${number} is already in use. Select that existing account or choose a new number.`
      );
    statements.push(
      db
        .prepare(
          `INSERT INTO accounting_accounts(id,account_number,name,description,account_type_id,normal_balance,is_posting_account,is_system,is_active,requires_fund,cash_flow_classification)
   VALUES(?,?,?,?,?,?,1,0,1,1,?)`
        )
        .bind(
          id,
          number,
          name,
          `Asset account setup by ${actor.id}`,
          `type_${spec.category}`,
          spec.normal,
          spec.classification
        )
    );
    if (spec.role === 'expense')
      statements.push(
        db
          .prepare(
            "INSERT INTO accounting_account_presentations(account_id,expense_group,default_fund_id) VALUES(?,'other',?)"
          )
          .bind(id, fundId)
      );
  }
  if (statements.length) await db.batch(statements);
  return { costAccountId: ids.cost, accumulatedAccountId: ids.accumulated, expenseAccountId: ids.expense };
}
export { setupAssetAccounts };
