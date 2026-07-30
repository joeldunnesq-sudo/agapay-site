import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import {
  baseUrlFrom,
  loginParishAccounting,
  requiredEnvironment,
  writeArtifact
} from "./lib/accounting-release-gates.mjs";

const baseUrl = baseUrlFrom();
const credentials = requiredEnvironment([
  "ACCOUNTING_GATE_PARISH_A_ID",
  "ACCOUNTING_GATE_PARISH_A_PASSWORD",
  "ACCOUNTING_GATE_STAFF_A_PROFILE_ID",
  "ACCOUNTING_GATE_STAFF_A_PIN"
]);
const artifactRoot = "artifacts/check-print";
await mkdir(artifactRoot, { recursive:true });

const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ acceptDownloads:true });
const page = await context.newPage();
const runId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const vendorName = `Release Gate Printer ${runId}`;
const invoiceNumber = `RG-${runId}`;
const evidence = { generatedAt:new Date().toISOString(), baseUrl, parishId:credentials.ACCOUNTING_GATE_PARISH_A_ID, vendorName, invoiceNumber, layouts:[] };

async function paymentRow() {
  const row = page.locator("#accountingPane tbody tr").filter({ hasText:vendorName }).first();
  await row.waitFor();
  return row;
}

async function setCheckStyle(style) {
  await page.getByRole("button", { name:"Check settings", exact:true }).click();
  const form = page.locator('#accountingPhaseDForm form');
  await form.locator('select[name="checkStyle"]').selectOption(style);
  await form.getByRole("button", { name:"Save check settings", exact:true }).click();
  await form.locator(".acct-form-status").filter({ hasText:"saved" }).waitFor();
}

async function capturePrint(name, { reprintReason = "" } = {}) {
  const row = await paymentRow();
  if (reprintReason) page.once("dialog", (dialog) => dialog.accept(reprintReason));
  const popupPromise = page.waitForEvent("popup");
  await row.getByRole("button", { name:/^(Print|Reprint)$/ }).click();
  const popup = await popupPromise;
  await popup.waitForFunction((expected) => document.body.innerText.includes(expected), vendorName);
  const text = await popup.locator("body").innerText();
  await popup.pdf({ path:`${artifactRoot}/${name}.pdf`, printBackground:true, preferCSSPageSize:true });
  await popup.screenshot({ path:`${artifactRoot}/${name}.png`, fullPage:true });
  await popup.close();
  return text;
}

try {
  await loginParishAccounting(page, {
    baseUrl,
    parishId:credentials.ACCOUNTING_GATE_PARISH_A_ID,
    parishPassword:credentials.ACCOUNTING_GATE_PARISH_A_PASSWORD,
    profileId:credentials.ACCOUNTING_GATE_STAFF_A_PROFILE_ID,
    pin:credentials.ACCOUNTING_GATE_STAFF_A_PIN
  });

  await page.getByRole("button", { name:/^Payables/ }).first().click();
  await page.getByRole("button", { name:"Vendors", exact:true }).click();
  await page.getByRole("button", { name:"New vendor", exact:true }).click();
  const vendorForm = page.locator("#accountingPhaseDForm form");
  await vendorForm.locator('input[name="displayName"]').fill(vendorName);
  await vendorForm.locator('input[name="email"]').fill(`release-gate-${runId}@example.invalid`);
  await vendorForm.getByRole("button", { name:"Save vendor", exact:true }).click();
  await page.getByText(vendorName, { exact:true }).waitFor();

  await page.getByRole("button", { name:"Bills", exact:true }).click();
  await page.getByRole("button", { name:"Enter bill", exact:true }).click();
  const billForm = page.locator("#accountingPhaseDForm form");
  await billForm.locator('select[name="vendorId"]').selectOption({ label:vendorName });
  await billForm.locator('input[name="vendorInvoiceNumber"]').fill(invoiceNumber);
  await billForm.locator('input[name="description"]').fill("Release-gate check alignment proof");
  await billForm.locator('select[name="accountId"]').selectOption({ index:1 });
  await billForm.locator('select[name="fundId"]').selectOption({ index:1 });
  await billForm.locator('input[name="amount"]').fill("12.34");
  await billForm.getByRole("button", { name:"Save draft bill", exact:true }).click();

  for (const action of ["Submit", "Approve", "Post"]) {
    const row = page.locator("#accountingPane tbody tr").filter({ hasText:invoiceNumber }).first();
    await row.getByRole("button", { name:action, exact:true }).click();
    await page.waitForTimeout(250);
    if (action !== "Post") await page.locator("#accountingPane tbody tr").filter({ hasText:invoiceNumber }).first().getByRole("button", { name:action === "Submit" ? "Approve" : "Post", exact:true }).waitFor();
  }

  await page.getByRole("button", { name:"Payments & Checks", exact:true }).click();
  await page.getByRole("button", { name:"Pay bills", exact:true }).click();
  const paymentForm = page.locator("#accountingPhaseDForm form");
  const billRow = paymentForm.locator("tbody tr").filter({ hasText:invoiceNumber });
  await billRow.locator("[data-payment-bill]").check();
  await paymentForm.getByRole("button", { name:"Create check", exact:true }).click();
  const createdRow = await paymentRow();
  const printHandler = await createdRow.getByRole("button", { name:"Print", exact:true }).getAttribute("onclick");
  const paymentId = printHandler?.match(/printAccountingCheck\('([^']+)'/)?.[1];
  assert.ok(paymentId, "The created payment ID must be recoverable from the UI action.");

  const styles = ["top_check_two_stubs", "bottom_check_two_stubs", "check_only"];
  for (const [index, style] of styles.entries()) {
    await setCheckStyle(style);
    const text = await capturePrint(style, { reprintReason:index ? `Release-gate layout ${style}` : "" });
    assert.match(text, new RegExp(vendorName));
    evidence.layouts.push({ style, pdf:`${style}.pdf`, screenshot:`${style}.png`, reprint:index > 0 });
  }

  const reprintText = await capturePrint("reprint-banner", { reprintReason:"Release-gate banner verification" });
  assert.match(reprintText, /REPRINT\s*·\s*ORIGINAL CHECK/i);
  evidence.reprintBanner = { present:true, pdf:"reprint-banner.pdf", screenshot:"reprint-banner.png" };

  const voidRow = await paymentRow();
  page.once("dialog", (dialog) => dialog.accept("Release-gate void verification"));
  await voidRow.getByRole("button", { name:"Void", exact:true }).click();
  await page.locator("#accountingPane tbody tr").filter({ hasText:vendorName }).filter({ hasText:"Voided" }).waitFor();
  const rejection = await page.evaluate(async ({ parishId, paymentId }) => {
    const response = await fetch(`/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting/payables/payments/${encodeURIComponent(paymentId)}/print`, {
      method:"POST",
      headers:{ ...authHeaders(), "Content-Type":"application/json" },
      body:JSON.stringify({ reason:"must reject after void" })
    });
    return { status:response.status, body:await response.text() };
  }, { parishId:credentials.ACCOUNTING_GATE_PARISH_A_ID, paymentId });
  assert.ok(rejection.status >= 400);
  evidence.voidPrintRejection = rejection;
  await page.screenshot({ path:`${artifactRoot}/void-print-rejection.png`, fullPage:true });
  await writeArtifact(`${artifactRoot}/evidence.json`, evidence);
  console.log("PASS - three check-stock layouts captured as PDF and screenshot evidence");
  console.log("PASS - reprint banner captured");
  console.log(`PASS - voided payment print rejected with HTTP ${rejection.status}`);
} finally {
  await browser.close();
}
