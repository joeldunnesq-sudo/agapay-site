import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const overview = read("public/give/index.html");
const overviewStyles = read("public/styles/index.css");
const server = read("server.mjs");
const worker = read("src/worker.js");

assert.equal(existsSync(path.join(root, "public/give/why.html")), false, "the retired Why page must stay removed");

for (const id of ["why", "features", "how-it-works", "pricing", "faq"]) {
  assert.match(overview, new RegExp(`id=["']${id}["']`), `the council overview must expose #${id}`);
  assert.match(overview, new RegExp(`href=["']#${id}["']`), `the sticky council guide must link to #${id}`);
}
assert.match(overview, /href="\/give\/features">See all features →<\/a>/, "the overview must link to the deep Features page");
assert.match(overview, /href="\/give\/pricing">See full pricing →<\/a>/, "the overview must link to the deep Pricing page");
assert.match(overviewStyles, /\.council-jump-nav\s*\{[\s\S]*?position:\s*sticky/, "the council guide must remain sticky");
assert.match(overview, /Julian and Revised-Julian calendar support/, "the unique liturgical-calendar distinction must remain consolidated");
assert.match(overview, /Built for the nave, not adapted from the megachurch\./, "the unique Orthodox-first positioning must remain consolidated");

const staticServerRoute = server.match(/else if \(\[(.*?)\]\.includes\(pathname\)\) \{\s*pathname = `\$\{pathname\}\.html`;/s)?.[1] || "";
assert.doesNotMatch(staticServerRoute, /\/give\/why/, "resolveStaticPath must not map /give/why to a deleted file");
assert.match(server, /\["\/give\/why", "\/give\/why\.html", "\/give\/why\/"\][\s\S]*?requestUrl\.hash = "why";[\s\S]*?writeHead\(301/, "the local server must explicitly redirect every retired /give/why variant");
assert.match(server, /\["\/why", "\/give#why"\][\s\S]*?\["\/why\.html", "\/give#why"\][\s\S]*?\["\/why\/", "\/give#why"\]/, "legacy bare Why routes must target the Give overview anchor");
assert.match(server, /canonicalGivingPath\.split\("#"\)[\s\S]*?requestUrl\.hash = canonicalHash/, "legacy redirects must preserve anchors as URL fragments");

const staticWorkerRoute = worker.match(/const staticGivePages = new Set\(\[(.*?)\]\)/s)?.[1] || "";
assert.doesNotMatch(staticWorkerRoute, /"why"/, "the production asset router must not map /give/why to a deleted file");
assert.match(worker, /\["\/give\/why", "\/give\/why\.html", "\/give\/why\/"\][\s\S]*?url\.hash = "why";[\s\S]*?Response\.redirect\(url\.toString\(\), 301\)/, "the production worker must mirror the retired-page redirect");

function filesUnder(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    return statSync(fullPath).isDirectory() ? filesUnder(fullPath) : [fullPath];
  });
}

const staleInternalReferences = filesUnder(path.join(root, "public"))
  .filter((file) => /\.(?:html|js|xml)$/i.test(file))
  .filter((file) => readFileSync(file, "utf8").includes("/give/why"));
assert.deepEqual(staleInternalReferences, [], "public pages, navigation, and sitemap must not link to the retired /give/why URL");

const { server: localServer } = await import("../server.mjs");
await new Promise((resolve, reject) => {
  localServer.once("error", reject);
  localServer.listen(0, "127.0.0.1", resolve);
});
try {
  const address = localServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  for (const retiredPath of ["/give/why", "/give/why.html", "/give/why/", "/why", "/why.html", "/why/"]) {
    const response = await fetch(`${origin}${retiredPath}`, { redirect: "manual" });
    assert.equal(response.status, 301, `${retiredPath} must return a permanent redirect`);
    assert.equal(response.headers.get("location"), `${origin}/give#why`, `${retiredPath} must preserve the Give overview #why destination`);
  }
  for (const giveOverviewPath of ["/give", "/give/"]) {
    const response = await fetch(`${origin}${giveOverviewPath}?source=direct`, { redirect: "manual" });
    assert.equal(response.status, 200, `${giveOverviewPath} must serve the dedicated Give overview`);
  }
  for (const giveAlias of ["/give.html", "/give/index.html"]) {
    const response = await fetch(`${origin}${giveAlias}?source=legacy`, { redirect: "manual" });
    assert.equal(response.status, 301, `${giveAlias} must return a permanent redirect`);
    assert.equal(response.headers.get("location"), `${origin}/give?source=legacy`, `${giveAlias} must preserve the query while redirecting to the canonical Give overview`);
  }
  for (const preservedPath of ["/give/features", "/give/pricing", "/give/how-it-works"]) {
    const response = await fetch(`${origin}${preservedPath}`, { redirect: "manual" });
    assert.equal(response.status, 200, `${preservedPath} must remain independently addressable`);
  }
} finally {
  await new Promise(resolve => localServer.close(resolve));
}

console.log("PASS - council Give overview consolidation, anchors, redirects, and retired Why references");
