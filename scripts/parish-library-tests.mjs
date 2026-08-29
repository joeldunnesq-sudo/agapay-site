import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  archiveParishLibraryResource,
  createParishLibraryResource,
  listParishLibraryResources,
  PARISH_LIBRARY_CATEGORIES,
  updateParishLibraryResource,
  validateParishLibraryPdf,
} from "../src/handlers/parish-library.js";
import {
  ensureStFiacreParishLibraryDemo,
  getParishLibrarySettings,
  setParishLibraryEnabled,
  ST_FIACRE_LIBRARY_DEMO_RESOURCES,
} from "../src/lib/parish-library.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(path.join(root, "migrations", "0105_parish_library.sql"), "utf8"));
const db = {
  prepare(sql) {
    return {
      parameters: [],
      bind(...parameters) { this.parameters = parameters; return this; },
      async first() { return sqlite.prepare(sql).get(...this.parameters) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...this.parameters) }; },
      async run() { const result = sqlite.prepare(sql).run(...this.parameters); return { success: true, meta: { changes: result.changes } }; },
    };
  },
};

assert.deepEqual(PARISH_LIBRARY_CATEGORIES, ["prayer_worship", "faith_formation", "newcomers", "ministries", "forms_policies", "pastoral_letters", "parish_life"]);
assert.deepEqual(await getParishLibrarySettings(db, "parish-a"), { enabled: false, updatedAt: "" });
assert.equal((await setParishLibraryEnabled(db, { parishId: "parish-a", enabled: true, updatedBy: "staff@example.test" })).enabled, true);

