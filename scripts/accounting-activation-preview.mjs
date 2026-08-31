// Local-only browser fixture. No Cloudflare credentials or production requests.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { activationTestDatabase } from './lib/accounting-activation-fixture.mjs';
import {
  applyAccountingMigration,
  initializeProvisionedCalendar,
  prepareAccountingMigrationLedger,
  seedBeforeIntegrationMigration,
} from '../src/accounting/provisioning/full-schema.js';
import { previewActivationChart, commitActivationChart } from '../src/accounting/provisioning/chart-import.js';
import { createMigrationSession, listMigrationSessions } from '../src/accounting/migration/service.js';

const db = activationTestDatabase(),
  actor = { id: 'fixture-treasurer', capabilities: ['accounting.configure', 'accounting.migration.import'] };
await prepareAccountingMigrationLedger(db);
for (const item of JSON.parse(readFileSync('accounting-migrations/manifest.json', 'utf8')).migrations) {
  const migration = { ...item, sql: readFileSync(`accounting-migrations/${item.name}`, 'utf8') };
  await applyAccountingMigration(db, migration);
  await seedBeforeIntegrationMigration(db, migration);
}
await initializeProvisionedCalendar(db, { startDate: '2026-08-30', fiscalYearStartMonth: 1 }, 'local-preview');
let activation = { available: true, status: 'not_started', step: 'queued', completed: false },
  profiles = [],
  ticks = 0;
const shell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Accounting activation · Local preview</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"><link rel="stylesheet" href="/parish/style.css"><link rel="stylesheet" href="/parish/redesign.css"><link rel="stylesheet" href="/parish/accounting-activation.css"><style>body{padding:30px;background:var(--cream);font-family:var(--sans)}.preview-wrap{max-width:1100px;margin:auto}.preview-controls{display:flex;gap:15px;align-items:center;margin-bottom:20px;font-size:12px}.preview-controls a{color:var(--deep)}#accountingTierLabel,#accountingTierCopy,#accountingParishName{display:none}body:has(#mobile:checked) .preview-wrap{max-width:390px}</style></head><body><div class="preview-wrap"><nav class="preview-controls"><b>LOCAL TEST FIXTURE</b><a href="/">Welcome</a><a href="/?state=ready">Import</a><a href="/?state=failed">Paused</a><a href="/?state=preview">CSV preview</a><label><input id="mobile" type="checkbox">Narrow layout</label></nav><span id="accountingTierLabel"></span><span id="accountingTierCopy"></span><span id="accountingParishName"></span><div id="accountingPane"></div></div><script>
const currentParish={parishId:'parish-a',name:'Test Orthodox Mission',accountingAvailable:true};
window.ParishFeatureRegistry={register(){}};
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}const escapeAttr=escapeHtml;
function authHeaders(){return {}}function accountingStaffSessionKey(){return 'fixture-staff'}
function accountingStaffSession(){return location.search.includes('state=ready')||location.search.includes('state=preview')||sessionStorage.getItem(accountingStaffSessionKey())}
async function loadAccountingTab(){if(!await accountingActivationGuard(document.getElementById('accountingPane')))document.getElementById('accountingPane').innerHTML='<h2>Books are ready</h2><p>Account setup complete. Opening balances remain pending.</p>'}
</script><script src="/parish/features/accounting/migration.js"></script><script src="/parish/features/accounting/activation.js"></script><script src="/parish/features/accounting.js"></script><script>
loadAccountingTab();
</script></body></html>`;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
      const state = url.searchParams.get('state');
      activation = {
        available: true,
        status: state === 'failed' ? 'failed' : ['ready', 'preview'].includes(state) ? 'ready' : 'not_started',
        step: state === 'failed' ? 'schema' : 'queued',
        migrationCount: 8,
        reference: 'LOCAL-FIXTURE',
        retryable: true,
        message: 'A simulated interruption. Your books are preserved.',
        completed: false,
      };
      if (state === 'preview') {
        const input = {
          filename: 'Aplos.csv',
          csv: 'Account Number,Account Name,Account Type,Balance\n91250,Parish equipment,Fixed Asset,2500\n96900,Altar supplies,Expense,0\n1010,Operating Checking,Bank,32000',
        };
        const preview = await previewActivationChart(db, { actor, ...input });
        const preload = `accountingActivation.parishId=currentParish.parishId;accountingActivation.import=${JSON.stringify({ ...input, preview, typeMap: preview.selectedTypeMap, columnMap: preview.columnMap, sourceSystem: 'aplos' })};`;
        res.setHeader('Content-Type', 'text/html');
        res.end(shell.replace('loadAccountingTab();', preload + 'loadAccountingTab();'));
        return;
      }
      res.setHeader('Content-Type', 'text/html');
      res.end(shell);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      let result;
      if (url.pathname.endsWith('/activation/start')) {
        ticks = 0;
        activation = { ...activation, status: 'running', step: 'database', options: body };
        result = activation;
      } else if (url.pathname.endsWith('/activation')) {
        if (activation.status === 'running') {
          activation.step = ['schema', 'calendar', 'funds', 'validation', 'ready'][Math.min(ticks++, 4)];
          if (activation.step === 'ready') activation.status = 'ready';
        }
        result = activation;
      } else if (url.pathname.endsWith('/profiles')) result = { accounting: { ready: true }, profiles };
      else if (url.pathname.endsWith('/bootstrap')) {
        const profile = { id: 'staff-local', displayName: body.displayName, roleTemplate: body.roleTemplate };
        profiles = [profile];
        result = { profile };
      } else if (url.pathname.endsWith('/verify'))
        result = { token: 'local-fixture-only', profile: profiles[0], expiresAt: '2099-01-01' };
      else if (url.pathname.endsWith('/sessions'))
        result =
          req.method === 'POST'
            ? {
                session: await createMigrationSession(db, {
                  actor,
                  entitlementTier: 'parish',
                  sourceSystem: body.sourceSystem,
                }),
              }
            : { sessions: await listMigrationSessions(db, { actor, entitlementTier: 'parish' }) };
      else if (url.pathname.endsWith('/chart/preview'))
        result = { preview: await previewActivationChart(db, { ...body, actor }) };
      else if (url.pathname.endsWith('/chart/commit'))
        result = { result: await commitActivationChart(db, { ...body, actor }) };
      else if (url.pathname.endsWith('/activation/complete')) {
        activation.completed = true;
        result = { ok: true };
      } else {
        res.statusCode = 404;
        result = { error: 'Fixture route not found' };
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return;
    }
    const publicRoot = path.resolve('public'),
      file = path.resolve(publicRoot, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(publicRoot + path.sep)) throw new Error('Invalid path');
    res.setHeader(
      'Content-Type',
      file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream'
    );
    res.end(readFileSync(file));
  } catch (error) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error.message }));
  }
});
server.listen(8792, '127.0.0.1', () => console.log('Local wizard fixture: http://127.0.0.1:8792'));
