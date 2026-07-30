import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  baseUrlFrom,
  enumerateAccountingRoutes,
  loginParishAccounting,
  loginPlatformUser,
  readAccountingSections,
  runCrossTenantMatrix,
  writeArtifact
} from "./lib/accounting-release-gates.mjs";

const baseUrl = baseUrlFrom();
const allowUnconfigured = process.argv.includes("--allow-unconfigured");
const requiredNames = [
  "ACCOUNTING_GATE_PARISH_A_ID", "ACCOUNTING_GATE_PARISH_B_ID",
  "ACCOUNTING_GATE_USER_A_EMAIL", "ACCOUNTING_GATE_USER_A_PASSWORD",
  "ACCOUNTING_GATE_USER_B_EMAIL", "ACCOUNTING_GATE_USER_B_PASSWORD",
  "ACCOUNTING_GATE_PARISH_A_PASSWORD", "ACCOUNTING_GATE_PARISH_B_PASSWORD",
  "ACCOUNTING_GATE_STAFF_A_PROFILE_ID", "ACCOUNTING_GATE_STAFF_A_PIN",
  "ACCOUNTING_GATE_STAFF_B_PROFILE_ID", "ACCOUNTING_GATE_STAFF_B_PIN"
];
const missing = requiredNames.filter((name) => !String(process.env[name] || "").trim());
const publicResponse = await fetch(`${baseUrl}/api/health`);
const artifact = {
  generatedAt:new Date().toISOString(),
  baseUrl,
  publicHealth:{ status:publicResponse.status, passed:publicResponse.status === 200 },
  authenticated:{ configured:missing.length === 0, missing, status:missing.length ? "blocked_missing_credentials" : "running" }
};
assert.equal(publicResponse.status, 200, "The deployed health endpoint must return 200.");

if (missing.length) {
  await writeArtifact("artifacts/accounting-release-gates/post-deploy-smoke.json", artifact);
  const message = `Authenticated accounting smoke is not configured; missing: ${missing.join(", ")}`;
  if (!allowUnconfigured) throw new Error(message);
  console.warn(`NOTICE - ${message}`);
  console.log("PASS - public post-deploy health smoke");
} else {
  const values = Object.fromEntries(requiredNames.map((name) => [name, String(process.env[name]).trim()]));
  const browser = await chromium.launch({ headless:true });
  const contexts = [];
  try {
    const platformA = await browser.newContext(), platformB = await browser.newContext();
    const staffA = await browser.newContext(), staffB = await browser.newContext();
    contexts.push(platformA, platformB, staffA, staffB);
    const platformAHeaders = await loginPlatformUser(await platformA.newPage(), {
      baseUrl, email:values.ACCOUNTING_GATE_USER_A_EMAIL, password:values.ACCOUNTING_GATE_USER_A_PASSWORD
    });
    const platformBHeaders = await loginPlatformUser(await platformB.newPage(), {
      baseUrl, email:values.ACCOUNTING_GATE_USER_B_EMAIL, password:values.ACCOUNTING_GATE_USER_B_PASSWORD
    });
    const staffAHeaders = await loginParishAccounting(await staffA.newPage(), {
      baseUrl, parishId:values.ACCOUNTING_GATE_PARISH_A_ID, parishPassword:values.ACCOUNTING_GATE_PARISH_A_PASSWORD,
      profileId:values.ACCOUNTING_GATE_STAFF_A_PROFILE_ID, pin:values.ACCOUNTING_GATE_STAFF_A_PIN
    });
    const staffBHeaders = await loginParishAccounting(await staffB.newPage(), {
      baseUrl, parishId:values.ACCOUNTING_GATE_PARISH_B_ID, parishPassword:values.ACCOUNTING_GATE_PARISH_B_PASSWORD,
      profileId:values.ACCOUNTING_GATE_STAFF_B_PROFILE_ID, pin:values.ACCOUNTING_GATE_STAFF_B_PIN
    });

    const reads = await readAccountingSections({
      context:platformA, baseUrl, parishId:values.ACCOUNTING_GATE_PARISH_A_ID, headers:platformAHeaders
    });
    assert.ok(reads.every((result) => result.saneShape), "Every major accounting section must return 200 with a sane JSON object.");

    const inventory = await enumerateAccountingRoutes();
    const isolation = await runCrossTenantMatrix({
      baseUrl,
      routes:inventory.routes,
      artifactPath:"artifacts/accounting-release-gates/post-deploy-cross-tenant-matrix.json",
      principals:[
        { name:"platform-a-to-b", authPath:"platform_user", parishId:values.ACCOUNTING_GATE_PARISH_A_ID, oppositeParishId:values.ACCOUNTING_GATE_PARISH_B_ID, context:platformA, headers:platformAHeaders },
        { name:"platform-b-to-a", authPath:"platform_user", parishId:values.ACCOUNTING_GATE_PARISH_B_ID, oppositeParishId:values.ACCOUNTING_GATE_PARISH_A_ID, context:platformB, headers:platformBHeaders },
        { name:"staff-a-to-b", authPath:"accounting_staff_pin", parishId:values.ACCOUNTING_GATE_PARISH_A_ID, oppositeParishId:values.ACCOUNTING_GATE_PARISH_B_ID, context:staffA, headers:staffAHeaders },
        { name:"staff-b-to-a", authPath:"accounting_staff_pin", parishId:values.ACCOUNTING_GATE_PARISH_B_ID, oppositeParishId:values.ACCOUNTING_GATE_PARISH_A_ID, context:staffB, headers:staffBHeaders }
      ]
    });
    artifact.authenticated = { configured:true, status:"passed", reads, crossTenantAttempts:isolation.attemptCount };
    await writeArtifact("artifacts/accounting-release-gates/post-deploy-smoke.json", artifact);
    console.log(`PASS - ${reads.length} authenticated accounting sections returned sane responses`);
    console.log(`PASS - ${isolation.attemptCount} production cross-tenant attempts were denied`);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await browser.close();
  }
}
