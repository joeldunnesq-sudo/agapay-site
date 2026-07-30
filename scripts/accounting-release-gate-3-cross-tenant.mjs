import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  baseUrlFrom,
  enumerateAccountingRoutes,
  loginParishAccounting,
  loginPlatformUser,
  requiredEnvironment,
  runCrossTenantMatrix,
  writeArtifact
} from "./lib/accounting-release-gates.mjs";

const baseUrl = baseUrlFrom();
const credentials = requiredEnvironment([
  "ACCOUNTING_GATE_PARISH_A_ID",
  "ACCOUNTING_GATE_PARISH_B_ID",
  "ACCOUNTING_GATE_USER_A_EMAIL",
  "ACCOUNTING_GATE_USER_A_PASSWORD",
  "ACCOUNTING_GATE_USER_B_EMAIL",
  "ACCOUNTING_GATE_USER_B_PASSWORD",
  "ACCOUNTING_GATE_PARISH_A_PASSWORD",
  "ACCOUNTING_GATE_PARISH_B_PASSWORD",
  "ACCOUNTING_GATE_STAFF_A_PROFILE_ID",
  "ACCOUNTING_GATE_STAFF_A_PIN",
  "ACCOUNTING_GATE_STAFF_B_PROFILE_ID",
  "ACCOUNTING_GATE_STAFF_B_PIN"
]);
assert.notEqual(credentials.ACCOUNTING_GATE_PARISH_A_ID, credentials.ACCOUNTING_GATE_PARISH_B_ID);

const inventory = await enumerateAccountingRoutes();
assert.equal(inventory.coverage.length, 9, "Every current accounting handler family must be inventoried.");
assert.ok(inventory.coverage.every((item) => item.routes > 0), "Every accounting handler must contribute routes.");
assert.ok(inventory.routes.length >= 75, `Expected at least 75 current routes, found ${inventory.routes.length}.`);
await writeArtifact("artifacts/accounting-release-gates/route-inventory.json", inventory);

const browser = await chromium.launch({ headless:true });
const contexts = [];
try {
  const platformA = await browser.newContext();
  const platformB = await browser.newContext();
  const staffA = await browser.newContext();
  const staffB = await browser.newContext();
  contexts.push(platformA, platformB, staffA, staffB);

  const platformAHeaders = await loginPlatformUser(await platformA.newPage(), {
    baseUrl, email:credentials.ACCOUNTING_GATE_USER_A_EMAIL, password:credentials.ACCOUNTING_GATE_USER_A_PASSWORD
  });
  const platformBHeaders = await loginPlatformUser(await platformB.newPage(), {
    baseUrl, email:credentials.ACCOUNTING_GATE_USER_B_EMAIL, password:credentials.ACCOUNTING_GATE_USER_B_PASSWORD
  });
  const staffAHeaders = await loginParishAccounting(await staffA.newPage(), {
    baseUrl,
    parishId:credentials.ACCOUNTING_GATE_PARISH_A_ID,
    parishPassword:credentials.ACCOUNTING_GATE_PARISH_A_PASSWORD,
    profileId:credentials.ACCOUNTING_GATE_STAFF_A_PROFILE_ID,
    pin:credentials.ACCOUNTING_GATE_STAFF_A_PIN
  });
  const staffBHeaders = await loginParishAccounting(await staffB.newPage(), {
    baseUrl,
    parishId:credentials.ACCOUNTING_GATE_PARISH_B_ID,
    parishPassword:credentials.ACCOUNTING_GATE_PARISH_B_PASSWORD,
    profileId:credentials.ACCOUNTING_GATE_STAFF_B_PROFILE_ID,
    pin:credentials.ACCOUNTING_GATE_STAFF_B_PIN
  });

  const artifact = await runCrossTenantMatrix({
    baseUrl,
    routes:inventory.routes,
    principals:[
      { name:"platform-a-to-b", authPath:"platform_user", parishId:credentials.ACCOUNTING_GATE_PARISH_A_ID, oppositeParishId:credentials.ACCOUNTING_GATE_PARISH_B_ID, context:platformA, headers:platformAHeaders },
      { name:"platform-b-to-a", authPath:"platform_user", parishId:credentials.ACCOUNTING_GATE_PARISH_B_ID, oppositeParishId:credentials.ACCOUNTING_GATE_PARISH_A_ID, context:platformB, headers:platformBHeaders },
      { name:"staff-a-to-b", authPath:"accounting_staff_pin", parishId:credentials.ACCOUNTING_GATE_PARISH_A_ID, oppositeParishId:credentials.ACCOUNTING_GATE_PARISH_B_ID, context:staffA, headers:staffAHeaders },
      { name:"staff-b-to-a", authPath:"accounting_staff_pin", parishId:credentials.ACCOUNTING_GATE_PARISH_B_ID, oppositeParishId:credentials.ACCOUNTING_GATE_PARISH_A_ID, context:staffB, headers:staffBHeaders }
    ]
  });
  console.log(`PASS - ${artifact.attemptCount} cross-tenant route/auth-direction checks denied without data exposure`);
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
}
