import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

import { buildParishDirectoryPdf, groupHouseholds } from "../src/lib/directory-pdf.js";

const rows = [];
for (let index = 0; index < 24; index++) {
  const family = `Family ${String.fromCharCode(65 + (index % 8))}${index + 1}`;
  rows.push({
    household_id: `household-${index}`,
    display_name: family,
    person_id: `person-${index}-1`,
    preferred_name: `Adult ${index + 1}`,
    city: "Amarillo",
    region: "TX",
    saint_name: "St. Nicholas",
    feast_month_day: "12-06",
    email: `family${index + 1}@example.org`,
    phone: `(555) 100-${String(index).padStart(4, "0")}`
  });
  rows.push({
    household_id: `household-${index}`,
    display_name: family,
    person_id: `person-${index}-2`,
    preferred_name: `Spouse ${index + 1}`,
    city: "Amarillo",
    region: "TX",
    saint_name: "St. Anna",
    feast_month_day: "07-25",
    email: "",
    phone: ""
  });
}

const grouped = groupHouseholds(rows);
assert.equal(grouped.length, 24);
assert.equal(grouped[0].members.length, 2);
assert.equal(grouped[0].members[0].namedays[0].saint, "St. Nicholas");

const mark = readFileSync(new URL("../public/mark.png", import.meta.url));
const bytes = await buildParishDirectoryPdf({
  parish: { parishName: "St. Fiacre Orthodox Church", city: "Amarillo", state: "TX" },
  directory: {
    generatedAt: "2026-07-28T12:00:00.000Z",
    privacyReminder: "Private parish directory. Do not distribute outside the parish.",
    households: rows
  },
  logo: { bytes: mark, contentType: "image/png" }
});
assert.ok(bytes.byteLength > 10_000, "the directory PDF should contain real designed content");
assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "%PDF");
const pdf = await PDFDocument.load(bytes);
assert.ok(pdf.getPageCount() >= 3, "a cover and multiple directory pages should be generated");
assert.equal(pdf.getTitle(), "St. Fiacre Orthodox Church Directory");
for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 792 });

const handler = readFileSync(new URL("../src/handlers/directory-admin.js", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/directory/skills-service.js", import.meta.url), "utf8");
const parishApp = readFileSync(new URL("../public/parish/app.js", import.meta.url), "utf8");
assert.ok(handler.includes('path === "/exports/directory.pdf"'));
assert.ok(handler.includes('new URL("/mark.png", request.url)'));
assert.ok(handler.includes("registration.logoStorageKey"));
assert.ok(service.includes("c.owner_type = 'person' AND c.owner_id = p.id"));
assert.ok(!service.includes("a.line1"), "the printable member directory must never select a street address");
assert.ok(parishApp.includes("downloadDirectoryAdminExport('/exports/directory.pdf')"));
assert.ok(!parishApp.includes('pdx-dir-table-row" data-namedays="${escapeAttr(namedaySearch)}" data-skills="${escapeAttr(householdSkills.join(\' \'))}" onclick='));

if (process.env.DIRECTORY_PDF_RENDER_SAMPLE === "1") {
  const outputDir = new URL("../output/pdf/", import.meta.url);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(new URL("sample-parish-directory.pdf", outputDir), bytes);
}

console.log("PASS - branded, spiral-binding-friendly parish Directory PDF");
