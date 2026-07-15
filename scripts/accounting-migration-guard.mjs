// Builds an explicit Wrangler migration command and refuses dangerous
// production targeting unless --confirm-production is present.
//
// This script prints the command. It never executes Wrangler.

import { createMigrationSafetyPlan } from "../src/accounting/index.js";

function argValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || "";
}

const environment = argValue("env");
const databaseName = argValue("database");
const remote = process.argv.includes("--remote");
const confirmProduction = process.argv.includes("--confirm-production");
const purpose = argValue("purpose") || "schema_migration";

try {
  const plan = createMigrationSafetyPlan({
    environment,
    databaseName,
    remote,
    confirmProduction,
    purpose
  });
  console.log(JSON.stringify(plan, null, 2));
  console.log(`Review command: ${plan.command}`);
  console.log("Not executed. Run manually only after reviewing the target environment.");
} catch (err) {
  console.error(err.message);
  if (err.details) console.error(JSON.stringify(err.details, null, 2));
  process.exitCode = 1;
}
