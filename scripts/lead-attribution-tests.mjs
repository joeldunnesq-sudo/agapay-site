import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import * as attribution from '../public/attribution-core.js';
import { attributionEmail } from '../src/lib/lead-attribution.js';
import { sanitizePublicRegistrationInput } from '../src/lib/registration-intake.js';
import { d1, d1SetSetting, hasProductionStore, json, missingProductionStoreResponse } from '../src/lib/core.js';
import { htmlEscape } from '../src/lib/format.js';
import { agapayEmailHtml } from '../src/lib/email.js';
import { sendAdminRegistrationNotice } from '../src/lib/parish-notifications.js';

const browserSource = readFileSync('public/attribution.js', 'utf8').replace(/^import .*\n/, '').replace('export function', 'function');
function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), data };
}
function page(url, referrer = '', localStorage = storage()) {
  const context = vm.createContext({ ...attribution, URL, Date,
    window: { location: new URL(url), localStorage }, document: { referrer } });
  vm.runInContext(browserSource, context);
  return context.getAttribution();
}
const base = 'https://agapay.app';
const chatStore = storage();
const chat = page(`${base}/give?utm_source=chatgpt.com`, '', chatStore);
assert.equal(chat.firstTouch.category, 'ChatGPT / Organic AI');
assert.equal(chat.lastTouch.source, 'chatgpt.com');
const directReturn = page(`${base}/contact`, '', chatStore);
assert.equal(directReturn.firstTouch.timestamp, chat.firstTouch.timestamp);
assert.equal(directReturn.firstTouch.category, 'ChatGPT / Organic AI');
assert.equal(directReturn.lastTouch.category, 'Direct');
assert.equal(directReturn.lastTouch.page, `${base}/contact`);
const metaStore = storage();
const metaUrl = `${base}/give?utm_source=facebook&utm_medium=paid&utm_campaign=agapay-give&utm_content=video&utm_term=parish`;
const meta = page(metaUrl, 'https://www.facebook.com/posts/123?private=secret', metaStore);
page(`${base}/about`, metaUrl, metaStore);
const demo = page(`${base}/give/request-demo`, `${base}/about`, metaStore);
assert.equal(demo.firstTouch.category, 'Meta / Paid');
assert.equal(demo.lastTouch.category, 'Meta / Paid');
assert.equal(demo.lastTouch.campaign, 'agapay-give');
assert.equal(demo.lastTouch.term, 'parish');
assert.equal(demo.lastTouch.currentUtms.source, '');
assert.equal(demo.lastTouch.referringUrl, `${base}/about`);
assert.equal(demo.lastTouch.rawReferrer, 'https://www.facebook.com/posts/123');
const decorated = page(`${base}/contact?utm_source=facebook&utm_medium=paid&utm_campaign=agapay-give`, `${base}/about`, metaStore);
assert.equal(decorated.lastTouch.rawReferrer, meta.firstTouch.rawReferrer);
assert.equal(page(base, 'https://www.google.com/search?q=private').firstTouch.category, 'Google / Organic');
assert.equal(page(base).firstTouch.category, 'Direct');
assert.equal(page(base, 'https://www.oca.org/news').firstTouch.category, 'Referral');
assert.equal(page(`${base}?utm_source=outreach&utm_medium=email`).firstTouch.category, 'Email');
assert.equal(page(base, 'https://gemini.google.com/').firstTouch.category, 'Other AI Referral');
assert.equal(page(base, 'https://google.com.evil.example/').firstTouch.category, 'Referral');
const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
assert.equal(page(`${base}?utm_source=chatgpt.com`, '', blocked).firstTouch.category, 'ChatGPT / Organic AI');
const corrupt = storage(); corrupt.setItem('agapay.attribution.first.v1', 'not json');
assert.equal(page(base, '', corrupt).firstTouch.category, 'Direct');
const expired = storage(); expired.setItem('agapay.attribution.first.v1', JSON.stringify({ ...chat.firstTouch, timestamp: '2000-01-01T00:00:00Z' }));
assert.equal(page(base, '', expired).firstTouch.category, 'Direct');
assert.equal(attribution.cleanUrl('javascript:alert(1)'), '');
assert.equal(attribution.cleanUrl('https://user:password@example.com/page?email=private#token'), 'https://example.com/page');
assert.equal(attribution.sanitizeAttribution({ firstTouch: { page: 'bad', timestamp: 'bad' } }), null);
const poisoned = attribution.sanitizeAttribution({ firstTouch: { ...chat.firstTouch, category: 'Injected', campaign: '<img src=x>\nBcc:evil' }, lastTouch: chat.lastTouch });
assert.equal(poisoned.firstTouch.category, 'ChatGPT / Organic AI');
assert.doesNotMatch(poisoned.firstTouch.campaign, /[<>\n]/);
assert.match(attributionEmail(poisoned).html, /Referral Attribution/);
assert.doesNotMatch(attributionEmail(poisoned).html, /<img/);
assert.doesNotMatch(attributionEmail(chat).text, /UTM Campaign:/);
assert.match(attributionEmail(demo).text, /UTM Campaign: agapay-give/);
assert.equal(attributionEmail(null).text, '');
assert.equal(sanitizePublicRegistrationInput({ attribution: demo }).attribution.firstTouch.category, 'Meta / Paid');
assert.equal(sanitizePublicRegistrationInput({ notes: 'Legacy' }).notes, 'Legacy');

