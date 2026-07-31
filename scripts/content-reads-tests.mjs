import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getReadContentIds, markContentRead } from "../src/lib/content-reads.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "migrations", "0064_parish_content_reads.sql");
const modulePath = path.join(root, "src", "lib", "content-reads.js");
const sqlite = new DatabaseSync(":memory:");

sqlite.exec(readFileSync(migrationPath, "utf8"));

const db = {
  prepare(sql) {
    return {
      parameters: [],
      bind(...parameters) {
        this.parameters = parameters;
        return this;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...this.parameters) };
      },
      async run() {
        const result = sqlite.prepare(sql).run(...this.parameters);
        return { success: true, meta: { changes: result.changes } };
      }
    };
  }
};

const firstRead = {
  parishId: "parish-one",
  contentType: "announcement",
  contentId: "content-one",
  donorId: "donor-one"
};

await markContentRead(db, firstRead);
await markContentRead(db, firstRead);
assert.equal(
  sqlite.prepare("SELECT COUNT(*) AS count FROM parish_content_reads").get().count,
  1,
  "marking the same content twice should create only one row"
);

await markContentRead(db, {
  parishId: "parish-one",
  contentType: "announcement",
  contentId: "content-two",
  donorId: "donor-two"
});
await markContentRead(db, {
  parishId: "parish-two",
  contentType: "announcement",
  contentId: "content-three",
  donorId: "donor-one"
});
await markContentRead(db, {
  parishId: "parish-one",
  contentType: "group_message",
  contentId: "content-four",
  donorId: "donor-one"
});

assert.deepEqual(
  await getReadContentIds(db, {
    parishId: "parish-one",
    contentType: "announcement",
    donorId: "donor-one",
    contentIds: ["content-one", "content-two", "content-three", "content-missing"]
  }),
  ["content-one"],
  "read lookup should not leak another donor's, parish's, or content type's state"
);
assert.deepEqual(
  await getReadContentIds(db, {
    parishId: "parish-one",
    contentType: "announcement",
    donorId: "donor-one",
    contentIds: []
  }),
  [],
  "an empty caller-supplied content list should return no reads"
);

assert.throws(
  () => sqlite.prepare(`
    INSERT INTO parish_content_reads (parish_id, content_type, content_id, donor_id)
    VALUES (?, ?, ?, ?)
  `).run("parish-one", "unsupported", "content-five", "donor-one"),
  /CHECK constraint failed/,
  "the schema should reject unsupported content types"
);

const moduleSource = readFileSync(modulePath, "utf8");
assert.equal(
  /announcement|group/i.test(moduleSource),
  false,
  "the generic module should not reference feature-specific content"
);

console.log("PASS - shared content read tracking is idempotent, scoped, constrained, and feature-agnostic");
