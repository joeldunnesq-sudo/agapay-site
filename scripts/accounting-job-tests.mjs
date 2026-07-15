import assert from "node:assert/strict";

import {
  ACCOUNTING_JOB_TYPES,
  createAccountingJobEnvelope,
  createFailedAccountingJobRecord,
  parseAccountingJobEnvelope,
  shouldRetryAccountingJob
} from "../src/accounting/background-jobs.js";

{
  const job = createAccountingJobEnvelope({
    type: ACCOUNTING_JOB_TYPES.STRIPE_SOURCE_EVENT_READY,
    parishId: "st-test",
    payload: { stripeEventId: "evt_123" },
    correlationId: "corr-12345678"
  });
  assert.equal(job.primitive, "queue");
  assert.equal(job.requiresAccountingGateway, true);
  assert.equal(job.maxAttempts, 5);
  assert.equal(parseAccountingJobEnvelope(JSON.stringify(job)).type, job.type);
}

{
  assert.throws(() => createAccountingJobEnvelope({
    type: ACCOUNTING_JOB_TYPES.ACCOUNTING_REPORT_GENERATE,
    payload: {},
    correlationId: "corr-12345678"
  }), /parishId is required/);
}

{
  assert.throws(() => createAccountingJobEnvelope({
    type: ACCOUNTING_JOB_TYPES.ACCOUNTING_BACKUP_EXPORT,
    payload: { apiToken: "secret" },
    correlationId: "corr-12345678"
  }), /forbidden field/);
}

{
  const job = createAccountingJobEnvelope({
    type: ACCOUNTING_JOB_TYPES.ACCOUNTING_POSTING_RETRY,
    parishId: "st-test",
    payload: { sourceEventId: "stripe:evt_1" },
    correlationId: "corr-12345678",
    attempt: 1
  });
  assert.equal(shouldRetryAccountingJob(job, { name: "TimeoutError" }), true);
  assert.equal(shouldRetryAccountingJob(job, { name: "ValidationError" }), false);
  const failed = createFailedAccountingJobRecord(job, { name: "TimeoutError", message: "network drift" });
  assert.equal(failed.retryable, true);
  assert.equal(failed.correlationId, "corr-12345678");
}

{
  assert.throws(() => parseAccountingJobEnvelope({ schemaVersion: 99 }), /Unsupported accounting job schema version/);
  assert.throws(() => createAccountingJobEnvelope({ type: "unknown.job", correlationId: "corr-12345678" }), /Unknown accounting job type/);
}

console.log("All accounting job tests passed.");
