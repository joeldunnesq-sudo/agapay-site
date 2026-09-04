import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { adminAppPagePaths, adminAppScriptPaths, readAdminAppSource } from './lib/admin-dashboard-source.mjs';
import { readRepositoryFiles, repoRoot } from './lib/browser-composed-source.mjs';
import { donorAppPagePaths, donorAppScriptPaths, readDonorAppSource } from './lib/donor-app-source.mjs';
import { learnDashboardModulePaths, readLearnDashboardSource } from './lib/learn-dashboard-source.mjs';

const contracts = JSON.parse(readFileSync(path.join(repoRoot, 'config/refactor-contracts.json'), 'utf8'));

function inlineHandlerNames(source) {
  const nonCallableKeywords = new Set(['if', 'for', 'switch', 'while', 'with']);
  const platformCalls = new Set([
    'alert',
    'Boolean',
    'confirm',
    'decodeURI',
    'decodeURIComponent',
    'encodeURI',
    'encodeURIComponent',
    'Number',
    'parseFloat',
    'parseInt',
    'String',
  ]);
  const names = new Set();
  for (const attribute of source.matchAll(/\bon[a-z]+\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    for (const call of attribute[2].matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
      if (!nonCallableKeywords.has(call[1]) && !platformCalls.has(call[1])) names.add(call[1]);
    }
  }
  return names;
}

function classicGlobalNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/\b(?:window|globalThis)\.([A-Za-z_$][\w$]*)\s*=/g)) {
    names.add(match[1]);
  }
  return names;
}

function assertInlineHandlerContract(name, pagePaths, appSource) {
  const contractSource = `${readRepositoryFiles(pagePaths)}\n${appSource}`;
  const handlers = inlineHandlerNames(contractSource);
  const globals = classicGlobalNames(appSource);
  const missing = [...handlers].filter((handler) => !globals.has(handler)).sort();
  assert.deepEqual(missing, [], `${name} inline handlers lost their classic-script global: ${missing}`);
  assert.ok(handlers.size > 0, `${name} should expose a non-empty inline-handler contract`);
}

const adminScripts = adminAppScriptPaths();
assert.ok(adminScripts.includes('public/admin/app.js'));
assertInlineHandlerContract('Admin', adminAppPagePaths, readAdminAppSource());

const donorScripts = donorAppScriptPaths();
assert.ok(donorScripts.includes('public/donor/app.js'));
assert.ok(donorAppPagePaths.length >= 10, 'Donor source discovery should cover every app-backed page');
assertInlineHandlerContract('Donor', donorAppPagePaths, readDonorAppSource());

const learnModules = learnDashboardModulePaths();
assert.equal(learnModules[0], 'public/learn/dashboard-shell.js');
assert.ok(learnModules.includes('public/learn/dashboard-view-models.js'));
assert.ok(learnModules.includes('public/learn/sanitized-render.js'));
assert.match(readLearnDashboardSource(), /function toDashboardViewModel|function renderDashboard/);

const workerSource = readFileSync(path.join(repoRoot, 'src/worker.js'), 'utf8');
const registry = workerSource.match(/const API_ROUTE_REGISTRIES = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert.ok(registry, 'Worker must retain an explicit API route registry');
const actualRouteOrder = [...registry[1].matchAll(/route([A-Z][A-Za-z]+)Request/g)].map(
  (match) => `${match[1][0].toLowerCase()}${match[1].slice(1)}`
);
assert.deepEqual(actualRouteOrder, contracts.workerRouteOrder, 'Worker route precedence changed');

for (const [file, exportContract] of Object.entries(contracts.moduleExports)) {
  const module = await import(pathToFileURL(path.join(repoRoot, file)).href);
  const exportedNames = Object.keys(module).sort();
  const digest = createHash('sha256').update(JSON.stringify(exportedNames)).digest('hex');
  assert.equal(exportedNames.length, exportContract.count, `${file} public export count changed`);
  assert.equal(digest, exportContract.sha256, `${file} public exports changed: ${exportedNames.join(', ')}`);
}

for (const [file, artifact] of Object.entries(contracts.generatedArtifacts)) {
  assert.equal(artifact.status, 'frozen_orphaned_generated_bundle');
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  const canonicalSource = source.replace(/\r\n?/g, '\n');
  const digest = createHash('sha256').update(canonicalSource, 'utf8').digest('hex');
  assert.equal(digest, artifact.sha256, `${file} changed without recovering or replacing its generator`);
  assert.match(source.slice(0, 180), /GENERATED from dc-runtime\/src\/\*\.ts/);
}

const guardrailGuide = readFileSync(
  path.join(repoRoot, 'docs/architecture/legacy-module-refactor-guardrails.md'),
  'utf8'
);
assert.match(guardrailGuide, /frozen orphaned generated bundle/i);
assert.match(guardrailGuide, /preserve route precedence/i);
assert.match(guardrailGuide, /inline handler/i);

console.log(
  `PASS - extraction contracts cover ${adminScripts.length} Admin scripts, ${donorScripts.length} Donor scripts, ${learnModules.length} Learn modules, ${contracts.workerRouteOrder.length} route registries, and ${Object.keys(contracts.moduleExports).length} module export surfaces`
);
