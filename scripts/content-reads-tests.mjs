import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getReadContentIds, getReadReceipts, markContentRead } from "../src/lib/content-reads.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "migrations", "0064_parish_content_reads.sql");
const modulePath = path.join(root, "src", "lib", "content-reads.js");
const sqlite = new DatabaseSync(":memory:");

sqlite.exec(readFileSync(migrationPath, "utf8"));
sqlite.exec(readFileSync(path.join(root, "migrations", "0070_parish_content_read_receipts_index.sql"), "utf8"));

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
  parishId: "parish-one",
  contentType: "announcement",
  contentId: "content-one",
  donorId: "donor-two"
});
await markContentRead(db, {
  parishId: "parish-two",
  contentType: "announcement",
  contentId: "content-one",
  donorId: "donor-other-parish"
});
await markContentRead(db, {
  parishId: "parish-one",
  contentType: "announcement",
  contentId: "content-other",
  donorId: "donor-other-content"
});
sqlite.prepare("UPDATE parish_content_reads SET read_at = ? WHERE donor_id = ?").run("2026-07-31T10:00:00.000Z", "donor-one");
sqlite.prepare("UPDATE parish_content_reads SET read_at = ? WHERE donor_id = ?").run("2026-07-31T11:00:00.000Z", "donor-two");

assert.deepEqual(
  await getReadReceipts(db, {
    parishId: "parish-one",
    contentType: "announcement",
    contentId: "content-one"
  }),
  [
    { donorId: "donor-one", readAt: "2026-07-31T10:00:00.000Z" },
    { donorId: "donor-two", readAt: "2026-07-31T11:00:00.000Z" }
  ],
  "reverse lookup should be ordered and must not leak another parish, content item, or content type"
);
const receiptPlan = sqlite.prepare(`
  EXPLAIN QUERY PLAN
  SELECT donor_id, read_at FROM parish_content_reads
  WHERE parish_id = ? AND content_type = ? AND content_id = ?
  ORDER BY read_at ASC, donor_id ASC
`).all("parish-one", "announcement", "content-one");
assert.ok(
  receiptPlan.some(({ detail }) => detail.includes("idx_parish_content_reads_receipts")),
  "reverse receipt lookup should use its parish/content covering index"
);
assert.equal(
  receiptPlan.some(({ detail }) => detail.includes("TEMP B-TREE")),
  false,
  "receipt ordering should be satisfied by the covering index"
);
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

console.log("PASS - shared content read tracking is bidirectional, scoped, ordered, and feature-agnostic");
