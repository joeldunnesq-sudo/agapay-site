import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { observeScheduledTask } from "../src/worker.js";

const originalLog = console.log;
const originalError = console.error;
const originalFetch = globalThis.fetch;
const logs = [];
const errors = [];
console.log = (...args) => logs.push(args);
console.error = (...args) => errors.push(args);

class MemoryKV {
  constructor() { this.values = new Map(); this.puts = []; }
  async get(key) { return this.values.get(key) || null; }
  async put(key, value, options = {}) { this.values.set(key, value); this.puts.push({ key, value, options }); }
}

try {
  const result = await observeScheduledTask("test_scheduled_job", Promise.resolve({ processed: 2 }));
  assert.deepEqual(result, { processed: 2 });
  assert.deepEqual(logs, [["test_scheduled_job", JSON.stringify({ processed: 2 })]]);

  const kv = new MemoryKV();
  const sentMessages = [];
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(String(url), "https://api.resend.com/emails");
    sentMessages.push(JSON.parse(init.body));
    return Response.json({ id: `email-${sentMessages.length}` });
  };
  const env = {
    AGAPAY_REGISTRATIONS: kv,
    AGAPAY_OPS_ALERT_EMAIL: "ops@example.test",
    AGAPAY_FROM_EMAIL: "AGAPAY <alerts@agapay.test>",
    AGAPAY_REPLY_TO_EMAIL: "support@agapay.test",
    AGAPAY_APP_URL: "https://agapay.test",
    RESEND_API_KEY: "re_scheduled_alert_test_key",
  };
  const failure = new Error("simulated scheduled failure");
  await assert.rejects(
    observeScheduledTask("test_scheduled_job", Promise.reject(failure), env),
    (error) => error === failure,
    "scheduled failures must remain rejected so the invocation and alerting can see them",
  );
  assert.deepEqual(errors, [["test_scheduled_job_failed", "simulated scheduled failure"]]);
  assert.equal(sentMessages.length, 1, "the first job failure should use the real sendEmail pipeline once");
  assert.deepEqual(sentMessages[0].to, ["ops@example.test"]);
  assert.match(sentMessages[0].subject, /test_scheduled_job/);
  assert.match(sentMessages[0].text, /simulated scheduled failure/);
  assert.match(sentMessages[0].text, /Timestamp:/);
  assert.equal(kv.puts.length, 1, "a successful alert should record its timestamp in KV");
  assert.equal(kv.puts[0].options.expirationTtl, 3600, "the default de-duplication window should be one adjustable hour");

  const repeatedFailure = new Error("simulated scheduled failure again");
  await assert.rejects(
    observeScheduledTask("test_scheduled_job", Promise.reject(repeatedFailure), env),
    (error) => error === repeatedFailure,
  );
  assert.equal(sentMessages.length, 1, "a repeated failure inside the window must not send another email");
  assert.ok(logs.some(([event, payload]) => event === "scheduled_job_alert_suppressed" && payload.includes("test_scheduled_job")));

  globalThis.fetch = async () => { throw new Error("simulated Resend outage"); };
  const providerFailure = new Error("scheduled job still failed");
  await assert.rejects(
    observeScheduledTask("provider_outage_job", Promise.reject(providerFailure), env),
    (error) => error === providerFailure,
    "an alert-provider outage must preserve the original rejected job promise",
  );
  assert.ok(errors.some(([event, message]) => event === "provider_outage_job_failed" && message === "scheduled job still failed"));
  assert.ok(errors.some(([event, name, message]) => event === "scheduled_job_alert_failed" && name === "provider_outage_job" && /Resend outage/i.test(message)));

  const workerSource = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const scheduledBody = workerSource.slice(workerSource.indexOf("async scheduled(event, env, ctx)"), workerSource.indexOf("async fetch(request, env, ctx)"));
  const waitUntilLines = scheduledBody.split(/\r?\n/).filter((line) => line.includes("ctx.waitUntil("));
  assert.equal(waitUntilLines.length, 14, "the Worker should have exactly 14 real scheduled job registrations, including parish portability");
  assert.ok(waitUntilLines.every((line) => line.includes("observeScheduledTask(") && line.includes(", env, event));")), "every scheduled job must flow through the alerting and heartbeat wrapper with its event metadata");
  assert.match(scheduledBody, /observeScheduledTask\("koinonia_exchange_expiry_sweep", expireKoinoniaExchangeListings\(env, event\.scheduledTime\), env, event\)/);
  assert.match(scheduledBody, /observeScheduledTask\("koinonia_signup_reminders", sendScheduledSignupReminders\(env, event\.scheduledTime\), env, event\)/);
} finally {
  console.log = originalLog;
  console.error = originalError;
  globalThis.fetch = originalFetch;
}

console.log("Scheduled-job observability tests passed.");
