import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { accountingEnabledFor } from "../src/lib/entitlements.js";
import { ACCOUNTING_HANDLER_FILES, enumerateAccountingRoutes } from "./lib/accounting-release-gates.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [serviceWorker, parishApp, gate1, gate2, gate3, bootstrap, helpers, smoke, deploy, workflow, signoff, packageJson, testManifest] = await Promise.all([
  read("public/service-worker.js"),
  readParishDashboardSource(),
  read("scripts/accounting-release-gate-1-check-print.mjs"),
  read("scripts/accounting-release-gate-2-sw-lifecycle.mjs"),
  read("scripts/accounting-release-gate-3-cross-tenant.mjs"),
  read("scripts/accounting-release-gate-bootstrap-users.mjs"),
  read("scripts/lib/accounting-release-gates.mjs"),
  read("scripts/accounting-smoke-live.mjs"),
  read(".github/workflows/deploy.yml"),
  read(".github/workflows/accounting-release-gates.yml"),
  read("docs/accounting/accounting-release-gates-signoff.md"),
  read("package.json"),
  read("scripts/test-manifest.mjs")
]);

assert.match(serviceWorker, /pathname\.startsWith\(["']\/api\/["']\).*return true/s);
assert.match(serviceWorker, /pathname\.startsWith\(["']\/parish["']\).*return true/s);
assert.match(gate2, /context\.setOffline\(true\)/);
assert.match(gate2, /registration\.update\(\)/);
assert.match(parishApp, /addEventListener\('offline'/);
assert.match(parishApp, /serviceWorker\?\.addEventListener\('controllerchange'/);
assert.match(parishApp, /open Accounting form was preserved/);
assert.match(packageJson, /"check:release-gates": "node scripts\/run-tests\.mjs release-gates"/);
assert.match(testManifest, /accounting-release-gate-2-sw-lifecycle\.mjs --static-only/);
console.log("PASS - authenticated parish/API caching remains prohibited and gate 2 is permanent");

for (const parishId of ["st-fiacre", "release-gate-b", "test-lubbock"]) {
  assert.equal(accountingEnabledFor({ parishId, subscriptionTier: "parish", subscriptionStatus: "trialing" }), true);
  assert.equal(accountingEnabledFor({ parishId, subscriptionTier: "starter" }), false);
}
assert.equal(accountingEnabledFor(null), false);
console.log("PASS - Accounting requires subscription entitlement for every parish, including test parishes");

const inventory = await enumerateAccountingRoutes();
assert.equal(inventory.coverage.length, ACCOUNTING_HANDLER_FILES.length);
assert.ok(inventory.coverage.every((item) => item.routes > 0));
assert.ok(inventory.routes.length >= 85, `Expected at least 85 routes; found ${inventory.routes.length}.`);
for (const family of ["ledger","setup-reports","payables-budgets","reconciliation-commerce","close","adjustments","governance","attachments","migration"]) {
  assert.ok(inventory.coverage.some((item) => item.handler.includes(family)), `Missing ${family} handler coverage.`);
}
assert.match(gate3, /runCrossTenantMatrix/);
assert.match(gate3, /platform-a-to-b/);
assert.match(gate3, /staff-b-to-a/);
assert.match(helpers, /\/api\/identity\/login/);
assert.match(helpers, /["']X-AGAPAY-User-Email["']/);
assert.doesNotMatch(helpers, /\/myagapay\/login|agapayDonorToken/);
assert.match(helpers, /sidebarParishName/);
assert.match(helpers, /accountingPane\[data-loaded=["']true["']\]/);
console.log(`PASS - gate 3 inventories ${inventory.routes.length} routes across ${inventory.coverage.length} handler files`);

for (const style of ["top_check_two_stubs","bottom_check_two_stubs","check_only"]) assert.match(gate1, new RegExp(style));
assert.match(gate1, /popup\.pdf/);
assert.match(gate1, /REPRINT\\s\*·\\s\*ORIGINAL CHECK/);
assert.match(gate1, /Void/);
assert.match(gate1, /Save vendor/);
assert.match(gate1, /Save draft bill/);
assert.match(gate1, /data-accounting-view=["']payables["']/);
assert.match(gate1, /loginPlatformUser/);
assert.match(gate1, /Independent platform-treasurer approval/);
assert.match(gate1, /hasText:\/posted\/i/);
assert.match(gate1, /AGAPAY Release Gate Checking/);
assert.match(gate1, /ledgerAccountId:assetAccount\.id/);
assert.match(gate1, /accountingCheckNumber/);
assert.match(gate1, /printAccountingCheck/);
assert.match(gate1, /ACCOUNTING_GATE_PARISH_B_ID/);
assert.doesNotMatch(gate1, /ACCOUNTING_GATE_PARISH_A_ID/);
console.log("PASS - gate 1 drives the real UI and preserves layout, reprint, and void evidence");

assert.match(deploy, /accounting-smoke-live\.mjs/);
assert.match(deploy, /post-deploy-accounting-smoke/);
assert.match(workflow, /accounting-release-gate-1-check-print\.mjs/);
assert.match(workflow, /accounting-release-gate-2-sw-lifecycle\.mjs/);
assert.match(workflow, /accounting-release-gate-3-cross-tenant\.mjs/);
assert.match(workflow, /accounting-release-gate-bootstrap-users\.mjs/);
assert.ok(
  workflow.indexOf("accounting-release-gate-bootstrap-users.mjs") < workflow.indexOf("accounting-release-gate-3-cross-tenant.mjs"),
  "Dedicated platform users must be bootstrapped before the cross-tenant gate."
);
assert.match(bootstrap, /hostname\.toLowerCase\(\)\.includes\(["']staging["']\)/);
assert.match(bootstrap, /memberships\/invitations/);
assert.match(bootstrap, /identity\/invitations/);
assert.match(bootstrap, /["']X-AGAPAY-User-Email["']/);
assert.match(bootstrap, /membership\.status === ["']active["']/);
assert.match(workflow, /upload-artifact@v7/);
assert.match(smoke, /ACCOUNTING_READ_SMOKE_PATHS|readAccountingSections/);
assert.match(signoff, /Physical check-stock verification/);
assert.match(signoff, /not complete/i);
console.log("PASS - evidence workflow, post-deploy smoke, and human sign-off record are wired");

console.log("accounting-release-gates-tests.mjs OK");

// RFC 6238 SHA-1 vector, truncated to the application's six digits.
const { completeGateMfa, gateTotp, gateMfaSecretName, encryptGateCredential } = await import('./lib/release-gate-mfa.mjs');
const { generateKeyPairSync, privateDecrypt, createDecipheriv } = await import('node:crypto');
const testSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
assert.equal(gateTotp(testSecret, 59000), '287082');
assert.throws(() => gateTotp('not-a-secret'), /Invalid/);
assert.equal(gateMfaSecretName('USER', 'a@example.test', { ACCOUNTING_GATE_USER_A_EMAIL: 'a@example.test' }), 'ACCOUNTING_GATE_USER_A_TOTP_SECRET');
assert.throws(() => gateMfaSecretName('USER', 'unknown', {}), /outside/);
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const envelope = encryptGateCredential(publicKey, { secret: testSecret, recoveryCodes: ['synthetic-code'] });
assert.ok(!JSON.stringify(envelope).includes(testSecret));
const encryptedKey = privateDecrypt({ key: privateKey, oaepHash: 'sha256' }, Buffer.from(envelope.key, 'base64'));
const decipher = createDecipheriv('aes-256-gcm', encryptedKey, Buffer.from(envelope.iv, 'base64'));
decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
const recovered = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString());
assert.equal(recovered.secret, testSecret);
const mfaArgs = {
  baseUrl: 'https://agapay-site-staging.joeldunnesq.workers.dev',
  payload: { mfaRequired: true, pendingToken: 'synthetic-pending' },
  secretName: 'ACCOUNTING_GATE_USER_A_TOTP_SECRET',
  env: { ACCOUNTING_GATE_USER_A_TOTP_SECRET: testSecret },
};
let calls = 0;
const completed = await completeGateMfa({ ...mfaArgs, fetchImpl: async (url, options) => {
  calls += 1;
  assert.ok(url.endsWith('/api/mfa/verify'));
  const body = JSON.parse(options.body);
  assert.equal(body.pendingToken, 'synthetic-pending');
  assert.match(body.code, /^\d{6}$/);
  assert.equal(options.redirect, 'error');
  return Response.json({ token: 'synthetic-session', recoveryCodes: ['do-not-return'] });
} });
assert.equal(completed.token, 'synthetic-session');
assert.equal(completed.recoveryCodes, undefined);
assert.equal(calls, 1);
await assert.rejects(completeGateMfa({ ...mfaArgs, baseUrl: 'https://agapay.app' }), /restricted/);
await assert.rejects(completeGateMfa({ ...mfaArgs, env: {} }), /protected secret/);
await assert.rejects(completeGateMfa({ ...mfaArgs, payload: { mfaRequired: true, enrollmentRequired: true }, env: {} }), /public key first/);
console.log('PASS - release-gate MFA uses valid TOTP, encrypts retained credentials, and refuses production or missing factors');
