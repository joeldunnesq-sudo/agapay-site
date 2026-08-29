import assert from 'node:assert/strict';
import { POLICY_VERSION } from '../../src/portability/catalog.js';
import { processExport, confirmClosure, getJob, retryExport, cancelExport, runPortabilityJobs } from '../../src/portability/service.js';
import { handleParishPortability } from '../../src/handlers/parish-portability.js';
import { suppressionRecord } from '../../src/portability/suppression.js';
import { portabilityFixture as fixture } from './fixtures.mjs';

{
  const f=await fixture();
  const job=await f.start('close');await processExport(f.env,'parish-a',job.id);
  const ready=await getJob(f.env,'parish-a',job.id);
  const queued=await f.queueConfirmation(ready);
  assert.equal(queued.confirmation_stage,'freeze_books');assert.equal(queued.confirmed_at,null);
  assert.equal(await suppressionRecord(f.env,'parish-a'),null);
  assert.throws(()=>f.db.prepare("UPDATE directory_people SET preferred_name='late' WHERE id='a'").run(),/WRITE_BLOCKED/);
  assert.equal((await f.queueConfirmation(ready)).confirmation_stage,'freeze_books','duplicate consent does not restart phases');
  await assert.rejects(confirmClosure(f.env,{parishId:'parish-a',jobId:job.id,actorHash:'wrong',archiveHash:ready.archive_sha256,policyVersion:POLICY_VERSION,saved:true,confirmation:'parish-a'}),/same administrator/);
  await processExport(f.env,'parish-a',job.id);
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmation_stage,'authorize');
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmed_at,null);
  await cancelExport(f.env,'parish-a',job.id);
  assert.equal((await getJob(f.env,'parish-a',job.id)).manifest_json,null);
  assert.equal(await suppressionRecord(f.env,'parish-a'),null);
  f.db.prepare("UPDATE directory_people SET preferred_name='released' WHERE id='a'").run();
  f.db.close();
}
{
  const f=await fixture();
  const job=await f.start('close');await processExport(f.env,'parish-a',job.id);
  await f.queueConfirmation(await getJob(f.env,'parish-a',job.id));
  await processExport(f.env,'parish-a',job.id);
  const originalNow=Date.now, future=Date.now()+16*60000;
  try { Date.now=()=>future;await assert.rejects(processExport(f.env,'parish-a',job.id),error=>error.code==='confirmation_expired'); }
  finally { Date.now=originalNow; }
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmed_at,null);
  assert.equal(f.db.prepare('SELECT count(*) n FROM parish_data_closures').get().n,0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM directory_people WHERE id='a'").get().n,1);
  await retryExport(f.env,'parish-a',job.id);await processExport(f.env,'parish-a',job.id);
  assert.equal((await getJob(f.env,'parish-a',job.id)).status,'ready','expired consent cannot automatically authorize a new export');
  f.db.close();
}
{
  const f=await fixture();
  const job=await f.start('close');await processExport(f.env,'parish-a',job.id);
  f.db.prepare("UPDATE directory_people SET preferred_name='stale' WHERE id='a'").run();
  await f.queueConfirmation(await getJob(f.env,'parish-a',job.id));
  await processExport(f.env,'parish-a',job.id);
  f.db.exec("CREATE TRIGGER prevent_release BEFORE DELETE ON parish_data_closures BEGIN SELECT RAISE(ABORT,'synthetic release failure'); END;");
  await assert.rejects(processExport(f.env,'parish-a',job.id),/synthetic release failure/);
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmation_stage,'releasing');
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmed_at,null);
  assert.throws(()=>f.db.prepare("UPDATE directory_people SET preferred_name='late' WHERE id='a'").run(),/WRITE_BLOCKED/);
  f.db.exec('DROP TRIGGER prevent_release');
  await runPortabilityJobs(f.env);
  assert.equal((await getJob(f.env,'parish-a',job.id)).status,'failed');
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmation_stage,null);
  assert.equal(f.db.prepare('SELECT count(*) n FROM parish_data_closures').get().n,0);
  assert.equal(await suppressionRecord(f.env,'parish-a'),null);
  f.db.close();
}
{
  const f=await fixture();
  const job=await f.start('close');await processExport(f.env,'parish-a',job.id);
  await f.queueConfirmation(await getJob(f.env,'parish-a',job.id));await processExport(f.env,'parish-a',job.id);
  f.db.exec('ALTER TABLE directory_people ADD COLUMN unexpected_between_phases TEXT');
  await assert.rejects(processExport(f.env,'parish-a',job.id),error=>error.code==='unclassified_column');
  assert.equal((await getJob(f.env,'parish-a',job.id)).confirmed_at,null);
  assert.equal(f.db.prepare('SELECT count(*) n FROM parish_data_closures').get().n,0);
  f.db.close();
}

