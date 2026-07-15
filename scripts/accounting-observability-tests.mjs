import assert from "node:assert/strict";

import {
  createAccountingLogEvent,
  createSafeErrorResponse,
  createSupportAuditRequirement,
  maskEmail,
  maskIpAddress,
  maskObjectKey,
  maskStripeId,
  redactObject
} from "../src/accounting/observability.js";

{
  assert.equal(maskEmail("treasurer@example.org"), "tr***@example.org");
  assert.equal(maskStripeId("pi_1234567890"), "pi_***7890");
  assert.equal(maskObjectKey("accounting/prod/st-test/export.pdf"), "acco***.pdf");
  assert.equal(maskIpAddress("203.0.113.10"), "203.0.x.x");
}

{
  const redacted = redactObject({
    donorEmail: "donor@example.org",
    stripePaymentIntentId: "pi_abc12345",
    nested: { sessionToken: "secret-token-value" }
  });
  assert.equal(redacted.donorEmail, "do***@example.org");
  assert.equal(redacted.stripePaymentIntentId, "pi_***2345");
  assert.equal(redacted.nested.sessionToken, "[redacted]");
}

{
  const event = createAccountingLogEvent({
    type: "accounting.job.failed",
    env: { AGAPAY_ACCOUNTING_ENV: "staging" },
    parishId: "st-test",
    correlationId: "corr-12345678",
    metadata: { token: "nope", objectKey: "accounting/staging/st-test/export.json" }
  });
  assert.equal(event.environment, "staging");
  assert.equal(event.type, "accounting.job.failed");
  assert.equal(event.metadata.token, "[redacted]");
  assert.ok(event.correlationId);
}

{
  const response = createSafeErrorResponse({ name: "DatabaseError", message: "raw binding: SECRET", status: 500 }, "corr-safe");
  assert.equal(response.status, 500);
  assert.equal(response.body.error, "Accounting request could not be completed.");
  assert.equal(response.body.correlationId, "corr-safe");
  assert.ok(!response.body.error.includes("SECRET"));
}

{
  const audit = createSupportAuditRequirement({
    action: "inspect_failed_job",
    parishId: "st-test",
    actorId: "support-user",
    targetType: "job",
    targetId: "job_123",
    reason: "Treasurer reported failed export",
    correlationId: "corr-audit"
  });
  assert.equal(audit.type, "accounting.support.action");
  assert.equal(audit.metadata.action, "inspect_failed_job");
}

console.log("All accounting observability tests passed.");
