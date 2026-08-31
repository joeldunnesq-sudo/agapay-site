import { csvTable, digest, normalize, text } from '../csv-utils.js';
import { ValidationError } from '../errors.js';

const aliases = {
  sourceRef: ['account id', 'id'],
  accountNumber: ['account number', 'number', 'account no', 'num', 'account code', 'code'],
  name: ['account name', 'full name', 'name', 'account'],
  type: ['account type', 'type', 'category'],
  description: ['description'],
};
const categories = ['asset', 'liability', 'net_asset', 'revenue', 'expense'];
const suggestions = {
  asset: 'asset',
  assets: 'asset',
  bank: 'asset',
  cash: 'asset',
  'accounts receivable': 'asset',
  'other current asset': 'asset',
  'other current assets': 'asset',
  'fixed asset': 'asset',
  'fixed assets': 'asset',
  'other asset': 'asset',
  'other assets': 'asset',
  liability: 'liability',
  liabilities: 'liability',
  'accounts payable': 'liability',
  'credit card': 'liability',
  'other current liability': 'liability',
  'other current liabilities': 'liability',
  'long term liability': 'liability',
  'long term liabilities': 'liability',
  equity: 'net_asset',
  'net asset': 'net_asset',
  'net assets': 'net_asset',
  income: 'revenue',
  'other income': 'revenue',
  revenue: 'revenue',
  expense: 'expense',
  expenses: 'expense',
  'other expense': 'expense',
  'cost of goods sold': 'expense',
};
const accountRows = async (db) =>
  (
    await db
      .prepare(
        `SELECT a.id,a.account_number,a.name,a.is_posting_account,a.is_active,a.archived_at,a.version,t.category
  FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id`
      )
      .all()
  ).results;
const requireImporter = (actor) => {
  if (!actor?.id || !actor.capabilities?.includes('accounting.migration.import'))
    throw new ValidationError('Accounting import permission is required.');
};

export async function previewActivationChart(db, { actor, filename, csv, columnMap = {}, typeMap = {} }) {
  requireImporter(actor);
  if (typeof csv !== 'string') throw new ValidationError('Choose a CSV file to preview.');
  const table = csvTable({ filename, csv, maxRows: 250 });
  if (new Set(table.normalizedHeaders).size !== table.headers.length)
    throw new ValidationError('CSV column headers must be unique. Rename duplicate headers before importing.');
  const indexes = Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => {
      const selected = columnMap[key];
      return [
        key,
        selected
          ? table.normalizedHeaders.indexOf(normalize(selected))
          : table.normalizedHeaders.findIndex((header) => names.includes(header)),
      ];
    })
  );
  if (indexes.name < 0 || indexes.type < 0)
    throw new ValidationError('Map the Account name and Account type columns, then preview again.');
  const existing = await accountRows(db),
    rows = [],
    errors = [],
    seenRefs = new Set(),
    seenNumbers = new Set(),
    seenNames = new Set();
  const value = (raw, key) => (indexes[key] < 0 ? '' : text(raw[indexes[key]]));
  for (let index = 0; index < table.rows.length; index++) {
    const raw = table.rows[index],
      rowNumber = index + 2;
    const name = value(raw, 'name'),
      accountNumber = value(raw, 'accountNumber'),
      sourceType = value(raw, 'type'),
      sourceRef = value(raw, 'sourceRef') || accountNumber || name;
    const error = (message) => errors.push({ rowNumber, message });
    if (!name || !sourceType || !sourceRef) {
      error('An account name, type and reference are required.');
      continue;
    }
    if (
      name.length > 180 ||
      sourceRef.length > 180 ||
      accountNumber.length > 40 ||
      sourceType.length > 80 ||
      value(raw, 'description').length > 1000
    ) {
      error('An account field is too long.');
      continue;
    }
    if (
      seenRefs.has(sourceRef) ||
      (accountNumber && seenNumbers.has(normalize(accountNumber))) ||
      seenNames.has(normalize(name))
    )
      error('Duplicate account reference, number or name in this file.');
    seenRefs.add(sourceRef);
    if (accountNumber) seenNumbers.add(normalize(accountNumber));
    seenNames.add(normalize(name));
    const byNumber = existing.find((a) => accountNumber && normalize(a.account_number) === normalize(accountNumber));
    const byName = existing.find((a) => normalize(a.name) === normalize(name));
    if (byNumber && byName && byNumber.id !== byName.id)
      error('Account number and name match different AGAPAY accounts. Resolve the conflict before importing.');
    const match = byNumber || byName;
    const category = typeMap[sourceType] || suggestions[normalize(sourceType)] || '';
    if (match && (!match.is_active || match.archived_at || !match.is_posting_account))
      error('This matches an inactive or parent account. Choose a posting account instead.');
    if (match && category && category !== match.category)
      error(
        `This matches ${match.name}, an AGAPAY ${match.category.replace('_', ' ')} account. Its category must agree.`
      );
    rows.push({
      rowNumber,
      sourceRef,
      accountNumber,
      name,
      sourceType,
      description: value(raw, 'description'),
      category,
      action: match ? 'link' : 'create',
      matchId: match?.id || '',
      matchName: match?.name || '',
      matchVersion: match?.version || 0,
    });
  }
  const distinctSourceTypes = [...new Set(rows.map((row) => row.sourceType))];
  const selectedTypeMap = Object.fromEntries(
    distinctSourceTypes.map((type) => [type, typeMap[type] || suggestions[normalize(type)] || ''])
  );
  const fingerprint = await digest({ rows, selectedTypeMap, csvHash: await digest(csv) });
  return {
    headers: table.headers,
    columnMap: Object.fromEntries(
      Object.entries(indexes).map(([key, index]) => [key, index < 0 ? '' : table.headers[index]])
    ),
    rows,
    errors,
    fingerprint,
    distinctSourceTypes,
    selectedTypeMap,
    ignoredBalanceColumns: table.headers.filter((header) => /balance|debit|credit/i.test(header)),
    createCount: rows.filter((row) => row.action === 'create').length,
    linkCount: rows.filter((row) => row.action === 'link').length,
  };
}

