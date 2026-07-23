import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("./accounting-st-fiacre-giving-backfill.sql", import.meta.url), "utf8");
const central = await readFile(new URL("../migrations/0040_st_fiacre_giving_accounting_alignment.sql", import.meta.url), "utf8");

const allocations = [...sql.matchAll(/\('(?:stewardship|candle|building|alms|campaign|iconography|memorial)',(\d+),'fund_giving_/g)]
  .slice(0, 7)
  .map((match) => Number(match[1]));

assert.equal(allocations.reduce((sum, amount) => sum + amount, 0), 1_256_000);
assert.ok(sql.includes("('candle',41000,'fund_giving_candle'"));
assert.ok(sql.includes("('campaign',7500,'fund_giving_campaign'"));
assert.ok(sql.includes("'agapay_give','donation_succeeded'"));
assert.ok(sql.includes("'accounting_source'"));
assert.ok(sql.includes("Gross sales are $92.90 (displayed as $93)"));
assert.ok(sql.includes("('bookstore_demo_joel_2026a','2026-07-02T15:20:00.000Z',4995,175,4820)"));
assert.ok(sql.includes("('bookstore_demo_joel_2026b','2026-06-27T11:05:00.000Z',4295,155,4140)"));
assert.ok(sql.includes("'agapay_commerce','commerce_sale_completed'"));
assert.ok(sql.includes("'acct_4050','fund_general'"));
assert.ok(central.includes("'fiacre-2026-give-003'"));
assert.ok(central.includes("json_set(data, '$.fund', 'stewardship')"));

console.log("St. Fiacre giving/accounting seed checks passed.");
