import assert from 'node:assert/strict';
import { dispatchRouteRegistries } from '../src/routes/registry.js';
import { routeAdminRequest } from '../src/routes/admin.js';
import { routePublicRequest } from '../src/routes/public.js';
import { calculateCumulativeGPA, getGPAPoints } from '../src/learn/gpa.js';
import { enabledProductSlugs, assertLearnEnabled } from '../src/learn/access.js';
import { SeedLiturgicalSource, ProductionLiturgicalSource } from '../src/learn/liturgical-source.js';
import { applyPlannerOverrides, computeMoveUnfinishedWork } from '../src/learn/planner-overrides.js';
import {
  invoiceDonationMetadata,
  invoicePaymentIntentId,
  subscriptionSetupUpdates,
} from '../src/payments/donation-events.js';
import { givingCheckoutReturnUrls, normalizeGivingFrequency } from '../src/payments/giving-checkout.js';
import { androidAssetLinks, appleAppSiteAssociation } from '../src/handlers/mobile-app-associations.js';
import { printableCheck } from '../src/accounting/payables/check-printing.js';
import { validateStatisticalTotals } from '../src/reports/diocesan-statistical-totals.js';
import { fiscalCalendar } from '../src/accounting/provisioning/fiscal-calendar.js';
import { actorDto } from '../src/directory/admin-actor.js';

for (const value of [false, 0, '']) {
  let nextCalled = false;
  assert.equal(
    await dispatchRouteRegistries(
      [
        () => value,
        () => {
          nextCalled = true;
          return 'wrong';
        },
      ],
      {}
    ),
    value
  );
  assert.equal(nextCalled, false);
}
assert.equal(await dispatchRouteRegistries([() => undefined, async () => null], {}), null);
const failure = new Error('handler failure');
await assert.rejects(
  dispatchRouteRegistries(
    [
      () => {
        throw failure;
      },
    ],
    {}
  ),
  (error) => error === failure
);
function context(path, method, actions, env = {}) {
  const request = new Request(`https://agapay.test${path}`, { method });
  return { request, env, url: new URL(request.url), actions };
}
let migrated = false;
const disabled = await routeAdminRequest(
  context('/api/admin/migrate-kv-to-d1', 'POST', {
    json: Response.json,
    handleAdminMigrateKvToD1: () => {
      migrated = true;
      return new Response('migration');
    },
  })
);
assert.equal(disabled.status, 403);
assert.equal(migrated, false);
const calls = [];
const profile = await routePublicRequest(
  context('/api/listen/profile', 'GET', {
    requireDonor: async () => ({ householdName: 'Household Name' }),
    json: (body) => {
      calls.push(body);
      return Response.json(body);
    },
  })
);
assert.equal(profile.status, 200);
assert.equal(calls[0].initials, 'HN');
assert.equal(await routePublicRequest(context('/api/unknown', 'GET', {})), null);
assert.deepEqual(enabledProductSlugs(), ['give', 'learn']);
assert.equal(assertLearnEnabled({ AGAPAY_ENABLED_PRODUCTS: 'give' }).status, 404);
assert.equal(getGPAPoints(' a - '), 3.7);
assert.equal(
  calculateCumulativeGPA([
    { credit_hours: '3', grade: { letter_grade: 'A' } },
    { credits: 1, letterGrade: 'B' },
    { credits: 0, letterGrade: 'F' },
  ]),
  '3.75'
);
assert.equal(calculateCumulativeGPA(null), '0.00');
const seed = { liturgicalWeek: { julian: [{ civilDate: '2026-10-14', title: 'Day' }] } };
const source = new SeedLiturgicalSource(seed);
const day = source.getDay({ civilDate: '2026-10-14' });
day.title = 'Changed copy';
assert.equal(seed.liturgicalWeek.julian[0].title, 'Day');
const production = new ProductionLiturgicalSource({
  baseUrl: 'https://calendar.test',
  fetcher: async (url) => {
    assert.equal(url.searchParams.get('calendar'), 'revised-julian');
    return Response.json({ days: seed.liturgicalWeek.julian });
  },
});
assert.equal((await production.listRange({ calendarType: 'new' })).length, 1);
await assert.rejects(
  new ProductionLiturgicalSource({
    baseUrl: 'https://calendar.test',
    fetcher: async () => new Response('', { status: 503 }),
  }).listRange(),
  /503/
);
const row = { id: 'lesson', title: 'Math', statuses: ['planned', 'empty', 'planned'], minutes: [30, 0, 20] };
const moved = computeMoveUnfinishedWork({ rows: [row], rowId: 'lesson', fromWeekday: 0 });
assert.equal(moved.movedToWeekday, 1);
const overrides = applyPlannerOverrides([row], { lesson: { 0: { action: 'reserve', note: 'Later' } } });
assert.equal(overrides.reserveList[0].minutes, 30);
assert.equal(row.statuses[0], 'planned');
assert.equal(overrides.rows[0].statuses[0], 'reserve');
assert.deepEqual(
  invoiceDonationMetadata({
    metadata: { source: 'invoice' },
    lines: { data: [{ metadata: { source: 'line' } }] },
    parent: { subscription_details: { metadata: { source: 'parent' } } },
  }),
  { source: 'parent' }
);
assert.equal(
  invoicePaymentIntentId({
    payments: {
      data: [
        { status: 'failed', payment: { payment_intent: 'pi_wrong' } },
        { status: 'paid', payment: { payment_intent: { id: 'pi_paid' } } },
      ],
    },
  }),
  'pi_paid'
);
assert.equal(subscriptionSetupUpdates({ mode: 'payment' }), null);
assert.equal(normalizeGivingFrequency('annual'), 'yearly');
assert.match(
  givingCheckoutReturnUrls({ appUrl: 'https://agapay.test', parishId: 'a b', source: 'embed' }).successUrl,
  /a%20b/
);
const head = new Request('https://agapay.test/.well-known/assetlinks.json', { method: 'HEAD' });
assert.equal(await androidAssetLinks(head, {}).text(), '');
assert.deepEqual(await androidAssetLinks(new Request(head.url), {}).json(), []);
assert.deepEqual((await appleAppSiteAssociation(new Request(head.url), {}).json()).applinks.details, []);
assert.throws(() => validateStatisticalTotals({ unknown: 1 }), /Unknown/);
assert.throws(() => validateStatisticalTotals({ baptism: -1 }), /whole numbers/);
assert.deepEqual(validateStatisticalTotals({ baptism: 0, wedding: null }), { baptism: 0 });
assert.equal(fiscalCalendar(new Date('2026-01-15T00:00:00Z'), 7).start, '2025-07-01');
assert.equal(fiscalCalendar(new Date('2026-01-15T00:00:00Z'), 7).periods.filter((p) => p.open).length, 1);
const html = printableCheck({
  payment: { checkNumber: '1', paymentDate: '2026-10-14', totalAmount: 12550 },
  prints: [1, 2],
  applications: [],
  vendor: { displayName: '<vendor>' },
  settings: { checkStyle: 'check_only' },
});
assert.match(html, /REPRINT/);
assert.match(html, /&lt;vendor&gt;/);
assert.match(html, /One hundred twenty-five/);
assert.deepEqual(
  actorDto({ user: { id: 'user' }, membership: { parishId: 'parish' }, capabilities: ['directory.review'] }),
  { userId: 'user', actorType: 'platform_user', parishId: 'parish', capabilities: ['directory.review'], personId: '' }
);
console.log('PASS - migrated routing, Learn, giving, provisioning, reports and mobile boundary regressions');
