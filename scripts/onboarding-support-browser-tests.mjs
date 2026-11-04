import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import ts from 'typescript';
import { transform } from 'esbuild';
import { accountingNativeFixture } from './lib/accounting-native-fixture.mjs';
import { accountingOnboardingJourney } from '../src/accounting/onboarding/service.js';
import { saveOnboardingReview } from '../src/accounting/onboarding/evidence.js';
import {
  submitParishSupportTicket,
  listParishSupportTickets,
  updateParishSupportTicket,
} from '../src/lib/parish-support-tickets.js';
const { db, sqlite, actor } = await accountingNativeFixture(),
  browser = await chromium.launch({ headless: true });
const values = new Map(),
  env = {
    AGAPAY_REGISTRATIONS: {
      get: async (k) => values.get(k) || null,
      put: async (k, v) => values.set(k, v),
      list: async ({ prefix = '' }) => ({
        keys: [...values.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
      }),
    },
  };
const html = await readFile('public/parish/dashboard.html', 'utf8'),
  dialogStart = html.indexOf('<dialog id="parishSupportDialog"'),
  dialogEnd = html.indexOf('</dialog>', dialogStart) + 9,
  dialog = html.slice(dialogStart, dialogEnd);
await mkdir('artifacts/onboarding-operations/screenshots', { recursive: true });
let posts = 0;
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://onboarding.test/**', async (route) => {
    const u = new URL(route.request().url()),
      p = u.pathname;
    if (p === '/')
      return route.fulfill({
        contentType: 'text/html',
        body:
          '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/parish/redesign.css"><link rel="stylesheet" href="/parish/accounting-reports.css"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f6f3ec;color:#173a47;font:16px Arial}main{max-width:1280px;margin:auto}button,input,textarea,select{font:inherit}dialog textarea{width:100%;min-height:90px}dialog input,dialog select{max-width:100%}</style></head><body><main id="accountingPane"></main>' +
          dialog +
          '</body></html>',
      });
    if (p === '/api/admin/parish-support-tickets')
      return route.fulfill({ json: { ok: true, tickets: await listParishSupportTickets(env) } });
    if (p.startsWith('/api/admin/parish-support-tickets/'))
      return route.fulfill({
        json: await updateParishSupportTicket(
          env,
          { actor: 'synthetic-support-owner' },
          p.split('/').at(-1),
          route.request().postDataJSON()
        ),
      });
    if (p === '/api/onboarding' || p.startsWith('/api/onboarding/reviews/')) {
      if (route.request().method() === 'POST') {
        posts++;
        await saveOnboardingReview(db, actor, p.split('/').at(-1), route.request().postDataJSON());
      }
      return route.fulfill({
        json: { ok: true, journey: await accountingOnboardingJourney(db, actor, 'advanced_operations') },
      });
    }
    if (p === '/api/parish/dashboard/synthetic-journey') {
      const result = await submitParishSupportTicket(
        env,
        new Request('https://agapay.app' + p),
        { parishId: 'synthetic-journey', parishName: 'Synthetic parish' },
        route.request().postDataJSON()
      );
      return route.fulfill({ json: result });
    }
    try {
      return route.fulfill({
        body: await readFile('public' + p),
        contentType: p.endsWith('.js') ? 'text/javascript' : 'text/css',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto('https://onboarding.test/');
  await page.evaluate(() => {
    window.currentParish = { parishId: 'synthetic-journey' };
    window.activeTab = 'accounting';
    window.accountingView = 'overview';
    window.accountingApi = (p) => '/api' + p;
    window.authHeaders = () => ({});
    window.escapeHtml = (v) =>
      String(v ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
      );
    window.escapeAttr = window.escapeHtml;
    window.jsAttr = window.escapeHtml;
    window.readable = (v) => String(v || '').replaceAll('_', ' ');
    window.shortDate = (v) => String(v || '');
    window.handleAuthFailure = () => false;
    window.setStatus = () => {};
    window.renderAccountingPane = () => {};
    window.setAccountingView = (v) => {
      window.__lastView = v;
    };
    window.openAccountingMigration = () => {
      window.__lastView = 'migration';
    };
  });
  const source = await readFile('src/browser/parish/app-session-and-navigation.ts', 'utf8'),
    ast = ts.createSourceFile('navigation.ts', source, ts.ScriptTarget.Latest, true),
    names = new Set(['openParishSupportTicket', 'closeParishSupportTicket', 'submitParishSupportTicket']);
  const functions = ast.statements
    .filter((n) => ts.isFunctionDeclaration(n) && names.has(n.name?.text))
    .map((n) => n.getText(ast))
    .join('\n');
  await page.addScriptTag({ content: (await transform(functions, { loader: 'ts', target: 'es2022' })).code });
  await page.addScriptTag({ url: '/parish/accounting-journey.js' });
  await page.evaluate(() => openAccountingJourney());
  await page.getByRole('heading', { name: 'Your parish setup journey' }).waitFor();
  assert.match(await page.locator('.acct-journey').innerText(), /Needs attention|Next step/i);
  assert.equal(posts, 0, 'Reading setup never saves reviews');
  const fiscal = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Confirm your fiscal year' }) });
  await fiscal.getByRole('button', { name: 'Review fiscal settings' }).click();
  assert.equal(await page.evaluate(() => window.__lastView), 'settings');
  await fiscal.getByRole('textbox').fill('Checked synthetic fiscal-year dates against the parish records.');
  await fiscal.getByRole('button', { name: 'Save review' }).click();
  await page
    .locator('article')
    .first()
    .getByText(/1 · complete/i)
    .waitFor();
  assert.equal(posts, 1);
  await page.locator('article').first().locator('details summary').click();
  await page.evaluate(() => {
    window.currentParish = { parishId: 'another-parish' };
  });
  await page.locator('article').first().getByRole('button', { name: 'Save review' }).click();
  await page.getByText('Parish changed. Reopen guided setup before saving.').waitFor();
  assert.equal(posts, 1);
  await page.evaluate(() => {
    window.currentParish = { parishId: 'synthetic-journey' };
  });
  const bank = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Connect a bank ledger account' }) });
  await bank.getByRole('button', { name: 'Open bank reconciliation' }).click();
  assert.equal(await page.evaluate(() => window.__lastView), 'banking');
  await page.evaluate(() => openAccountingJourney());
  await page.screenshot({
    path: 'artifacts/onboarding-operations/screenshots/guided-setup-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Submit a support ticket', exact: true }).click();
  await page.getByRole('heading', { name: 'How can we help?' }).waitFor();
  assert.match(await page.locator('dialog').innerText(), /16 business hours/);
  await page.locator('#parishSupportSubject').fill('Synthetic onboarding help');
  await page
    .locator('#parishSupportMessage')
    .fill('Please explain this synthetic setup review. This is a browser fixture, not a real support request.');
  await page.getByRole('button', { name: 'Send ticket', exact: true }).click();
  await page
    .locator('#parishSupportStatus')
    .getByText(/Your ticket was created/)
    .waitFor();
  assert.match(await page.locator('#parishSupportStatus').innerText(), /parish_support/);
  assert.match(await page.locator('#parishSupportStatus').innerText(), /Response due by/);
  assert.equal(
    await page.locator('#parishSupportDialog').evaluate((d) => d.open),
    true,
    'Keep the ticket reference visible'
  );
  await page.screenshot({
    path: 'artifacts/onboarding-operations/screenshots/support-ticket-confirmation.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const adminSource = await readFile('src/browser/admin/app-learn-and-support.ts', 'utf8'),
    adminAst = ts.createSourceFile('admin.ts', adminSource, ts.ScriptTarget.Latest, true),
    adminNames = new Set(['renderParishSupportTickets', 'loadParishSupportTickets', 'updateParishSupportTicket']);
  await page.addScriptTag({
    content: (
      await transform(
        adminAst.statements
          .filter((n) => ts.isFunctionDeclaration(n) && adminNames.has(n.name?.text))
          .map((n) => n.getText(adminAst))
          .join('\n'),
        { loader: 'ts', target: 'es2022' }
      )
    ).code,
  });
  await page.evaluate(() => {
    const queue = document.createElement('section');
    queue.id = 'parishSupportTicketQueue';
    document.body.append(queue);
  });
  await page.evaluate(() => loadParishSupportTickets());
  await page
    .locator('#parishSupportTicketQueue')
    .getByText(/First response due/)
    .waitFor();
  await page.locator('#parishSupportTicketQueue').getByRole('button', { name: 'Mark response sent' }).click();
  await page
    .locator('#parishSupportTicketQueue')
    .getByText(/First response recorded/)
    .waitFor();
  assert.equal(
    await page.locator('#parishSupportTicketQueue').getByRole('button', { name: 'Mark response sent' }).count(),
    0
  );
  await page.evaluate(() => document.getElementById('parishSupportTicketQueue').remove());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => openAccountingJourney());
  await page.getByRole('heading', { name: 'Your parish setup journey' }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({
    path: 'artifacts/onboarding-operations/screenshots/guided-setup-mobile.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    'artifacts/onboarding-operations/browser-evidence.json',
    JSON.stringify(
      {
        status: 'passed',
        synthetic: true,
        externalEmailsSent: 0,
        checks: [
          'Real-service setup reviews',
          'Explicit review persistence',
          'Correct fiscal and bank navigation',
          'Dashboard support ticket persists',
          'Ticket reference and business-hour due time remain visible',
          'Mobile layout',
          'No browser exceptions',
        ],
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    'PASS guided onboarding, real review persistence, working action links, persisted dashboard support tickets and visible response targets on desktop/mobile; no emails sent'
  );
} finally {
  await browser.close();
  sqlite.close();
}
