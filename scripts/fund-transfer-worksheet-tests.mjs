import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFundTransferWorksheet,
  normalizeFundTransferInstructions,
} from "../src/handlers/parish-reconciliation.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

const worksheet = buildFundTransferWorksheet([
  { key: "general", category: "General Giving", label: "General Operating Fund", grossCents: 100000, feeCents: 3000, netCents: 97000, transactionCount: 4 },
  { key: "fund:building", category: "Designated Fund", label: "Building Fund", grossCents: 50000, feeCents: 1500, netCents: 48500, transactionCount: 2 },
  { key: "fund:benevolence", category: "Benevolence Fund", label: "Festal Alms", grossCents: 25000, feeCents: 750, netCents: 24250, transactionCount: 1 },
], { depositedCents: 169750 });

assert.equal(worksheet.available, true);
assert.equal(worksheet.readyToTransfer, true);
assert.equal(worksheet.allocatedNetCents, 169750);
assert.equal(worksheet.recommendedTransferCents, 72750);
assert.equal(worksheet.retainInDepositAccountCents, 97000);
assert.equal(worksheet.unallocatedCents, 0);
assert.equal(worksheet.lines.find((line) => line.key === "general")?.recommendedAction, "retain");
assert.equal(worksheet.lines.find((line) => line.key === "fund:building")?.recommendedAction, "transfer");

const unmatched = buildFundTransferWorksheet(worksheet.lines, { depositedCents: 170000 });
assert.equal(unmatched.unallocatedCents, 250);
assert.equal(unmatched.readyToTransfer, false);

const instructions = normalizeFundTransferInstructions([
  { key: "fund:building", action: "transfer", destination: " Building savings ", completed: true, reference: " ACH-42 " },
  { key: "general", action: "unsupported", destination: "ignored", completed: false },
]);
assert.deepEqual(instructions, [
  { key: "fund:building", action: "transfer", destination: "Building savings", completed: true, reference: "ACH-42" },
  { key: "general", action: "retain", destination: "", completed: false, reference: "" },
]);

const dashboard = read("public/parish/dashboard.html");
const app = readParishDashboardSource();
const css = read("public/parish/redesign.css");
assert.match(dashboard, /id="reconcileTransferWorksheetPane"/);
assert.match(dashboard, /Prepare fund transfers/);
assert.match(app, /detail=full/);
assert.match(app, /function renderFundTransferWorksheet/);
assert.match(app, /transferInstructions: collectFundTransferInstructions\(\)/);
assert.match(app, /function printFundTransferWorksheet/);
assert.match(app, /Fund Transfer Worksheet/);
assert.match(css, /\.pdx-rc-transfer-row/);
assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.pdx-rc-transfer-summary/);

console.log("PASS - fund transfer worksheet separates net designated gifts, preserves review holds, and records treasurer instructions");
