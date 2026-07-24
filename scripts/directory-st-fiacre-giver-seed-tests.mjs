import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");
for (const file of [
  "../migrations/0022_directory_canonical_foundation.sql",
  "../migrations/0023_directory_contact_privacy_publication.sql",
  "../migrations/0033_directory_household_namedays.sql"
]) {
  db.exec(await readFile(new URL(file, import.meta.url), "utf8"));
}
db.exec(`
  CREATE TABLE donor_offerings (
    id TEXT PRIMARY KEY,
    donor_email TEXT NOT NULL,
    parish_id TEXT,
    payment_status TEXT,
    data TEXT NOT NULL
  );
  INSERT INTO donor_offerings VALUES
    ('gift_1', 'mary.oconnell@email.com', 'st-fiacre', 'paid', '{"donorName":"Mary OConnell"}'),
    ('gift_2', 'mary.oconnell@email.com', 'st-fiacre', 'paid', '{"donorName":"Mary O''Connell"}'),
    ('gift_3', 'james.mcallister@email.com', 'st-fiacre', 'paid', '{"donorName":"James McAllister"}'),
    ('gift_4', 'joeldunnesq@gmail.com', 'st-fiacre', 'paid', '{"donorName":"Joel Dunn"}'),
    ('gift_5', 'anonymous@example.com', 'st-fiacre', 'paid', '{"donorName":"Anonymous"}'),
    ('gift_6', 'other@example.com', 'other-parish', 'paid', '{"donorName":"Other Parish"}');
`);

const seed = await readFile(new URL("./directory-st-fiacre-giver-seed.sql", import.meta.url), "utf8");
db.exec(seed);
db.exec(seed);

const families = db.prepare("SELECT display_name FROM directory_households ORDER BY display_name").all().map((row) => row.display_name);
assert.equal(families.length, 16);
assert.ok(families.includes("The McAllister Family"));
assert.ok(families.includes("The O'Connell Family"));
assert.ok(!families.includes("The Dunn Family"));
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_people").get().count, 16);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_household_members").get().count, 16);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_parish_affiliations").get().count, 16);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_publication_profiles").get().count, 32);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_addresses WHERE visibility='directory_members'").get().count, 16);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_household_namedays WHERE visibility='directory_members'").get().count, 5);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_contact_methods").get().count, 0);

console.log("PASS - St. Fiacre giver directory seed is scoped, private, deduplicated, and idempotent");
