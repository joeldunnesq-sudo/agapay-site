import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareAttachmentFixture } from './accounting-attachment-fixture-live.mjs';
const root = '/api/parish/dashboard/test-lubbock';
const env = {
  TEST_LUBBOCK_PARISH_PASSWORD: 'fixture',
  TEST_LUBBOCK_STAFF_PROFILE_ID: 'staff',
  TEST_LUBBOCK_STAFF_PIN: '123456',
};
const vendors = [],
  bills = [],
  attachments = [],
  writes = [];
let stored;
async function fetchImpl(url, options) {
  const u = new URL(url);
  assert.equal(u.origin, 'https://agapay.app');
  assert.ok(u.pathname === '/api/health' || u.pathname.startsWith(root + '/'));
  const p = u.pathname;
  if (p.endsWith('/download'))
    return options.headers
      ? new Response(stored, {
          headers: {
            'content-type': 'image/png',
            'content-disposition': 'attachment; filename=fixture.png',
            'cache-control': 'private, no-store',
          },
        })
      : new Response('', { status: 401 });
  if (options.method === 'POST' && !p.endsWith('/session') && !p.endsWith('/accounting-access/verify')) {
    writes.push(p);
    if (p.endsWith('/vendors')) {
      const v = { ...JSON.parse(options.body), id: 'vendor' };
      vendors.push(v);
      return Response.json({ vendor: v }, { status: 201 });
    }
    if (p.endsWith('/bills')) {
      const b = { ...JSON.parse(options.body), id: 'bill', status: 'draft', totalAmount: 0 };
      assert.equal(b.lines[0].unitAmount, 0);
      bills.push(b);
      return Response.json({ bill: b }, { status: 201 });
    }
    assert.ok(p.endsWith('/attachments/upload'), 'No other financial write is allowed');
    const file = options.body.get('file');
    stored = Buffer.from(await file.arrayBuffer());
    const a = {
      id: 'attachment',
      displayName: options.body.get('displayName'),
      storageStatus: 'stored',
      sizeBytes: stored.length,
      sha256Hex: createHash('sha256').update(stored).digest('hex'),
      mimeType: 'image/png',
    };
    attachments.push(a);
    return Response.json({ attachment: a }, { status: 201 });
  }
  if (p === '/api/health') return Response.json({ ok: true, checks: { d1: { ok: true }, kv: { ok: true } } });
  if (p.endsWith('/session')) return Response.json({ token: 'session' });
  if (p.endsWith('/profiles')) return Response.json({ accounting: { ready: true }, profiles: [{ id: 'staff' }] });
  if (p.endsWith('/verify')) return Response.json({ ok: true, token: 'stafftoken', profile: { id: 'staff' } });
  if (p.endsWith('/payout-diagnostics'))
    return Response.json({
      parishId: 'test-lubbock',
      payoutsRequest: { ok: true },
      balanceTransactionsRequest: { ok: true },
      payouts: [],
    });
  if (p.endsWith('/reconciliation'))
    return Response.json({
      parishId: 'test-lubbock',
      available: true,
      summary: { payoutCount: 0, depositedCents: 0 },
      transactions: [],
    });
  if (p.endsWith('/governance/health'))
    return Response.json({ ok: true, health: { status: 'healthy', protectiveState: { state: 'normal' } } });
  if (p.endsWith('/vendors')) return Response.json({ vendors });
  if (p.endsWith('/bills')) return Response.json({ ok: true, bills });
  if (p.endsWith('/attachments')) return Response.json({ ok: true, attachments });
  if (p.endsWith('/workspace-reference'))
    return Response.json({
      accounts: [{ id: 'expense', category: 'expense' }],
      funds: [{ id: 'fund', isDefault: true }],
    });
  return Response.json({ ok: true });
}
const first = await prepareAttachmentFixture({ env, fetchImpl });
assert.equal(first.billCreated, true);
assert.equal(first.attachmentCreated, true);
assert.equal(first.anonymousStatus, 401);
const second = await prepareAttachmentFixture({ env, fetchImpl });
assert.equal(second.billCreated, false);
assert.equal(second.attachmentCreated, false);
assert.equal(writes.length, 3);
bills[0].status = 'posted';
await assert.rejects(() => prepareAttachmentFixture({ env, fetchImpl }), /Never change/);
assert.equal(writes.length, 3);
console.log(
  'PASS - fixture creates only one zero-value draft and attachment, reuses them, verifies exact bytes, denies anonymous access, and refuses progressed bills'
);
