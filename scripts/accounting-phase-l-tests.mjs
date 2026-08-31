#!/usr/bin/env node
import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CAPABILITY_CATALOG, ROLE_TEMPLATES } from "../src/lib/authorization.js";
import { deleteAttachment, listAttachments, recordAttachment } from "../src/accounting/index.js";
import {
  deleteAccountingAttachment,
  generateStorageKey,
  putAccountingAttachment,
  streamAccountingAttachment,
  validateAccountingAttachmentUpload
} from "../src/lib/accounting-attachment-storage.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const migration = read("accounting-migrations/0019_phase_l_attachments.sql");
const handler = read("src/handlers/accounting-attachments.js");
const worker = `${read("src/worker.js")}\n${read("src/routes/accounting.js")}`;
const parishApp = readParishDashboardSource();
const wrangler = read("wrangler.toml");
const has = (source, needles, label) => needles.forEach((needle) => assert.ok(source.includes(needle), `${label} must include ${needle}`));

for (const capability of ["accounting.attachments.view", "accounting.attachments.manage"]) assert.ok(CAPABILITY_CATALOG.includes(capability), `${capability} must be registered`);
for (const role of ["treasurer", "bookkeeper"]) for (const capability of ["accounting.attachments.view", "accounting.attachments.manage"]) assert.ok(ROLE_TEMPLATES[role].includes(capability), `${role} must receive ${capability}`);
assert.deepEqual(Object.entries(ROLE_TEMPLATES).filter(([, grants]) => grants.includes("accounting.attachments.manage")).map(([role]) => role).sort(), ["bookkeeper", "treasurer"], "attachment management must be limited to treasurer and bookkeeper");

has(migration, ["DROP TABLE IF EXISTS accounting_attachment_metadata", "CREATE TABLE IF NOT EXISTS accounting_attachments", "entity_type IN ('journal_entry','bill','reconciliation_session')", "storage_status IN ('stored','deleted')", "size_bytes > 0 AND size_bytes <= 10485760"], "Phase L migration");
has(handler, ["/attachments", "/attachments/upload", "/download", "accounting.attachments.view", "accounting.attachments.manage", "accounting-attachment-upload", "request.formData()", "deleteAccountingAttachment"], "attachment handler");
assert.ok(worker.indexOf("actions.handleAccountingAttachments") < worker.indexOf("actions.handleAccountingLedger"), "attachment dispatch must precede ledger fallback");
has(wrangler, ['binding = "ACCOUNTING_ATTACHMENTS"', 'bucket_name = "agapay-accounting-attachments"'], "R2 binding");
has(parishApp, ["function renderAccountingAttachments", "function accountingUpload", "renderAccountingAttachments('bill'", "renderAccountingAttachments('journal_entry'", "renderAccountingAttachments('reconciliation_session'"], "shared attachment UI");

const sqlite = new DatabaseSync(":memory:");
sqlite.exec("CREATE TABLE accounting_attachment_metadata(id TEXT PRIMARY KEY); CREATE TABLE accounting_journal_entries(id TEXT PRIMARY KEY); CREATE TABLE accounting_bills(id TEXT PRIMARY KEY); CREATE TABLE accounting_reconciliation_sessions(id TEXT PRIMARY KEY);");
sqlite.exec(migration);
assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='accounting_attachment_metadata'").get().count, 0);
assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='accounting_attachments'").get().count, 1);
sqlite.exec("INSERT INTO accounting_journal_entries(id) VALUES('journal_l'); INSERT INTO accounting_bills(id) VALUES('bill_l'); INSERT INTO accounting_reconciliation_sessions(id) VALUES('recon_l');");
const prepare = (sql) => ({
  params: [],
  bind(...params) { this.params = params; return this; },
  async first() { return sqlite.prepare(sql).get(...this.params) || null; },
  async all() { return { results: sqlite.prepare(sql).all(...this.params) }; },
  async run() { const result = sqlite.prepare(sql).run(...this.params); return { meta: { changes: result.changes } }; }
});
const db = { prepare };
const actor = { id: "phase-l-bookkeeper", type: "platform_user", capabilities: ["accounting.attachments.view", "accounting.attachments.manage"] };
const recorded = await recordAttachment(db, { actor, entitlementTier: "advanced_operations", entityType: "bill", entityId: "bill_l", displayName: "Invoice.pdf", storageKey: "acctdoc/test", mimeType: "application/pdf", sizeBytes: 4, sha256Hex: "abcd" });
assert.equal((await listAttachments(db, { actor, entitlementTier: "advanced_operations", entityType: "bill", entityId: "bill_l" })).length, 1);
await assert.rejects(() => recordAttachment(db, { actor, entityType: "bill", entityId: "missing", displayName: "Missing.pdf", storageKey: "acctdoc/missing", mimeType: "application/pdf", sizeBytes: 4, sha256Hex: "abcd" }), /not found/i);
const deleted = await deleteAttachment(db, { actor, attachmentId: recorded.id, expectedVersion: recorded.version });
assert.equal(deleted.storageStatus, "deleted");
assert.equal((await listAttachments(db, { actor, entityType: "bill", entityId: "bill_l" })).length, 0);

const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46]).buffer;
assert.equal((await validateAccountingAttachmentUpload({ filename: "invoice.pdf", declaredMimeType: "application/pdf", arrayBuffer: pdf })).ok, true);
assert.equal((await validateAccountingAttachmentUpload({ filename: "invoice.png", declaredMimeType: "image/png", arrayBuffer: pdf })).ok, false);
assert.match(generateStorageKey(), /^acctdoc\/[0-9a-f]{64}$/);
const objects = new Map();
const env = { ACCOUNTING_ATTACHMENTS: {
  async put(key, value) { objects.set(key, value); },
  async get(key) { return objects.has(key) ? { body: objects.get(key) } : null; },
  async delete(key) { objects.delete(key); }
} };
const key = await putAccountingAttachment(env, { arrayBuffer: pdf, mimeType: "application/pdf" });
const streamed = await streamAccountingAttachment(env, { storageKey: key, mimeType: "application/pdf", sanitizedFilename: "invoice.pdf", mode: "attachment" });
assert.equal(streamed.headers.get("Cache-Control"), "private, no-store");
assert.equal(streamed.headers.get("Content-Security-Policy"), "default-src 'none'");
await deleteAccountingAttachment(env, key);
assert.equal(objects.has(key), false);

console.log("Accounting Phase L attachment checks passed.");
