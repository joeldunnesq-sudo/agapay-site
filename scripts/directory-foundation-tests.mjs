import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  addHouseholdAdmin,
  addHouseholdMember,
  addParishAffiliation,
  createHousehold,
  createPerson,
  deactivatePerson,
  directoryActorFromRequest,
  DirectoryServiceError,
  linkExternalIdentity,
  listPeopleForParish,
  removeHouseholdAdmin,
  removeHouseholdMember,
  removeParishAffiliation,
  updatePerson
} from "../src/directory/index.js";
import { createInvitation, acceptInvitation } from "../src/lib/memberships.js";
import { issuePlatformUserSession } from "../src/lib/identity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

function migration(name) {
  return readFileSync(path.join(repoRoot, "migrations", name), "utf8");
}

function makeD1Env({ includeAudit = true, includeIdentity = false } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  if (includeAudit) db.exec(migration("0014_audit_log.sql"));
  if (includeIdentity) {
    db.exec(`
      CREATE TABLE registrations (
        reference TEXT PRIMARY KEY, parish_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
        parish_name TEXT, community_type TEXT, stripe_account_id TEXT, stripe_subscription_id TEXT,
        received_at TEXT, updated_at TEXT NOT NULL, data TEXT NOT NULL
      );
    `);
    db.exec(migration("0020_platform_identity.sql"));
  }
  db.exec(migration("0022_directory_canonical_foundation.sql"));

  function wrap(sql) {
    return {
      _params: [],
      bind(...params) { this._params = params; return this; },
      async first() {
        const row = db.prepare(sql).get(...this._params);
        return row === undefined ? null : row;
      },
      async all() {
        return { results: db.prepare(sql).all(...this._params), success: true };
      },
      async run() {
        const info = db.prepare(sql).run(...this._params);
        return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
      }
    };
  }

  const AGAPAY_DB = {
    prepare: (sql) => wrap(sql),
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };

  return { env: { AGAPAY_DB }, db };
}

function actor(parishId = "st-fiacre", capabilities = ["directory.manage"]) {
  return { userId: `user_${parishId}`, parishId, capabilities };
}

function auditRows(db, action = "") {
  if (action) return db.prepare("SELECT * FROM audit_log WHERE action = ? ORDER BY created_at ASC").all(action);
  return db.prepare("SELECT * FROM audit_log ORDER BY created_at ASC").all();
}

async function makePersonAndHousehold(env, parishId = "st-fiacre") {
  const directoryActor = actor(parishId);
  const person = await createPerson(env, { actor: directoryActor, preferredName: "Anna Dunn", biologicalSex: "female" });
  const household = await createHousehold(env, { actor: directoryActor, displayName: "The Dunn Household" });
  return { directoryActor, person, household };
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

await test("migration creates normalized directory foundation tables only", async () => {
  const { db } = makeD1Env();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name);
  for (const table of [
    "directory_people",
    "directory_households",
    "directory_household_members",
    "directory_household_admins",
    "directory_person_links",
    "directory_parish_affiliations"
  ]) {
    assert.ok(tables.includes(table), `expected ${table}`);
  }
  for (const forbidden of ["directory_profiles", "directory_photos", "directory_skills", "directory_imports", "directory_exports"]) {
    assert.equal(tables.includes(forbidden), false);
  }
  const personColumns = db.prepare("PRAGMA table_info(directory_people)").all().map((row) => row.name);
  for (const forbidden of ["data", "email", "phone", "address_line1", "photo_key", "publication_status"]) {
    assert.equal(personColumns.includes(forbidden), false);
  }
});

