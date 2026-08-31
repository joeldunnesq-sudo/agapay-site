import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachPreparationToRequests,
  createRequestPreparationSnapshot,
  ensureDefaultPreparationTemplates,
  loadPreparationTemplates,
  savePreparationTemplate,
  updatePreparationItemForDonor
} from "../src/sacraments/preparation.js";
import {
  sanitizeSacramentDocumentFilename,
  validateSacramentDocumentUpload
} from "../src/lib/sacrament-document-storage.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE sacrament_requests (
    id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, donor_email TEXT NOT NULL,
    sacrament_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested',
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
sqlite.exec(readFileSync(path.join(root, "migrations", "0111_sacrament_preparation.sql"), "utf8"));

function statement(sql) {
  return {
    parameters: [],
    bind(...parameters) { this.parameters = parameters; return this; },
    async first() { return sqlite.prepare(sql).get(...this.parameters) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...this.parameters) }; },
    async run() {
      const result = sqlite.prepare(sql).run(...this.parameters);
      return { success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
    }
  };
}
const env = {
  AGAPAY_DB: {
    prepare: statement,
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const prepared of statements) results.push(await prepared.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  }
};

await ensureDefaultPreparationTemplates(env, "parish-a");
await ensureDefaultPreparationTemplates(env, "parish-a");
let templates = await loadPreparationTemplates(env, "parish-a");
assert.equal(templates.length, 2, "default creation must be idempotent");
assert.deepEqual(templates.map((template) => template.sacramentType), ["baptism", "wedding"]);
assert.ok(templates.every((template) => template.items.length >= 6));
assert.ok(templates.every((template) => /clergy's direction/.test(template.requirementsNotice)));

const baptism = templates.find((template) => template.sacramentType === "baptism");
await savePreparationTemplate(env, "parish-a", "baptism", {
  title: "Our Baptism Preparation",
  introduction: "Meet with Father first.",
  canonicalNote: "The parish confirms godparent eligibility.",
  items: [
    { ...baptism.items[0], title: "Read our guide" },
    { title: "Upload sponsor letter", description: "A current letter", itemType: "document", required: true }
  ]
});
templates = await loadPreparationTemplates(env, "parish-a");
const updatedTemplate = templates.find((template) => template.sacramentType === "baptism");
assert.equal(updatedTemplate.title, "Our Baptism Preparation");
assert.equal(updatedTemplate.items.length, 2);
assert.equal(updatedTemplate.version, 2);

await assert.rejects(() => savePreparationTemplate(env, "parish-a", "baptism", {
  title: "Must not partially save",
  items: [
    { ...updatedTemplate.items[0], title: "This valid edit must roll back" },
    { title: "Invalid type", itemType: "not-a-real-type", required: true }
  ]
}), /invalid type/);
const templateAfterInvalidSave = (await loadPreparationTemplates(env, "parish-a"))
  .find((template) => template.sacramentType === "baptism");
assert.equal(templateAfterInvalidSave.title, "Our Baptism Preparation");
assert.equal(templateAfterInvalidSave.items[0].title, "Read our guide");
assert.equal(templateAfterInvalidSave.version, 2, "invalid edits must not partially update a template");

sqlite.prepare("INSERT INTO sacrament_requests(id,parish_id,donor_email,sacrament_type,status) VALUES(?,?,?,?,?)")
  .run("request-a", "parish-a", "family@example.test", "baptism", "requested");
await createRequestPreparationSnapshot(env, { requestId: "request-a", parishId: "parish-a", sacramentType: "baptism" });
let [request] = await attachPreparationToRequests(env, [{
  id: "request-a", parishId: "parish-a", sacramentType: "baptism", status: "requested"
}]);
assert.equal(request.preparation.title, "Our Baptism Preparation");
assert.equal(request.preparation.items.length, 2);

await savePreparationTemplate(env, "parish-a", "baptism", {
  title: "Future Baptism Preparation",
  introduction: "Changed for future requests.",
  canonicalNote: "Future note.",
  items: [{ title: "Future-only step", itemType: "confirmation", required: true }]
});
[request] = await attachPreparationToRequests(env, [{
  id: "request-a", parishId: "parish-a", sacramentType: "baptism", status: "requested"
}]);
assert.equal(request.preparation.title, "Our Baptism Preparation", "active requests retain their snapshot");
assert.equal(request.preparation.items.length, 2, "template edits must not rewrite request items");

const confirmation = request.preparation.items.find((item) => item.itemType === "information");
assert.ok(confirmation);
assert.deepEqual(await updatePreparationItemForDonor(env, {
  requestId: "request-a", itemId: confirmation.id, donorEmail: "FAMILY@example.test", completed: true
}), { ok: true });
[request] = await attachPreparationToRequests(env, [{
  id: "request-a", parishId: "parish-a", sacramentType: "baptism", status: "requested"
}]);
assert.equal(request.preparation.items.find((item) => item.id === confirmation.id).status, "completed");
assert.equal(request.preparation.progress.completed, 1);

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]).buffer;
assert.equal(validateSacramentDocumentUpload({ filename: "guide.pdf", declaredMimeType: "application/pdf", arrayBuffer: pdf }).ok, true);
assert.equal(validateSacramentDocumentUpload({ filename: "guide.png", declaredMimeType: "image/png", arrayBuffer: pdf }).ok, false);
assert.equal(sanitizeSacramentDocumentFilename("../../bad\r\nname.pdf"), ".._.._badname.pdf");

const worker = readFileSync(path.join(root, "src", "worker.js"), "utf8");
const parishApp = readFileSync(path.join(root, "public", "parish", "features", "sacraments.js"), "utf8");
const donorApp = readFileSync(path.join(root, "public", "donor", "app.js"), "utf8");
const dashboard = readFileSync(path.join(root, "public", "parish", "dashboard.html"), "utf8");
const wrangler = readFileSync(path.join(root, "wrangler.toml"), "utf8");
assert.match(worker, /handleDonorSacramentPreparation/);
assert.match(worker, /handleParishSacramentPreparation/);
assert.match(parishApp, /renderSacramentsPreparationTemplates/);
assert.match(parishApp, /reviewSacramentPreparationDocument/);
assert.match(donorApp, /renderDonorSacramentPreparation/);
assert.match(donorApp, /uploadSacramentPreparationDocument/);
assert.match(dashboard, /data-sac-tab="preparation"/);
assert.match(dashboard, /\/parish\/features\/sacraments\.js\?v=20260831funds2/);
assert.match(wrangler, /binding = "SACRAMENT_DOCUMENTS"/);

console.log("PASS - Sacrament Preparation templates, snapshots, progress, documents, routes, and UI are wired");
