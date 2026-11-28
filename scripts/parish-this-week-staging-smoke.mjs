import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { stagingParishSession } from './lib/staging-parish-session.mjs';

const baseUrl = 'https://agapay-site-staging.joeldunnesq.workers.dev';
const [expectedBuild] = process.argv.slice(2);
assert.match(expectedBuild, /^[0-9a-f]{40}$/);

function get(path, headers = {}) {
  return fetch(baseUrl + path, { headers, redirect: 'error', signal: AbortSignal.timeout(20000) });
}

const health = await (await get('/api/health')).json();
assert.equal(health.ok, true);
assert.equal(health.version, expectedBuild, 'Staging must serve the exact release candidate.');

const dashboard = await get('/parish/dashboard');
assert.equal(dashboard.status, 200);
const html = await dashboard.text();
assert.match(html, /id="parishWeekPanel"/);
assert.match(html, /data-ministries-view="teams"/);
for (const asset of ['/parish/features/this-week.js', '/parish/this-week.css']) {
  assert.ok(html.includes(asset));
  assert.equal((await get(asset)).status, 200);
}

const {
  ACCOUNTING_GATE_PARISH_A_ID: parishId,
  ACCOUNTING_GATE_PARISH_B_ID: otherParishId,
  ACCOUNTING_GATE_USER_A_EMAIL: email,
  ACCOUNTING_GATE_USER_A_PASSWORD: password,
  ACCOUNTING_GATE_USER_A_TOTP_SECRET: totpSecret,
} = process.env;
assert.ok(parishId && otherParishId && parishId !== otherParishId && email && password && totpSecret);
const { identityToken, parishToken } = await stagingParishSession({
  baseUrl, parishId, email, password, totpSecret, includeIdentity: true,
  label: 'Ministries staging parish',
});
assert.ok(identityToken && parishToken);
const dashboardPath = '/api/parish/dashboard/' + encodeURIComponent(parishId);
const dashboardData = await get(dashboardPath, { Authorization: 'Bearer ' + parishToken });
assert.equal(dashboardData.status, 200);
const { parish } = await dashboardData.json();
assert.equal(parish.parishLifeAvailable, true);
assert.equal(parish.entitlements.modules.communications.included, true);

const weekPath = dashboardPath + '/this-week';
const headers = { Authorization: 'Bearer ' + identityToken, 'X-AGAPAY-User-Email': email };
const week = await get(weekPath, headers);
assert.equal(week.status, 200, 'The signed-in staging staff account should load This Week.');
assert.match(week.headers.get('Cache-Control'), /private, no-store/);
const data = await week.json();
assert.match(data.weekStart, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(new Date(data.weekStart).getUTCDay(), 1);
assert.equal(new Date(data.weekEnd).getUTCDay(), 0);
assert.ok(Array.isArray(data.events) && Array.isArray(data.serving));
const adjacentWeek = new Date(Date.parse(data.weekStart) - 7 * 86400000).toISOString().slice(0, 10);
const previous = await get(weekPath + '?week=' + adjacentWeek, headers);
assert.equal(previous.status, 200);
assert.equal((await previous.json()).weekStart, adjacentWeek);
assert.equal((await get(weekPath)).status, 401);
const otherWeek = await get('/api/parish/dashboard/' + encodeURIComponent(otherParishId) + '/this-week', headers);
assert.equal(otherWeek.status, 401);
const evidence = {
  build: health.version,
  featureAssets: 'present',
  week: week.status,
  previousWeek: previous.status,
  anonymous: 401,
  otherParish: otherWeek.status,
  events: data.events.length,
  servingSlots: data.serving.length,
};
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/parish-week-staging-smoke.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence));