await test("person lifecycle creates, updates, deactivates, and audits", async () => {
  const { env, db } = makeD1Env();
  const person = await createPerson(env, {
    actor: actor(),
    preferredName: "Anna",
    legalName: "Anna Dunn",
    middleName: "Maria",
    suffix: "Jr",
    dateOfBirth: "1980-02-03",
    biologicalSex: "female",
    notes: "Office-only foundation note."
  });
  assert.ok(person.id.startsWith("dir_person_"));
  assert.equal(person.preferredName, "Anna");
  assert.equal(person.createdByParishId, "st-fiacre");

  const updated = await updatePerson(env, { actor: actor(), personId: person.id, preferredName: "Anna Dunn", deceased: true });
  assert.equal(updated.preferredName, "Anna Dunn");
  assert.equal(updated.deceased, true);

  const deactivated = await deactivatePerson(env, { actor: actor(), personId: person.id });
  assert.equal(deactivated.active, false);

  assert.equal(auditRows(db, "directory.person_created").length, 1);
  assert.equal(auditRows(db, "directory.person_updated").length, 1);
  assert.equal(auditRows(db, "directory.person_deactivated").length, 1);
});

await test("household lifecycle adds and removes members with duplicate prevention", async () => {
  const { env, db } = makeD1Env();
  const { directoryActor, person, household } = await makePersonAndHousehold(env);
  const first = await addHouseholdMember(env, {
    actor: directoryActor,
    householdId: household.id,
    personId: person.id,
    relationship: "Head",
    startDate: "2026-01-01"
  });
  const second = await addHouseholdMember(env, {
    actor: directoryActor,
    householdId: household.id,
    personId: person.id,
    relationship: "Spouse"
  });
  assert.equal(first.id, second.id, "expected reactivation/update rather than duplicate row");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_household_members").get().count, 1);

  const removed = await removeHouseholdMember(env, {
    actor: directoryActor,
    householdId: household.id,
    personId: person.id,
    endDate: "2026-07-16"
  });
  assert.equal(Number(removed.active), 0);
  assert.equal(auditRows(db, "directory.household_member_added").length, 2);
  assert.equal(auditRows(db, "directory.household_member_removed").length, 1);
});

