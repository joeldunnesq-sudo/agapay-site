import assert from "node:assert/strict";

import {
  assertStateTransition,
  createAccountingR2ObjectKey,
  createBackupRequest,
  createMigrationOrchestrationPlan,
  validateAccountingDocumentUpload
} from "../src/accounting/storage-foundations.js";

{
  const key = createAccountingR2ObjectKey({
    environment: "staging",
    parishId: "St. Test Parish",
    documentClass: "receipt",
    objectId: "Receipt 1001",
    version: 2,
    extension: "pdf"
  });
  assert.equal(key, "accounting/staging/st.-test-parish/receipt/v2/receipt-1001.pdf");
}

{
  assert.equal(validateAccountingDocumentUpload({
    contentType: "application/pdf",
    sizeBytes: 1024,
    checksum: "sha256:abc",
    parishId: "st-test",
    requesterParishId: "st-test"
  }), true);
  assert.throws(() => validateAccountingDocumentUpload({
    contentType: "application/pdf",
    sizeBytes: 1024,
    checksum: "sha256:abc",
    parishId: "st-test",
    requesterParishId: "other-parish"
  }), /another parish/);
}

{
  assert.equal(assertStateTransition("backup", "requested", "running"), true);
  assert.throws(() => assertStateTransition("restore", "completed", "validating"), /not allowed/);
}

{
  const request = createBackupRequest({
    environment: "production",
    tenantId: "archived-st-test",
    requestedBy: "ops-user",
    archivedTenant: true
  });
  assert.equal(request.duplicateKey, "backup:production:archived-st-test");
  assert.equal(request.archivedTenant, true);
}

{
  const blocked = createMigrationOrchestrationPlan({
    environment: "staging",
    migrationId: "0021",
    lockId: "lock-123",
    schemaDriftDetected: true,
    canaryStatus: "failed",
    perParishDivergence: true
  });
  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.blockers, ["schema_drift_detected", "canary_failed", "per_parish_divergence"]);
}

console.log("All accounting storage foundation tests passed.");
