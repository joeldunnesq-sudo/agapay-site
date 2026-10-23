import ts from 'typescript';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Execute the real HTTP dispatchers with authentication and service I/O isolated.
// Malicious JSON must never replace server-owned context at the service boundary.
const actor = { id: 'authenticated-treasurer', capabilities: ['accounting.journals.create'] };
const captured = [];
const service = async (options) => {
  captured.push(options);
  return {};
};
const dbService = async (_db, options) => service(options);
const context = async () => ({ actor, db: {}, tier: 'advanced_operations' });
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
function load(file, name, dependencies) {
  const source = readFileSync(new URL(`../src/handlers/${file}`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const node = ast.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node, name);
  const dispatcher = node.getText(ast).replace('export async function', 'async function');
  return new Function(...Object.keys(dependencies), `${dispatcher}\nreturn ${name};`)(...Object.values(dependencies));
}
const ledger = load('accounting-ledger.js', 'handleAccountingLedger', {
  accountingContext: context,
  reply,
  recordSimpleDeposit: dbService,
  recordSplitDeposit: dbService,
  recordInKindGift: dbService,
  createJournalDraft: dbService,
  updateJournalDraft: dbService,
  postJournalEntry: dbService,
});
const hostile = {
  actor: { id: 'forged', capabilities: ['*'] },
  journalEntryId: 'other-journal',
  entitlementTier: 'parish',
  additionalStatements: [{ sql: 'untrusted' }],
  expectedVersion: 1,
  idempotencyKey: 'post-1234',
  requestHash: 'hash',
};
const request = (path, method = 'POST', body = hostile) =>
  new Request(`https://agapay.app/api/parish/dashboard/parish-a/accounting${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
for (const [path, method] of [
  ['/simple/deposits', 'POST'],
  ['/simple/split-deposits', 'POST'],
  ['/simple/in-kind-gifts', 'POST'],
  ['/journals', 'POST'],
  ['/journals/url-journal', 'PATCH'],
  ['/journals/url-journal/post', 'POST'],
]) {
  const response = await ledger(request(path, method), {}, 'parish-a');
  assert.equal(response.status < 300, true, await response.text());
  const options = captured.at(-1);
  assert.equal(options.actor, actor);
  if (path.includes('url-journal')) assert.equal(options.journalEntryId, 'url-journal');
  if (path.endsWith('/post')) assert.equal(options.additionalStatements, undefined);
}
const close = load('accounting-close.js', 'handleAccountingClose', {
  accountingContext: context,
  reply,
  required: () => 'accounting.close.create',
  tierOf: () => 'mission',
  createCloseSession: dbService,
});
assert.equal((await close(request('/close/sessions'), {}, 'parish-a')).status, 201);
assert.equal(captured.at(-1).actor, actor);
assert.equal(captured.at(-1).entitlementTier, 'mission');
const banking = load('accounting-reconciliation-commerce.js', 'handleAccountingReconciliationCommerce', {
  accountingContext: context,
  reply,
  capability: () => 'accounting.view',
  serviceTier: () => 'mission',
  previewBankCsv: service,
  confirmReconciliationMatch: dbService,
  previewIntegrationBackfill: dbService,
});
for (const path of [
  '/bank/imports/preview',
  '/bank/reconciliations/url-reconciliation/matches',
  '/integrations/give-stripe/backfill-preview',
]) {
  const response = await banking(
    request(path, 'POST', { ...hostile, reconciliationId: 'other-reconciliation' }),
    {},
    'parish-a'
  );
  assert.equal(response.status, 200, await response.text());
  assert.equal(captured.at(-1).actor, actor);
  assert.equal(captured.at(-1).entitlementTier, 'mission');
  if (path.endsWith('/matches')) assert.equal(captured.at(-1).reconciliationId, 'url-reconciliation');
}
console.log(
  'PASS - hostile request bodies cannot replace authenticated actors, service tiers, URL IDs, or posting transaction statements'
);

let periodCapability;
const setup = load('accounting-setup-reports.js', 'handleAccountingSetupReports', {
  accountingContext: async (...args) => {
    periodCapability = args[3];
    return context();
  },
  reply,
  openAccountingPeriod: dbService,
});
const periodResponse = await setup(
  request('/periods/open', 'POST', { ...hostile, periodId: 'period_fixture' }),
  {},
  'parish-a'
);
assert.equal(periodResponse.status, 200, await periodResponse.text());
assert.equal(periodCapability, 'accounting.configure');
assert.equal(captured.at(-1).actor, actor);
assert.equal(captured.at(-1).periodId, 'period_fixture');
console.log('PASS - opening a period requires the server-selected configuration capability and authenticated actor');
