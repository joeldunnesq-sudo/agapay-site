#!/usr/bin/env node
// Verifies that every static-file target in src/worker.js's route tables
// actually exists under public/. Fails the build if a Worker route points
// at a file that doesn't exist -- this is what would otherwise surface as
// a silent 404 in production.
//
// Rebuilt 2026-07-06: a prior version of this file (and its wiring into
// `npm run check`) was on `main` as of 2026-07-05 but had disappeared by
// the next fresh clone -- see docs/SOFT_LAUNCH_READINESS.md change log.
// Rebuilding from scratch against the CURRENT worker.js, not restoring
// old file content blind, since the route tables may have changed too.
//
// Deliberately does NOT `import` src/worker.js -- that file assumes a
// Workers runtime (env bindings, etc.) at module scope in places. Instead
// this reads it as text and parses out just the route table literals,
// the same convention scripts/check.mjs already uses.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const workerSource = readFileSync(path.join(repoRoot, "src/worker.js"), "utf8");
const publicDir = path.join(repoRoot, "public");

let failures = 0;
let fileTargetsChecked = 0;
let skippedNonFileTargets = [];

function checkFile(routeLabel, targetPath) {
  fileTargetsChecked++;
  const onDisk = path.join(publicDir, targetPath);
  if (!existsSync(onDisk)) {
    failures++;
    console.error(`FAIL: ${routeLabel} -> ${targetPath} (missing at public${targetPath})`);
  }
}

// --- 1. MYAGAPAY_ASSET_ROUTES -------------------------------------------
// A Map of pathname -> target. Some targets are real files (end in .html
// or .js) and should be checked; others are further internal path
// rewrites (e.g. "/marketplace", "/learn/dashboard") that get re-routed
// again elsewhere, not direct file targets -- those are skipped, not
// silently ignored (logged at the end).
const assetRoutesBlock = workerSource.match(
  /const MYAGAPAY_ASSET_ROUTES = new Map\(\[([\s\S]*?)\]\);/
);
if (!assetRoutesBlock) {
  console.error("FAIL: could not find MYAGAPAY_ASSET_ROUTES in src/worker.js -- has it been renamed?");
  process.exit(1);
}
const assetRoutePairs = [...assetRoutesBlock[1].matchAll(/\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g)];
if (assetRoutePairs.length === 0) {
  console.error("FAIL: MYAGAPAY_ASSET_ROUTES parsed to zero entries -- check the regex against the current file format.");
  process.exit(1);
}
for (const [, routePath, target] of assetRoutePairs) {
  if (/\.(html|js|css)$/i.test(target)) {
    checkFile(routePath, target);
  } else {
    skippedNonFileTargets.push(`${routePath} -> ${target}`);
  }
}

// --- 2. Hardcoded rewrites in cleanAssetRequest() -----------------------
// A handful of one-off `url.pathname = "/....html";` assignments that
// aren't in the Map above. Pull every literal .html/.js assignment
// within the function body.
const cleanAssetFnMatch = workerSource.match(/function cleanAssetRequest\(request\) \{([\s\S]*?)\n\}/);
if (!cleanAssetFnMatch) {
  console.error("FAIL: could not find cleanAssetRequest() in src/worker.js -- has it been renamed?");
  process.exit(1);
}
const literalRewrites = [...cleanAssetFnMatch[1].matchAll(/url\.pathname\s*=\s*"([^"]+\.(?:html|js|css))"/g)];
for (const [, target] of literalRewrites) {
  checkFile("cleanAssetRequest() literal rewrite", target);
}

// --- 3. staticGivePages dynamic set --------------------------------------
// `staticGivePages.has(givePage)` -> `/give/${givePage}.html`. Enumerate
// the Set values and check each corresponding file.
const staticGivePagesMatch = cleanAssetFnMatch[1].match(/const staticGivePages = new Set\(\[([^\]]+)\]\)/);
if (staticGivePagesMatch) {
  const pages = [...staticGivePagesMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  for (const page of pages) {
    checkFile(`staticGivePages: ${page}`, `/give/${page}.html`);
  }
}

// --- 4. Explicit Odyssey coverage (per the original launch-readiness spec) ---
// Belt-and-suspenders: these are called out by name in the spec as the
// routes most likely to regress after the Odyssey restructuring, so check
// them directly even though they're also covered by #1 above.
const odysseyFiles = [
  "/learn/odyssey/index.html",
  "/learn/odyssey/dashboard/index.html",
  "/learn/odyssey/dashboard/login.html",
  "/learn/odyssey/dashboard/activate.html",
  // The Odyssey dashboard shell logic is NOT a separate file — it is folded
  // into the shared /learn/dashboard-shell.js (see isOdysseyLearnContext()
  // and learnExperience() there). A per-namespace shell.js/odyssey-shell.js
  // used to exist here as an unreferenced, drifted duplicate of the shared
  // renderer and was removed; check the shared file instead so this test
  // still fails loudly if the shared shell ever goes missing.
  "/learn/dashboard-shell.js",
];
for (const f of odysseyFiles) {
  checkFile("explicit Odyssey coverage", f);
}

// --- Report ---------------------------------------------------------------
console.log(
  `Route-map integrity: ${fileTargetsChecked} file-backed route target(s) checked against public/.`
);
if (skippedNonFileTargets.length) {
  console.log(
    `(${skippedNonFileTargets.length} internal path-rewrite entries skipped -- not file targets, e.g.:`
  );
  for (const entry of skippedNonFileTargets.slice(0, 5)) console.log(`   ${entry}`);
  console.log(")");
}

if (failures > 0) {
  console.error(`\n${failures} route(s) point at missing files.`);
  process.exit(1);
}
console.log("Route-map integrity OK.");
