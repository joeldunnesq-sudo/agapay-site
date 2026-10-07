import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const elements = new Map(
  ['gsFiscalYear', 'gsPreviewDonor', 'gsJobProgress', 'gsJobProgressText', 'gsJobHistory'].map((id) => [
    id,
    { value: '', innerHTML: '', textContent: '', hidden: true, dataset: {} },
  ])
);
const button = {
  disabled: false,
  classList: {
    values: new Set(),
    add(v) {
      this.values.add(v);
    },
    remove(v) {
      this.values.delete(v);
    },
  },
};
const requests = [],
  timers = [],
  opened = [],
  revoked = [],
  statuses = [];
let mode = 'success',
  confirmResult = false,
  pollStatus = 'running',
  jobs = [];
const escapeHtml = (v) =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const context = vm.createContext({
  document: { getElementById: (id) => elements.get(id) || null },
  currentParish: { parishId: 'p', entitlements: { givingFeatures: { annualStatements: false } } },
  window: {
    pdxGiversAll: [
      { name: '<img src=x>', email: 'test@example.test' },
      { name: 'No email', email: '' },
    ],
    open: (...args) => opened.push(args),
  },
  Date,
  Number,
  String,
  Array,
  JSON,
  encodeURIComponent,
  escapeHtml,
  shortDate: (v) => String(v || ''),
  authHeaders: () => ({ 'x-parish-session': 'synthetic' }),
  setStatus: (...args) => statuses.push(args),
  confirm: () => confirmResult,
  setTimeout: (fn, ms) => {
    timers.push({ fn, ms });
    return timers.length;
  },
  URL: { createObjectURL: () => 'blob:synthetic', revokeObjectURL: (url) => revoked.push(url) },
  fetch: async (url, init = {}) => {
    assert.equal(init.headers['x-parish-session'], 'synthetic');
    requests.push({ url, ...init });
    const failed = mode === 'failure';
    let data = {};
    if (url.endsWith('/preview')) data = { error: 'Preview <failed>' };
    else if (url.endsWith('/jobs') && init.method === 'POST')
      data = { jobId: 'job /1', totalDonors: 2, error: 'Batch failed' };
    else if (url.endsWith('/jobs')) data = { jobs, error: 'History <failed>' };
    else
      data = {
        status: pollStatus,
        processedDonors: 1,
        totalDonors: 2,
        sentCount: 1,
        failedCount: 0,
        error: 'Poll failed',
      };
    return { ok: !failed, json: async () => data, blob: async () => ({ type: 'application/pdf' }) };
  },
});
vm.runInContext(
  readFileSync(new URL('../public/parish/features/giving/statements.js', import.meta.url), 'utf8'),
  context
);
const flush = () => new Promise((resolve) => setImmediate(resolve));
context.populateGivingStatementsPanel();
assert.equal(requests.length, 0);
context.currentParish.entitlements.givingFeatures.annualStatements = true;
context.populateGivingStatementsPanel();
await flush();
assert.equal((elements.get('gsFiscalYear').innerHTML.match(/<option/g) || []).length, 4);
assert.ok(elements.get('gsFiscalYear').innerHTML.includes(String(new Date().getFullYear() - 1)));
assert.ok(elements.get('gsPreviewDonor').innerHTML.includes('&lt;img'));
assert.equal(requests.length, 1);
context.populateGivingStatementsPanel();
await flush();
assert.equal(requests.length, 1, 'history is initially loaded once');
assert.match(elements.get('gsJobHistory').innerHTML, /No giving-statement batches/);
await context.previewGivingStatement(button);
assert.equal(requests.length, 1);
assert.match(statuses.at(-1)[0], /Choose a tax year and donor/);
elements.get('gsFiscalYear').value = '2025';
elements.get('gsPreviewDonor').value = 'test@example.test';
mode = 'failure';
await context.previewGivingStatement(button);
assert.match(statuses.at(-1)[0], /Preview <failed>/);
assert.equal(button.disabled, false);
assert.equal(button.classList.values.size, 0);
mode = 'success';
await context.previewGivingStatement(button);
assert.equal(opened[0][0], 'blob:synthetic');
assert.equal(opened[0][2], 'noopener');
assert.deepEqual(JSON.parse(requests.at(-1).body), { fiscalYear: 2025, donorEmail: 'test@example.test' });
const cleanup = timers.find((t) => t.ms === 60000);
assert.ok(cleanup);
cleanup.fn();
assert.deepEqual(revoked, ['blob:synthetic']);
timers.length = 0;
const before = requests.length;
await context.startGivingStatementJob(button);
assert.equal(requests.length, before, 'cancel must not create a job');
confirmResult = true;
mode = 'failure';
await context.startGivingStatementJob(button);
assert.match(statuses.at(-1)[0], /Batch failed/);
assert.equal(button.disabled, false);
mode = 'success';
await context.startGivingStatementJob(button);
await flush();
assert.equal(elements.get('gsJobProgress').hidden, false);
assert.ok(requests.some((r) => r.url.endsWith('/jobs/job%20%2F1')));
assert.match(elements.get('gsJobProgressText').textContent, /running.*1\/2.*1 sent/);
assert.equal(timers.filter((t) => t.ms === 3000).length, 1);
const poll = timers.find((t) => t.ms === 3000);
timers.length = 0;
pollStatus = 'completed_with_errors';
jobs = [
  {
    fiscalYear: '<img>',
    status: 'completed_with_errors',
    sentCount: 1,
    totalDonors: 2,
    failedCount: 1,
    createdAt: '2026-10-01',
  },
];
await poll.fn();
await flush();
assert.match(elements.get('gsJobProgressText').textContent, /completed with errors/);
assert.equal(timers.filter((t) => t.ms === 3000).length, 0);
assert.match(elements.get('gsJobHistory').innerHTML, /&lt;img&gt;/);
assert.ok(!elements.get('gsJobHistory').innerHTML.includes('<img>'));
const hide = timers.find((t) => t.ms === 8000);
assert.ok(hide);
hide.fn();
assert.equal(elements.get('gsJobProgress').hidden, true);
timers.length = 0;
mode = 'failure';
await context.pollGivingStatementJob('job /1');
assert.match(elements.get('gsJobProgressText').textContent, /Poll failed/);
assert.equal(timers.length, 0);
await context.loadGivingStatementJobHistory();
assert.match(elements.get('gsJobHistory').innerHTML, /History &lt;failed&gt;/);
context.currentParish = null;
const noParish = requests.length;
await context.previewGivingStatement(button);
await context.startGivingStatementJob(button);
await context.pollGivingStatementJob('job');
await context.loadGivingStatementJobHistory();
assert.equal(requests.length, noParish);
console.log(
  'PASS statements entitlement, one-time history, escaped donors, preview cleanup, cancellation, batch failure/retry, polling cadence/completion and no-parish guards'
);
