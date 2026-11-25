import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openParishFixture, parish } from './lib/parish-browser-fixture.mjs';

const bank = { id: 'checking', name: 'Operating checking', ledgerAccountId: 'bank-ledger' };
const savings = { id: 'savings', name: 'Savings', ledgerAccountId: 'savings-ledger' };
const fund = {
  id: 'general',
  code: 'GEN',
  name: 'General Operating Fund',
  isDefault: true,
  isActive: true,
  restrictionType: 'unrestricted',
};
const { promise: releaseBills, resolve: finishBills } = Promise.withResolvers();
const browser = await chromium.launch({ headless: true });

try {
  for (const tier of ['advanced_operations', 'core']) {
    const parishTier = tier === 'advanced_operations';
    const bankAccounts = parishTier ? [bank, savings] : [];
    let matched = false;
    let matchAttempts = 0;
    let completed = false;
    let expensePosted = false;
    const fiscal = { id: 'fy', startDate: '2026-01-01', endDate: '2026-12-31' };
    const closePeriod = { id: 'close-period', name: 'October 2024', startDate: '2024-10-01', endDate: '2024-10-31', status: 'open', fiscalStatus: 'open', version: 1 };
    const october = {
      id: 'oct',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      status: 'locked',
      fiscalStatus: 'open',
      version: 2,
    };
    const november = {
      id: 'nov',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      status: 'future',
      fiscalStatus: 'open',
      version: 1,
    };
    const statement = {
      id: 'statement',
      bankAccountName: bank.name,
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      endingBalance: 25000,
      version: 1,
      status: 'in_progress',
    };
    const candidate = {
      bankTransactionId: 'bank-row',
      journalLineId: 'book-row',
      bankDate: '2026-10-05',
      ledgerDate: '2026-10-05',
      bankDescription: 'Bank offering deposit',
      ledgerDescription: 'Sunday offering',
      amount: 25000,
      direction: 'credit',
      reasons: ['Exact amount'],
    };
    const accounting = {
      '/setup': {
        tier,
        overview: { currentFiscalYear: fiscal, periods: [closePeriod, october, november], canOpenPeriods: parishTier },
      },
      '/workspace-reference': {
        funds: [fund],
        fundCatalog: [fund, { ...fund, id: 'retired', code: 'OLD', name: 'Retired building fund', isActive: false }],
        accounts: [
          { id: 'office', name: 'Office supplies', category: 'expense' },
          {
            id: bank.ledgerAccountId,
            accountNumber: '1010',
            name: bank.name,
            category: 'asset',
            isActive: true,
            isPostingAccount: true,
          },
          {
            id: savings.ledgerAccountId,
            accountNumber: '1020',
            name: savings.name,
            category: 'asset',
            isActive: true,
            isPostingAccount: true,
          },
        ],
      },
      '/journals': { entries: [] },
      '/general-ledger': { rows: [] },
      '/reports/trial-balance': { report: {} },
      '/reports/statement-of-activities': {
        report: {
          startDate: '2026-01-01',
          endDate: '2026-10-31',
          totals: { revenue: 156000, expenses: 62000, changeInNetAssets: 94000 },
        },
      },
      '/reports/statement-of-financial-position': { report: {} },
      '/reports/fund-activity': {
        report: { rows: [{ fundId: fund.id, name: fund.name, restrictionType: 'unrestricted', endingBalance: 94000 }] },
      },
      '/recurring-transactions': { items: [] },
      '/ledger/status': { status: { operational: true } },
    };
    const api = {
      '/session-activity': { body: { ok: true } },
      '/portability/recovery': { body: {} },
      '/accounting-access/activation': { body: { completed: true } },
      '/accounting/close/workspace': { status: 403, body: { error: 'Forbidden' } },
      ...Object.fromEntries(Object.entries(accounting).map(([path, body]) => ['/accounting' + path, { body }])),
      '/accounting/bank/accounts': (request) => {
        if (request.method() === 'GET') return { body: { accounts: bankAccounts } };
        const values = request.postDataJSON();
        const entry = [bank, savings].find((item) => item.ledgerAccountId === values.ledgerAccountId);
        assert.ok(entry);
        assert.equal(values.isDefault, bankAccounts.length === 0);
        const account = { ...entry, version: 1, accountType: values.accountType };
        bankAccounts.push(account);
        return { status: 201, body: { account } };
      },
      '/accounting/bank/accounts/checking': (request) => {
        const { expectedVersion, patch } = request.postDataJSON();
        assert.equal(expectedVersion, 1);
        assert.equal(patch.institutionName, 'Parish Credit Union');
        bankAccounts[0] = { ...bankAccounts[0], ...patch, version: 2 };
        return { body: { account: bankAccounts[0] } };
      },
      '/accounting/bank/transfers': (request) => {
        if (request.method() === 'GET') return { body: { transfers: [], nextOffset: null } };
        const body = request.postDataJSON();
        assert.equal(body.fromAccountId, bank.ledgerAccountId);
        assert.equal(body.toAccountId, savings.ledgerAccountId);
        assert.equal(body.fundId, fund.id);
        assert.equal(body.amount, 2500);
        assert.match(body.operationKey, /^[a-f0-9-]{36}$/i);
        return { status: 201, body: { ok: true, entry: { id: 'transfer' } } };
      },
      '/accounting/bank/reconciliations': () => ({
        body: { sessions: [{ ...statement, status: completed ? 'completed' : 'in_progress' }] },
      }),
      '/accounting/bank/reconciliations/statement': () => ({
        body: {
          reconciliation: {
            ...statement,
            bankAccount: bank,
            ledgerEndingBalance: 25000,
            difference: matched ? 0 : 25000,
          },
        },
      }),
      '/accounting/bank/reconciliations/statement/suggestions': () => ({
        body: {
          suggestions: matched ? [] : [candidate],
          bankItems: matched
            ? []
            : [{ id: 'bank-row', date: candidate.bankDate, description: candidate.bankDescription, amount: 25000 }],
          ledgerItems: [],
        },
      }),
      '/accounting/bank/reconciliations/statement/matches': (request) => {
        assert.deepEqual(request.postDataJSON(), {
          bankTransactionIds: ['bank-row'],
          journalLineIds: ['book-row'],
          matchType: 'one_to_one',
        });
        if (++matchAttempts === 1)
          return { status: 409, body: { message: 'This match changed. Review the entries and try again.' } };
        matched = true;
        return { body: { ok: true } };
      },
      '/accounting/bank/reconciliations/statement/complete': (request) => {
        assert.deepEqual(request.postDataJSON(), { expectedVersion: 1 });
        completed = true;
        return { body: { ok: true } };
      },
    };
    if (parishTier) {
      const october = { ...closePeriod, fiscalYearId: fiscal.id };
      api['/accounting/adjustments'] = { body: { adjustments: [] } };
      api['/accounting/adjustments/templates'] = { body: { templates: [] } };
      let closeSession;
      api['/accounting/close/workspace'] = () => ({
        body: { fiscalYears: [fiscal], periods: [october], sessions: closeSession ? [closeSession] : [] },
      });
      api['/accounting/close/sessions'] = (request) => {
        assert.deepEqual(request.postDataJSON(), {
          closeType: 'month_end',
          fiscalYearId: fiscal.id,
          accountingPeriodId: october.id,
        });
        closeSession = {
          id: 'monthly-close',
          closeType: 'month_end',
          accountingPeriodId: october.id,
          version: 1,
          status: 'draft',
        };
        return { body: { session: closeSession } };
      };
      api['/accounting/close/sessions/monthly-close/validate'] = () => {
        closeSession = {
          ...closeSession,
          status: 'blocked',
          lastValidatedAt: '2026-10-31T16:00:00Z',
          summary: { blockers: 1 },
          checks: [
            { code: 'journals.open_drafts', label: 'Journal drafts reviewed', status: 'passed' },
            { code: 'integrations.exceptions', label: 'Integration exceptions reviewed', status: 'passed' },
            { code: 'payables.review', label: 'Payables reviewed', status: 'warning' },
            { code: 'bank.required_reconciliations', label: 'Match all bank statements', status: 'failed', blocking: true },
            { code: 'ledger.trial_balance', label: 'Trial balance balances', status: 'pending', blocking: true },
          ],
        };
        return { body: { session: closeSession } };
      };
      api['/accounting/close/sessions/monthly-close'] = () => ({ body: { session: closeSession } });
      api['/accounting/payables/overview'] = async () => {
        await releaseBills;
        return { body: { overview: { awaitingApproval: 2, openPayables: 34500 } } };
      };
      for (const resource of [
        'bills',
        'vendors',
        'payments',
        'payment-runs',
        'recurring-bills',
        'aging',
        '1099-summary',
      ]) {
        api[`/accounting/payables/${resource}`] = { body: {} };
      }
      api['/accounting/payables/bills'] = {
        body: {
          actions: { enter: true, approve: true, pay: true },
          bills: [
            {
              id: 'my-bill',
              vendorName: 'Office vendor',
              status: 'submitted',
              needsOtherApprover: true,
              amountDue: 10000,
              version: 1,
            },
            {
              id: 'other-bill',
              vendorName: 'Internet provider',
              status: 'submitted',
              needsOtherApprover: false,
              amountDue: 24500,
              version: 1,
            },
          ],
        },
      };
      api['/accounting/payables/vendors'] = {
        body: { vendors: [{ id: 'vendor', displayName: 'Office vendor', status: 'active' }] },
      };
      api['/accounting/budgets'] = {
        body: { budgets: [{ id: 'approved-budget', fiscalYearId: fiscal.id, versionNumber: 2, status: 'approved' }] },
      };
      api['/accounting/budgets/approved-budget/variance'] = {
        body: { report: { budget: { name: 'Parish plan', versionNumber: 2 }, throughDate: '2026-10-31', rows: [] } },
      };
    }
    api['/accounting/journals'] = (request) => {
      if (request.method() === 'GET') {
        const params = new URL(request.url()).searchParams;
        if (params.get('sort') === 'activity') {
          assert.equal(params.get('limit'), '5');
          return { body: { entries: [{ id: 'recent', description: 'Recent foundation deposit', status: 'posted', totalDebits: 100000, updatedAt: '2026-11-23T18:00:00Z' }] } };
        }
        if (params.get('status') === 'unposted') {
          assert.equal(params.get('from'), closePeriod.startDate);
          assert.equal(params.get('to'), closePeriod.endDate);
        }
        return { body: { entries: [] } };
      }
      const { lines } = request.postDataJSON();
      assert.equal(lines[0].accountId, 'office');
      assert.equal(lines[0].debitAmount, 1645);
      assert.equal(lines[1].accountId, bank.ledgerAccountId);
      assert.equal(lines[1].creditAmount, 1645);
      return { body: { entry: { id: 'paid-expense', version: 1 } } };
    };
    api['/accounting/periods/open'] = (request) => {
      assert.ok(parishTier);
      assert.deepEqual(request.postDataJSON(), { periodId: 'nov', expectedVersion: 1 });
      Object.assign(november, { status: 'open', version: 2 });
      return { body: { ok: true, period: november } };
    };
    api['/accounting/journals/paid-expense/validate'] = { body: { validation: { ok: true } } };
    api['/accounting/journals/paid-expense/post'] = () => {
      expensePosted = true;
      return { body: { ok: true } };
    };
    const fixture = await openParishFixture(
      browser,
      () => ({
        parish: { ...parish, accountingAvailable: true, entitlements: { modules: { accounting: { included: true } } } },
      }),
      api
    );
    try {
      const { page, context } = fixture;
      await context.addInitScript(() => {
        sessionStorage.setItem(
          'agapay.accountingStaff.synthetic-parish',
          JSON.stringify({
            profile: { id: 'test-treasurer' },
            token: 'synthetic-token',
            expiresAt: '2099-01-01T00:00:00Z',
          })
        );
      });
      await page.clock.setFixedTime(new Date('2026-11-24T18:00:00Z'));
      await fixture.open();
      await page.locator('#nav-accounting').click();
      const pane = page.locator('#accountingPane');
      await pane.getByRole('heading', { name: 'Record activity' }).waitFor();
      const postingPeriods = pane.getByRole('region', { name: 'Posting periods', exact: true });
      await postingPeriods.getByText('November 2026 · Unopened', { exact: true }).waitFor();
      assert.equal(await postingPeriods.getByRole('button', { name: 'Open November 2026', exact: true }).isVisible(), parishTier);
      assert.equal(await page.locator('[data-accounting-view]:visible').count(), 1);
      const workspaceNav = page.getByRole('navigation', { name: 'Accounting workspaces' });
      assert.equal(await workspaceNav.getByRole('button').count(), 8);
      assert.equal(await workspaceNav.getByRole('button', { name: 'More tools' }).count(), 0);
      await pane.getByText('1 in progress', { exact: true }).waitFor();
      await pane.getByText(parishTier ? 'No close in progress' : 'Status unavailable', { exact: true }).waitFor();
      await pane.getByText('$1,560.00', { exact: true }).waitFor();
      assert.equal(await pane.getByRole('button', { name: 'Enter a bill' }).count(), parishTier ? 1 : 0);
      assert.equal(await pane.getByRole('button', { name: 'Budget vs. actual' }).count(), parishTier ? 1 : 0);
      assert.equal(await page.locator('[data-accounting-view="funds"]').count(), 0);
      await pane.getByRole('heading', { name: 'Fund balances' }).waitFor();
      await pane.locator('.acct-fund-bars').getByText('$940.00', { exact: true }).waitFor();
      const jumpNav = page.getByRole('navigation', { name: 'On this page' });
      if (!parishTier) await page.setViewportSize({ width: 390, height: 900 });
      for (const [label, section] of [
        ['Record activity', 'activity'],
        ['Financial summary', 'summary'],
        ['Fund balances', 'funds'],
        ['Month-end checklist', 'month-end'],
        ['Reports', 'reports'],
        ['Fund directory', 'directory'],
        ['Chart of accounts', 'accounts'],
      ]) {
        await jumpNav.getByRole('button', { name: label, exact: true }).click();
        const destination = pane.locator(`[data-accounting-overview-section="${section}"]`);
        assert.equal(await destination.evaluate((element) => element.contains(document.activeElement)), true);
        assert.equal(await destination.evaluate((element) => !(element instanceof HTMLDetailsElement) || element.open), true);
        const heading = destination.locator('summary, h2, h3').first();
        const box = (await heading.count()) ? await heading.boundingBox() : await destination.boundingBox();
        const header = await page.locator('.acct-suite-header').boundingBox();
        assert.ok(box && header && box.y >= header.y + header.height - 1, `${label} must land below the sticky header`);
      }
      if (!parishTier) await page.setViewportSize({ width: 1280, height: 720 });
      await pane.getByRole('button', { name: 'Assets', exact: false }).click();
      await pane.locator('.acct-fund-account-group-body').getByText(bank.name, { exact: true }).waitFor();
      assert.equal(await pane.getByText('Retired building fund', { exact: true }).count(), 0);
      await pane.getByRole('button', { name: 'Show archived & unused' }).click();
      await pane.getByText('Retired building fund', { exact: true }).waitFor();
      await pane.getByRole('button', { name: 'Open fund report', exact: true }).click();
      await pane.getByRole('heading', { name: 'Balance Sheet by Fund', exact: true }).waitFor();
      assert.equal(await jumpNav.isVisible(), false);
      await page.getByRole('button', { name: 'Back to overview', exact: true }).click();
      await pane.getByRole('searchbox', { name: 'Find a report' }).fill('cash flows');
      await pane.getByRole('button', { name: /Statement of Cash Flows/ }).waitFor();
      assert.equal(await pane.getByRole('heading', { name: 'Record activity' }).isVisible(), true);
      await pane.getByRole('searchbox', { name: 'Find a report' }).fill('');
      await pane.getByRole('button', { name: 'Record a non-cash gift' }).click();
      await pane.getByRole('heading', { name: 'Put a donated item on the books' }).waitFor();
      await page.getByRole('button', { name: 'Back to overview', exact: true }).click();
      if (parishTier) await pane.getByText('Checking bills…').waitFor();

      if (!parishTier) {
        await pane.getByRole('button', { name: 'Record a deposit' }).click();
        await pane.getByRole('heading', { name: 'Set up your deposit account' }).waitFor();
        const add = pane.locator('form[onsubmit="createAccountingBankAccount(event)"]');
        await add.locator('[name="name"]').fill(bank.name);
        await add.locator('[name="ledgerAccountId"]').selectOption(bank.ledgerAccountId);
        await add.getByRole('button', { name: 'Save bank account' }).click();
        await pane.getByRole('heading', { name: 'Record a deposit' }).waitFor();
        assert.equal(await pane.locator('[name="depositAccountId"]').inputValue(), bank.ledgerAccountId);
        await page.getByRole('button', { name: 'Back to overview', exact: true }).click();
        await pane.getByRole('button', { name: 'Manage bank accounts' }).click();
        await pane.getByRole('button', { name: 'Edit bank account' }).click();
        await pane.locator('[name="institutionName"]').fill('Parish Credit Union');
        await pane.getByRole('button', { name: 'Save bank account' }).click();
        await pane.getByText('Parish Credit Union', { exact: true }).waitFor();
        await pane.getByRole('button', { name: 'Add bank account', exact: true }).click();
        await add.locator('[name="name"]').fill(savings.name);
        await add.locator('[name="accountType"]').selectOption('savings');
        await add.locator('[name="ledgerAccountId"]').selectOption(savings.ledgerAccountId);
        await add.getByRole('button', { name: 'Save bank account' }).click();
        await pane.getByText('Savings', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Back to overview', exact: true }).click();
      }
      await pane.getByRole('button', { name: 'Match bank statements' }).click();
      await pane.getByRole('heading', { name: 'Match a bank statement' }).waitFor();
      await pane.getByRole('heading', { name: 'Import bank activity' }).waitFor();
      await page.locator('#accountingHomeContext').getByRole('heading', { name: 'Record activity' }).waitFor();
      assert.equal(
        await page.locator('[data-accounting-view][aria-current="page"]').getAttribute('data-accounting-view'),
        'overview'
      );
      if (parishTier) {
        const response = page.waitForResponse((res) => res.url().endsWith('/accounting/payables/overview'));
        finishBills();
        await response;
        await pane.getByRole('heading', { name: 'Match a bank statement' }).waitFor();
      }
      await pane.getByRole('button', { name: 'Review matches', exact: true }).click();
      await pane.getByText('Bank offering deposit', { exact: true }).waitFor();
      await pane.getByRole('button', { name: 'Confirm match', exact: true }).click();
      await pane
        .locator('.acct-statement-review')
        .getByText('This match changed. Review the entries and try again.')
        .waitFor();
      await pane.getByRole('button', { name: 'Confirm match', exact: true }).click();
      page.once('dialog', (dialog) => dialog.accept());
      await pane.getByRole('button', { name: 'Mark statement reconciled' }).click();
      await pane.getByText('completed', { exact: true }).waitFor();
      assert.ok(matched && completed);
      await page.getByRole('button', { name: 'Back to overview', exact: true }).click();
      await pane.getByRole('button', { name: 'Record a transfer' }).click();
      await pane.locator('select[name="fromAccountId"]').selectOption(bank.ledgerAccountId);
      await pane.locator('select[name="toAccountId"]').selectOption(bank.ledgerAccountId);
      await pane.getByLabel('Amount', { exact: true }).fill('25.00');
      await pane.getByRole('button', { name: 'Save transfer' }).click();
      await pane.getByText('Choose two different bank accounts.', { exact: true }).waitFor();
      await pane.locator('select[name="toAccountId"]').selectOption(savings.ledgerAccountId);
      await pane.getByRole('button', { name: 'Save transfer' }).click();
      await pane
        .getByText('Transfer recorded. It will appear in both bank accounts for reconciliation.', { exact: true })
        .waitFor();
      await page.getByRole('button', { name: 'Back to overview', exact: true }).click();
      if (parishTier) {
        await pane.getByText('2 awaiting approval · $345.00 unpaid on posted bills').waitFor();
        await pane.getByRole('button', { name: 'Enter a bill' }).click();
        await pane.getByRole('heading', { name: 'Record a vendor bill' }).waitFor();
        await pane.getByRole('button', { name: 'Save draft bill' }).waitFor();
        await pane.getByText('Another approver is needed').waitFor();
        assert.equal(await pane.getByRole('button', { name: 'Approve bill', exact: true }).count(), 1);
        await page.locator('[data-accounting-view="overview"]').click();
        await pane.getByRole('button', { name: 'Budget vs. actual' }).click();
        await pane.getByRole('heading', { name: 'Budget to Actual', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Overview', exact: true }).click();
      }

      await pane.getByRole('button', { name: 'Prepare a council packet' }).click();
      await pane.getByLabel('From', { exact: true }).fill('2026-01-01');
      await pane.getByLabel('Through', { exact: true }).fill('2026-10-31');
      await pane.getByRole('button', { name: 'Prepare packet', exact: true }).click();
      await pane.getByRole('heading', { name: 'Parish council financial packet' }).waitFor();
      assert.equal(await pane.getByText('Parish plan · Version 2').count(), parishTier ? 1 : 0);
      const printed = page.waitForEvent('popup');
      await pane.getByRole('button', { name: 'Print packet', exact: true }).click();
      const printWindow = await printed;
      await printWindow.getByRole('heading', { name: 'Fund balances' }).waitFor();
      await printWindow.close();
      await page.getByRole('button', { name: 'Back to overview', exact: true }).click();
      if (parishTier) {
        await pane.getByRole('button', { name: 'Close the books' }).click();
        await pane.getByRole('button', { name: 'Start month-end checklist' }).click();
        await pane.getByText('Match all bank statements', { exact: true }).waitFor();
        assert.equal(await pane.getByRole('button', { name: 'Complete close', exact: true }).count(), 0);
        await page.getByRole('button', { name: 'Overview', exact: true }).click();
        const monthEnd = pane.getByRole('region', { name: 'Month-end checklist' });
        await monthEnd.getByText('2 of 5 resolved', { exact: true }).waitFor();
        await monthEnd.getByRole('button', { name: /Match bank statements.*Needs attention/ }).waitFor();
        await monthEnd.getByRole('button', { name: 'Open close checks' }).click();
        await pane.getByText('Match all bank statements', { exact: true }).waitFor();
        const closeContext = page.locator('#accountingCloseContext');
        await pane.getByRole('button', { name: 'Match bank statements', exact: true }).click();
        await pane.getByRole('heading', { name: 'Match a bank statement' }).waitFor();
        assert.equal(await pane.locator('input[name="startDate"]').inputValue(), closePeriod.startDate);
        assert.equal(await workspaceNav.getByRole('button', { name: 'Close the books' }).getAttribute('aria-current'), 'page');
        await closeContext.getByRole('button', { name: 'Recheck and return' }).click();
        await pane.getByText('Match all bank statements', { exact: true }).waitFor();
        await pane.getByRole('button', { name: 'Review journal entries', exact: true }).click();
        await pane.getByText('No unposted entries', { exact: true }).waitFor();
        await closeContext.getByRole('button', { name: 'Back to checklist' }).click();
        await pane.getByText('Match all bank statements', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Overview', exact: true }).click();
      }
      await pane.getByRole('region', { name: 'Recent activity' }).getByText('Recent foundation deposit', { exact: true }).waitFor();
      await pane.getByRole('button', { name: 'Record a paid expense' }).click();
      await pane.getByRole('heading', { name: 'Tell us what you paid for' }).waitFor();
      await pane.getByLabel('Paid to', { exact: true }).fill('Office store');
      await pane.getByLabel('Amount', { exact: true }).fill('16.45');
      await pane.locator('select[name="offsetAccountId"]').selectOption('office');
      await pane.getByRole('button', { name: 'Record expense', exact: true }).click();
      await pane.getByText('$16.45 expense recorded.', { exact: true }).waitFor();
      assert.ok(expensePosted);
      await page.getByRole('button', { name: 'Back to overview', exact: true }).click();
      await pane.getByRole('button', { name: 'Record a deposit' }).click();
      await pane.getByRole('heading', { name: 'Record a deposit' }).waitFor();
      assert.equal(await pane.getByLabel('Where did the money go?').inputValue(), 'bank-ledger');
      const depositDate = pane.locator('input[name="entryDate"]');
      const postingStatus = pane.locator('#depositPostingPeriodStatus');
      const openNovember = pane.getByRole('button', { name: 'Open November 2026', exact: true });
      await depositDate.fill('2026-10-23');
      await postingStatus.getByText('October 2026 · Locked', { exact: true }).waitFor();
      await depositDate.fill('2026-11-23');
      await postingStatus.getByText('November 2026 · Unopened', { exact: true }).waitFor();
      assert.equal(await openNovember.isVisible(), parishTier);
      if (parishTier) {
        const description = pane.locator('input[name="description"]');
        await description.fill('Foundation grant');
        page.once('dialog', (dialog) => dialog.accept());
        await openNovember.click();
        await postingStatus.getByText('November 2026 · Open', { exact: true }).waitFor();
        assert.equal(await depositDate.inputValue(), '2026-11-23');
        assert.equal(await description.inputValue(), 'Foundation grant');
      } else {
        await postingStatus.getByText(/Ask your treasurer or rector/).waitFor();
      }
      const splitFunds = pane.getByRole('button', { name: 'Split this deposit across funds', exact: true });
      const splitBank = pane.locator('summary').filter({ hasText: 'Split this check between two bank accounts' });
      const secondBank = pane.getByLabel('Second bank account');
      assert.ok(await splitFunds.isVisible());
      assert.ok(await splitBank.isVisible());
      assert.equal(await secondBank.isVisible(), false);
      await splitBank.press('Enter');
      await secondBank.waitFor();
      await splitBank.press('Enter');
      assert.equal(await secondBank.isVisible(), false);
      await splitFunds.press('Enter');
      const total = pane.getByLabel('Total deposit amount');
      assert.ok(await total.evaluate((element) => element === document.activeElement));
      assert.equal(await splitFunds.isVisible(), false);
      await pane.getByRole('button', { name: 'Use one allocation', exact: true }).press('Enter');
      assert.ok(await splitFunds.evaluate((element) => element === document.activeElement));
      await page.getByRole('button', { name: 'Overview', exact: true }).click();
      await pane.getByRole('button', { name: 'View posting periods', exact: true }).click();
      await pane.getByRole('heading', { name: 'Posting periods', exact: true }).waitFor();
      await pane
        .getByRole('listitem')
        .filter({ hasText: 'October 2026' })
        .getByText('Locked', { exact: true })
        .waitFor();
      await page.getByRole('button', { name: 'Overview', exact: true }).click();
      await pane.getByRole('button', { name: 'Income and expenses' }).click();
      await pane.locator('input[name="start"]').waitFor();

      await workspaceNav.getByRole('button', { name: 'Funds & assets' }).click();
      await pane.getByRole('button', { name: 'Fixed assets & depreciation' }).waitFor();
      await workspaceNav.getByRole('button', { name: 'Money in & out' }).click();
      await page.locator('[data-accounting-view="ledger"]').click();
      await pane.locator('.acct-register-hero').waitFor();
      await page.getByRole('button', { name: 'Accountant view' }).click();
      await page.getByRole('button', { name: 'Overview', exact: true }).click();
      await pane.locator('.acct-suite-stats').waitFor();

      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Treasurer view' }).click();
      assert.ok(await pane.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
      await pane.getByRole('button', { name: 'Record a deposit' }).click();
      await splitFunds.waitFor();
      await splitBank.click();
      await secondBank.waitFor();
      assert.ok(
        await pane.locator('.acct-simple-income').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
      );
      fixture.assertClean();
    } finally {
      await fixture.close();
    }
  }
} finally {
  finishBills();
  await browser.close();
}

console.log(
  'PASS - Treasurer home displays current statuses and opens bank statements, income, and reports independently.'
);