// Exercise the actual contact route with SQLite-backed D1 and isolated outbound email.
const worker = readFileSync('src/worker.js', 'utf8');
const route = worker.slice(worker.indexOf('    if (url.pathname === "/api/contact"'), worker.indexOf('    if (url.pathname === "/api/admin/seed-demo"'));
const execute = new (Object.getPrototypeOf(async function () {}).constructor)(
  'request', 'env', 'url', 'json', 'sanitizeAttribution', 'attributionEmail', 'crypto', 'd1', 'd1SetSetting', 'hasProductionStore', 'missingProductionStoreResponse', 'sendEmail', 'agapayEmailHtml', 'htmlEscape', route);
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
const env = { AGAPAY_DB: { prepare(sql) { return { bind(...values) { return { run() { return db.prepare(sql).run(...values); } }; } }; } } };
const emails = [];
async function submit(value, bindings = env) {
  return execute(new Request(`${base}/api/contact`, { method: 'POST', body: JSON.stringify({ name: 'Test', email: 'test@example.com', message: 'Demo please', ...value }) }), bindings, new URL(`${base}/api/contact`), json, attribution.sanitizeAttribution, attributionEmail, crypto, d1, d1SetSetting, hasProductionStore, missingProductionStoreResponse, async (_env, email) => { emails.push(email); return { status: 'sent' }; }, agapayEmailHtml, htmlEscape);
}
assert.equal((await submit({ attribution: demo })).status, 200);
const saved = JSON.parse(db.prepare('SELECT value FROM app_settings').get().value);
assert.equal(saved.attribution.firstTouch.source, 'facebook');
assert.equal(saved.attribution.lastTouch.page, `${base}/give/request-demo`);
assert.equal(saved.attribution.lastTouch.timestamp, saved.submittedAt);
assert.ok(emails[0].to.includes('onboarding@agapay.app'));
assert.match(emails[0].text, /First touch: Meta \/ Paid/);
assert.match(emails[0].html, /Conversion page:/);
assert.equal((await submit({})).status, 200);
assert.equal((await submit({ attribution: { firstTouch: 'broken' } })).status, 200);
const kv = new Map();
assert.equal((await submit({ attribution: directReturn }, { AGAPAY_REGISTRATIONS: { put: (key, value) => kv.set(key, value) } })).status, 200);
assert.equal(JSON.parse([...kv.values()][0]).attribution.lastTouch.category, 'Direct');
const originalFetch = globalThis.fetch;
try {
  let registrationEmail;
  globalThis.fetch = async (_url, options) => {
    registrationEmail = JSON.parse(options.body);
    return new Response('{"id":"local-test"}', { status: 200 });
  };
  await sendAdminRegistrationNotice({ RESEND_API_KEY: 'local-test', AGAPAY_REGISTRATION_NOTIFY_EMAIL: 'hello@agapay.app' }, base,
    { reference: 'TEST', parishName: 'Test', subscriptionTier: 'starter', attribution: attribution.sanitizeAttribution(demo) });
  assert.deepEqual(registrationEmail.to, ['hello@agapay.app', 'onboarding@agapay.app']);
  assert.match(registrationEmail.text, /First touch: Meta \/ Paid/);
  assert.match(registrationEmail.html, /Last touch: Meta \/ Paid/);
  await sendAdminRegistrationNotice({ RESEND_API_KEY: 'local-test' }, base, { reference: 'LEGACY' });
  assert.doesNotMatch(registrationEmail.text, /Referral Attribution/);
} finally { globalThis.fetch = originalFetch; }
db.close();
console.log('PASS - attribution journeys, privacy, storage failures, normalization, legacy submissions, SQLite/KV persistence and contact emails');
