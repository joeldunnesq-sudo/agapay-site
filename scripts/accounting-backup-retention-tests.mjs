import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ACCOUNTING_BACKUP_RETENTION_DAYS,
  accountingBackupRetentionDays,
  sweepAccountingBackupRetention,
} from "../src/accounting/backup-retention.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function fakeBucket(seed, pageSize = 1000) {
  const objects = new Map(seed.map((object) => [object.key, { ...object, uploaded: new Date(object.uploaded) }]));
  const deleted = [];
  return {
    objects,
    deleted,
    async list({ cursor } = {}) {
      const ordered = [...objects.values()].sort((left, right) => left.key.localeCompare(right.key));
      const offset = cursor ? Number(cursor) : 0;
      const page = ordered.slice(offset, offset + pageSize);
      const nextOffset = offset + page.length;
      return { objects: page, truncated: nextOffset < ordered.length, cursor: nextOffset < ordered.length ? String(nextOffset) : undefined };
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        deleted.push(key);
        objects.delete(key);
      }
    },
  };
}

assert.equal(DEFAULT_ACCOUNTING_BACKUP_RETENTION_DAYS, 365);
assert.equal(accountingBackupRetentionDays({}), 365);
assert.equal(accountingBackupRetentionDays({ ACCOUNTING_BACKUP_RETENTION_DAYS: "730" }), 730);
assert.throws(() => accountingBackupRetentionDays({ ACCOUNTING_BACKUP_RETENTION_DAYS: "0" }), /RETENTION_DAYS_INVALID/);

const mixedBucket = fakeBucket([
  { key: "manual/pre-migration-final.sql", uploaded: "2024-12-31T23:59:59Z" },
  { key: "canary/2026-07-21/agapay-accounting-canary.sql", uploaded: "2026-07-21T14:33:46.560Z" },
], 1);
const mixed = await sweepAccountingBackupRetention({ ACCOUNTING_BACKUPS: mixedBucket }, "2026-08-01T00:00:00Z");
assert.deepEqual(mixed, {
  objectsScanned: 2,
  deleted: 1,
  kept: 1,
  retentionDays: 365,
  cutoff: "2025-08-01T00:00:00.000Z",
  newestBackupPreserved: false,
});
assert.deepEqual(mixedBucket.deleted, ["manual/pre-migration-final.sql"], "an object older than the threshold must be deleted regardless of its name");
assert.deepEqual([...mixedBucket.objects.keys()], ["canary/2026-07-21/agapay-accounting-canary.sql"], "an object inside the threshold must remain");

const allExpiredBucket = fakeBucket([
  { key: "snapshot-with-no-date.sql", uploaded: "2023-02-01T00:00:00Z" },
  { key: "kv-keys-20230101.json", uploaded: "2023-03-01T00:00:00Z" },
  { key: "before-risky-change/custom-name.sql", uploaded: "2023-04-01T00:00:00Z" },
]);
const allExpired = await sweepAccountingBackupRetention({ ACCOUNTING_BACKUPS: allExpiredBucket }, "2026-08-01T00:00:00Z");
assert.equal(allExpired.deleted, 2);
assert.equal(allExpired.kept, 1);
assert.equal(allExpired.newestBackupPreserved, true);
assert.deepEqual([...allExpiredBucket.objects.keys()], ["before-risky-change/custom-name.sql"], "the most recently uploaded backup must survive when every object is expired");

const exactlyAtCutoffBucket = fakeBucket([
  { key: "cutoff-boundary.sql", uploaded: "2025-08-01T00:00:00Z" },
]);
const boundary = await sweepAccountingBackupRetention({ ACCOUNTING_BACKUPS: exactlyAtCutoffBucket }, "2026-08-01T00:00:00Z");
assert.equal(boundary.deleted, 0, "only objects strictly older than the threshold may be deleted");
assert.equal(boundary.kept, 1);

const missingBinding = await sweepAccountingBackupRetention({}, "2026-08-01T00:00:00Z");
assert.equal(missingBinding.skipped, "binding_missing");
assert.equal(missingBinding.deleted, 0);

const workerSource = readFileSync(path.join(root, "src", "worker.js"), "utf8");
assert.match(workerSource, /sweepAccountingBackupRetention\(env, event\.scheduledTime\)/);
assert.match(workerSource, /observeScheduledTask\("accounting_backup_retention_sweep", sweepAccountingBackupRetention/);
assert.match(workerSource, /console\.error\(`\$\{name\}_failed`/);
assert.match(workerSource, /throw error;/, "scheduled task errors must stay rejected after logging");
const wranglerSource = readFileSync(path.join(root, "wrangler.toml"), "utf8");
assert.match(wranglerSource, /ACCOUNTING_BACKUP_RETENTION_DAYS = "365"/);
const runbook = readFileSync(path.join(root, "docs", "BACKUP_RESTORE_RUNBOOK.md"), "utf8");
assert.match(runbook, /R2's\s+upload timestamp, not the human-chosen filename/);
assert.match(runbook, /always preserves the single most recently/);

console.log("PASS - accounting backup retention is age-based, observable, paginated, and always preserves one backup");
