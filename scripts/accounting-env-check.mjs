// Prints a safe accounting-environment summary. This script does not touch
// Cloudflare resources or read secrets.

import {
  createAccountingConfiguration,
  summarizeAccountingConfiguration,
  createAccountingStorageRegistry,
  validateAccountingStorageRegistry
} from "../src/accounting/index.js";

const requestedEnvironment = process.argv.find((arg) => arg.startsWith("--env="))?.slice("--env=".length) || "";
const config = createAccountingConfiguration({}, { environment: requestedEnvironment });
const summary = summarizeAccountingConfiguration(config);
const registry = createAccountingStorageRegistry({}, config);

console.log("Accounting environment summary");
console.log(JSON.stringify(summary, null, 2));

try {
  validateAccountingStorageRegistry(registry, { requireCentralD1: false });
  console.log("Storage registry shape: OK");
} catch (err) {
  console.error(`Storage registry error: ${err.message}`);
  process.exitCode = 1;
}