{
  const f = await fixture();
  const authoritative = JSON.parse(f.db.prepare("SELECT data FROM registrations WHERE reference='ref-parish-a'").get().data);
  authoritative.updatedAt = '2026-08-30T00:00:00.000Z';
  f.db.prepare("UPDATE registrations SET data=?, updated_at='2026-08-28T00:00:00.000Z' WHERE reference='ref-parish-a'").run(JSON.stringify(authoritative));
  f.db.prepare("INSERT INTO registrations(reference,parish_id,updated_at,data) VALUES('ref-parish-a-history','parish-a','2026-08-29T00:00:00.000Z',?)").run(JSON.stringify({ parishId: 'parish-a', parishDashboardSessions: [] }));
  const response = await handleParishPortability(new Request('https://agapay.test/api', { headers: { Authorization: 'Bearer ' + f['parish-a'] } }), f.env, 'parish-a');
  assert.equal(response.status, 200, 'portability authenticates against the same authoritative duplicate parish record as the dashboard');
  f.db.close();
}
{
  const f = await fixture();
  const registration = JSON.parse(f.db.prepare("SELECT data FROM registrations WHERE reference='ref-parish-a'").get().data);
  registration.stripeSubscriptionId = 'sub_active_test';
  f.db.prepare("UPDATE registrations SET stripe_subscription_id=?, data=? WHERE reference='ref-parish-a'").run(registration.stripeSubscriptionId, JSON.stringify(registration));
  const closeRequest = () => new Request('https://agapay.test/api', { method: 'POST', headers: { Authorization: 'Bearer ' + f['parish-a'], 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'close', requestKey: crypto.randomUUID() }) });
  const missingSecret = await handleParishPortability(closeRequest(), f.env, 'parish-a');
  assert.equal(missingSecret.status, 503); assert.equal((await missingSecret.json()).code, 'billing_verification_unavailable');
  f.env.STRIPE_SECRET_KEY = 'sk_test_synthetic';
  const originalFetch = globalThis.fetch;
  let stripeReads = 0;
  try {
    globalThis.fetch = async (url) => {
      stripeReads += 1;
      assert.equal(String(url), 'https://api.stripe.com/v1/subscriptions/sub_active_test');
      return new Response(JSON.stringify({ id: 'sub_active_test', status: 'active' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const activeBilling = await handleParishPortability(closeRequest(), f.env, 'parish-a');
    assert.equal(activeBilling.status, 409); assert.equal((await activeBilling.json()).code, 'cancel_billing_first');
    assert.equal(f.db.prepare('SELECT count(*) n FROM parish_portability_jobs').get().n, 0, 'active billing blocks the final export before a job exists');
    globalThis.fetch = async () => { throw new Error('ordinary exports must not contact Stripe'); };
    const ordinary = await handleParishPortability(new Request('https://agapay.test/api', { method: 'POST', headers: { Authorization: 'Bearer ' + f['parish-a'], 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'export', requestKey: crypto.randomUUID() }) }), f.env, 'parish-a');
    assert.equal(ordinary.status, 202, 'ordinary data downloads remain independent of subscription cancellation');
    assert.equal(stripeReads, 1);
  } finally { globalThis.fetch = originalFetch; f.db.close(); }
}