assert.equal(await ensureStFiacreParishLibraryDemo(db, "st-fiacre"), true);
assert.equal((await getParishLibrarySettings(db, "st-fiacre")).enabled, true);
const demoResources = await listParishLibraryResources(db, "st-fiacre", { publishedOnly: true });
assert.equal(demoResources.length, ST_FIACRE_LIBRARY_DEMO_RESOURCES.length);
assert.ok(demoResources.every((resource) => resource.resourceType === "link" && resource.status === "published"));
assert.ok(demoResources.every((resource) => /^https:\/\/(?:www\.)?saintjonah\.org\//.test(resource.url)));
assert.equal(await ensureStFiacreParishLibraryDemo(db, "st-fiacre"), false, "demo seed should be idempotent");
assert.equal((await listParishLibraryResources(db, "st-fiacre", { publishedOnly: true })).length, demoResources.length);
await setParishLibraryEnabled(db, { parishId: "st-fiacre", enabled: false, updatedBy: "staff@example.test" });
assert.equal((await getParishLibrarySettings(db, "st-fiacre")).enabled, false, "a later staff choice should remain authoritative");

const link = await createParishLibraryResource(db, {
  parishId: "parish-a", createdBy: "staff@example.test",
  input: { title: "Welcome guide", description: "Start here", category: "newcomers", resourceType: "link", url: "https://example.org/welcome", pinned: true },
});
assert.equal(link.status, "draft");
assert.equal(link.url, "https://example.org/welcome");
assert.deepEqual(await listParishLibraryResources(db, "parish-a", { publishedOnly: true }), []);
await updateParishLibraryResource(db, { parishId: "parish-a", resourceId: link.id, input: { status: "published" } });

const pdf = await createParishLibraryResource(db, {
  parishId: "parish-a", createdBy: "staff@example.test",
  input: { title: "Parish handbook", description: "Policies and contacts", category: "forms_policies", resourceType: "pdf" },
});
await assert.rejects(
  updateParishLibraryResource(db, { parishId: "parish-a", resourceId: pdf.id, input: { status: "published" } }),
  /Upload the PDF/,
);
sqlite.prepare("UPDATE parish_library_resources SET object_key = ?, file_name = ?, file_size = ? WHERE id = ?")
  .run("parish-library/parish-a/handbook.pdf", "handbook.pdf", 128, pdf.id);
await updateParishLibraryResource(db, { parishId: "parish-a", resourceId: pdf.id, input: { status: "published" } });
let published = await listParishLibraryResources(db, "parish-a", { publishedOnly: true });
assert.deepEqual(published.map(({ id }) => id), [link.id, pdf.id], "featured resources should sort first");
await archiveParishLibraryResource(db, { parishId: "parish-a", resourceId: link.id });
published = await listParishLibraryResources(db, "parish-a", { publishedOnly: true });
assert.deepEqual(published.map(({ id }) => id), [pdf.id]);

await assert.rejects(
  createParishLibraryResource(db, { parishId: "parish-a", createdBy: "staff", input: { title: "Unsafe", resourceType: "link", url: "http://localhost/internal" } }),
  /public HTTPS/,
);
assert.throws(() => sqlite.prepare(`
  INSERT INTO parish_library_resources (id, parish_id, title, category, resource_type, created_by)
  VALUES ('bad', 'parish-a', 'Bad', 'unknown', 'pdf', 'staff')
`).run(), /CHECK constraint failed/);

const validPdf = await validateParishLibraryPdf(new Request("https://agapay.test/upload", { method: "POST", headers: { "Content-Type": "application/pdf" }, body: new TextEncoder().encode("%PDF-1.7\nfixture") }));
assert.equal(validPdf.size, 16);
const fakePdf = await validateParishLibraryPdf(new Request("https://agapay.test/upload", { method: "POST", headers: { "Content-Type": "application/pdf" }, body: new TextEncoder().encode("not-a-pdf") }));
assert.equal(fakePdf.status, 415);

const [worker, handler, shell, donorPage, donorScript, parishLifePage, adminPage, adminScript, adminStyles, wrangler] = [
  "src/worker.js", "src/handlers/parish-library.js", "public/myagapay-shell.js", "public/myagapay/library.html", "public/myagapay/library.js",
  "public/myagapay/parish-life.html", "public/parish/dashboard.html", "public/parish/library.js", "public/parish/library.css", "wrangler.toml",
].map((file) => readFileSync(path.join(root, file), "utf8"));
assert.match(worker, /handleDonorParishLibrary/);
assert.match(worker, /handleParishLibrary/);
assert.match(shell, /const sacramentOrLibrary = parishCapabilities\.sacramentsEnabled[\s\S]*parishCapabilities\.libraryEnabled[\s\S]*byId\.get\("history"\)/);
assert.match(shell, /function hamburgerProducts\(\)[\s\S]*return visibleProducts\(\)/);
assert.match(shell, /function mobileAppMenuLinks\(\)[\s\S]*const links = hamburgerProducts\(\)/);
assert.match(shell, /mobileLabel: "Library"/);
assert.match(shell, /pathname\.startsWith\("\/myagapay\/library"\)/);
assert.match(donorPage, /<h1[^>]*>Parish Library<\/h1>/);
assert.match(donorPage, /class="koinonia-mobile-appbar"/);
assert.match(donorPage, /class="page koinonia-inner-shell library-page"/);
assert.match(donorPage, /class="koinonia-page-heading library-page-heading"/);
assert.doesNotMatch(donorPage, /library-hero/, "Library should use the shared app heading instead of a marketing-style hero");
assert.match(donorPage, /koinonia-inner\.css\?v=20260817bookstoreprayer1/);
assert.match(donorPage, /library\.css\?v=20260827libraryapp1/);
assert.match(donorPage, /myagapay-shell\.js\?v=20260827librarymenu1/);
assert.match(parishLifePage, /myagapay-shell\.js\?v=20260827librarymenu1/);
assert.match(donorScript, /fetch\("\/api\/donor\/library"/);
assert.match(donorScript, /data-library-pdf/);
assert.match(adminPage, /id="nav-library"/);
assert.match(adminPage, /id="tab-library"/);
assert.match(adminPage, /library\.css\?v=20260829fullscreen1/);
assert.match(adminPage, /library\.js\?v=20260825library2/);
assert.match(handler, /PARISH_LIBRARY_ASSETS|parish-library\/|Parish Library file storage/);
assert.match(handler, /parts\[0\] === "settings" && request\.method === "GET"/);
const parishDashboardScript = readFileSync(path.join(root, "public", "parish", "app.js"), "utf8");
assert.match(parishDashboardScript, /refreshParishLibraryNavigationStatus\(\)/);
assert.match(parishDashboardScript, /library\/settings/);
assert.match(parishDashboardScript, /const libraryIncluded = isParishPlusActive\(\)/);
assert.doesNotMatch(parishDashboardScript, /syncModuleStatusNavigation\('library', sacramentsActive/);
assert.match(adminScript, /resourceType[\s\S]*PDF document[\s\S]*Article link/);
assert.match(adminScript, /pl-admin-hero sw-suite-hero/);
assert.match(adminScript, /pl-admin-metrics/);
assert.match(adminScript, /data-pl-filter/);
assert.match(adminScript, /pl-admin-library-card[\s\S]*pl-admin-editor-card/, "resource catalog should come before the editor");
assert.match(adminStyles, /grid-template-columns:\s*minmax\(0,\s*1\.35fr\)\s+minmax\(310px,\s*0\.75fr\)/);
assert.match(adminStyles, /@media \(max-width:\s*800px\)[\s\S]*overflow-x:\s*clip/);
assert.match(adminStyles, /bottom:\s*calc\(5\.25rem \+ env\(safe-area-inset-bottom\)\)/);
assert.match(adminStyles, /\.parish-library-admin\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;/);
assert.match(wrangler, /binding = "PARISH_LIBRARY_ASSETS"[\s\S]*bucket_name = "agapay-group-message-assets"/);

console.log("PASS - parish-scoped library resources, private PDFs, staff controls, and adaptive bottom navigation");