await test("multiple household administrators are supported", async () => {
  const { env, db } = makeD1Env();
  const { directoryActor, person: first, household } = await makePersonAndHousehold(env);
  const second = await createPerson(env, { actor: directoryActor, preferredName: "John Dunn", biologicalSex: "male" });

  const adminOne = await addHouseholdAdmin(env, { actor: directoryActor, householdId: household.id, personId: first.id });
  const adminTwo = await addHouseholdAdmin(env, { actor: directoryActor, householdId: household.id, personId: second.id });
  assert.notEqual(adminOne.id, adminTwo.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_household_admins WHERE active = 1").get().count, 2);

  await removeHouseholdAdmin(env, { actor: directoryActor, householdId: household.id, personId: first.id });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_household_admins WHERE active = 1").get().count, 1);
  assert.equal(auditRows(db, "directory.household_admin_added").length, 2);
  assert.equal(auditRows(db, "directory.household_admin_removed").length, 1);
});

await test("multiple parish affiliations are supported and removable", async () => {
  const { env, db } = makeD1Env();
  const { directoryActor, person } = await makePersonAndHousehold(env);

  await addParishAffiliation(env, { actor: directoryActor, personId: person.id, status: "Member", joinedDate: "2020-01-01" });
  await addParishAffiliation(env, { actor: directoryActor, personId: person.id, status: "Clergy", joinedDate: "2022-01-01" });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_parish_affiliations WHERE active = 1").get().count, 2);

  const removed = await removeParishAffiliation(env, {
    actor: directoryActor,
    personId: person.id,
    status: "clergy",
    leftDate: "2026-07-16"
  });
  assert.equal(Number(removed.active), 0);
  assert.equal(auditRows(db, "directory.parish_affiliation_added").length, 2);
  assert.equal(auditRows(db, "directory.parish_affiliation_removed").length, 1);
});

await test("external identity links support initial types and reject duplicates", async () => {
  const { env, db } = makeD1Env();
  const { directoryActor, person } = await makePersonAndHousehold(env);
  await linkExternalIdentity(env, { actor: directoryActor, personId: person.id, linkType: "platform_user", externalId: "user_123" });
  await linkExternalIdentity(env, { actor: directoryActor, personId: person.id, linkType: "donor", externalId: "anna@example.org" });
  await linkExternalIdentity(env, { actor: directoryActor, personId: person.id, linkType: "learn_student", externalId: "learn_child_123" });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_person_links").get().count, 3);

  const other = await createPerson(env, { actor: directoryActor, preferredName: "Duplicate Candidate" });
  await assert.rejects(
    () => linkExternalIdentity(env, { actor: directoryActor, personId: other.id, linkType: "donor", externalId: "anna@example.org" }),
    (error) => error instanceof DirectoryServiceError && error.code === "duplicate_external_link"
  );
  assert.equal(auditRows(db, "directory.external_link_created").length, 3);
});

await test("batch rollback prevents half-created domain records when audit insert fails", async () => {
  const { env, db } = makeD1Env({ includeAudit: false });
  await assert.rejects(
    () => createHousehold(env, { actor: actor(), displayName: "Rollback Household" }),
    /no such table: audit_log/
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_households").get().count, 0);
});

await test("cross-parish isolation denies foreign updates and membership changes", async () => {
  const { env } = makeD1Env();
  const a = actor("st-a");
  const b = actor("st-b");
  const person = await createPerson(env, { actor: a, preferredName: "Parish A Person" });
  const householdB = await createHousehold(env, { actor: b, displayName: "Parish B Household" });

  await assert.rejects(
    () => updatePerson(env, { actor: b, personId: person.id, preferredName: "Wrong Parish" }),
    (error) => error instanceof DirectoryServiceError && error.code === "not_found"
  );
  await assert.rejects(
    () => addHouseholdMember(env, { actor: b, householdId: householdB.id, personId: person.id, relationship: "other" }),
    (error) => error instanceof DirectoryServiceError && error.code === "not_found"
  );

  const visibleToA = await listPeopleForParish(env, "st-a");
  const visibleToB = await listPeopleForParish(env, "st-b");
  assert.equal(visibleToA.some((row) => row.id === person.id), true);
  assert.equal(visibleToB.some((row) => row.id === person.id), false);
});

await test("service authorization requires platform user, capability, and matching parish", async () => {
  const { env } = makeD1Env();
  await assert.rejects(
    () => createPerson(env, { actor: { parishId: "st-fiacre", capabilities: ["directory.manage"] }, preferredName: "No User" }),
    (error) => error instanceof DirectoryServiceError && error.code === "unauthorized"
  );
  await assert.rejects(
    () => createPerson(env, { actor: actor("st-fiacre", []), preferredName: "No Capability" }),
    (error) => error instanceof DirectoryServiceError && error.code === "forbidden"
  );
  await assert.rejects(
    () => createPerson(env, { actor: actor("st-fiacre"), parishId: "st-other", preferredName: "Wrong Parish" }),
    (error) => error instanceof DirectoryServiceError && error.code === "forbidden"
  );
});

await test("request authorization context reuses the platform capability framework", async () => {
  const { env } = makeD1Env({ includeAudit: true, includeIdentity: true });
  const invitation = await createInvitation(env, {
    parishId: "st-fiacre",
    email: "directory-admin@example.org",
    capabilities: ["directory.manage"]
  });
  const accepted = await acceptInvitation(env, { token: invitation.token, password: "directory admin password" });
  const session = await issuePlatformUserSession(env, accepted.userId);
  const request = new Request("https://agapay.test/api/directory/internal", {
    headers: {
      Authorization: `Bearer ${session.token}`,
      "X-AGAPAY-User-Email": "directory-admin@example.org"
    }
  });

  const directoryActor = await directoryActorFromRequest(request, env, "st-fiacre");
  assert.ok(directoryActor);
  assert.equal(directoryActor.userId, accepted.userId);
  assert.equal(directoryActor.parishId, "st-fiacre");
  assert.ok(directoryActor.capabilities.includes("directory.manage"));

  const person = await createPerson(env, { actor: directoryActor, preferredName: "Authorized Admin" });
  assert.equal(person.preferredName, "Authorized Admin");
});

if (process.exitCode) {
  console.error("Some directory foundation tests FAILED.");
  process.exit(process.exitCode);
}

console.log(`${passed} test(s) passed.`);
console.log("All directory foundation tests passed.");