export async function commitActivationChart(db, input) {
  requireImporter(input.actor);
  const session = await db
    .prepare("SELECT * FROM accounting_migration_sessions WHERE id=? AND status='in_progress'")
    .bind(input.migrationSessionId)
    .first();
  if (!session) throw new ValidationError('Start or resume an import session first.');
  if (input.confirmed !== true) throw new ValidationError('Review and confirm the account mappings first.');
  const preview = await previewActivationChart(db, input); // Never trust a browser-supplied preview.
  if (preview.errors.length || !preview.rows.length)
    throw new ValidationError('Resolve the CSV errors before creating accounts.');
  if (preview.distinctSourceTypes.some((type) => !categories.includes(input.typeMap?.[type])))
    throw new ValidationError('Confirm a category for every source account type.');
  const commitId = `chart_${(await digest({ session: session.id, fingerprint: input.fingerprint })).slice(0, 32)}`;
  if (await db.prepare('SELECT id FROM accounting_ledger_events WHERE id=?').bind(commitId).first())
    return { alreadyImported: true };
  if (preview.fingerprint !== input.fingerprint)
    throw new ValidationError('The account preview changed. Review the updated preview before importing.');
  const posted = await db
    .prepare("SELECT COUNT(*) count FROM accounting_journal_entries WHERE status='posted'")
    .first();
  if (Number(posted?.count))
    throw new ValidationError(
      'These books already have posted activity. Use the Accounting migration workspace to review a later import.'
    );
  const types = (await db.prepare('SELECT id,category,normal_balance FROM accounting_account_types').all()).results;
  const statements = [];
  for (const row of preview.rows) {
    const accountId = row.matchId || `acct_import_${(await digest(`${session.id}:${row.sourceRef}`)).slice(0, 24)}`;
    if (!row.matchId) {
      const type = types.find((item) => item.category === input.typeMap[row.sourceType]);
      if (!type) throw new ValidationError('The selected account category is unavailable.');
      statements.push(
        db
          .prepare(
            `INSERT INTO accounting_accounts(id,account_number,name,description,account_type_id,normal_balance,is_posting_account,is_system,is_active,requires_fund,cash_flow_classification)
        VALUES(?,?,?,?,?,?,1,0,1,1,'operating')`
          )
          .bind(
            accountId,
            row.accountNumber || `IMP-${accountId.slice(-10).toUpperCase()}`,
            row.name,
            row.description || null,
            type.id,
            type.normal_balance
          )
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO accounting_migration_account_map(migration_session_id,source_account_ref,agapay_account_id)
      VALUES(?,?,(SELECT id FROM accounting_accounts WHERE id=? AND version=? AND is_active=1 AND archived_at IS NULL))
      ON CONFLICT(migration_session_id,source_account_ref) DO UPDATE SET agapay_account_id=excluded.agapay_account_id`
        )
        .bind(session.id, row.sourceRef, accountId, row.matchId ? row.matchVersion : 1)
    );
  }
  statements.push(
    db
      .prepare(
        "UPDATE accounting_migration_sessions SET chart_of_accounts_status='completed',version=version+1 WHERE id=?"
      )
      .bind(session.id)
  );
  statements.push(
    db
      .prepare(
        "INSERT INTO accounting_ledger_events(id,event_type,actor_type,actor_id,correlation_id) VALUES(?,'activation.chart_imported',?,?,?)"
      )
      .bind(commitId, input.actor.type || 'accounting_staff_profile', input.actor.id, session.id)
  );
  await db.batch(statements);
  return { created: preview.createCount, linked: preview.linkCount };
}
