import { json } from "../lib/core.js";
import { accountsPayableAging, addBudgetLine, approveBill, approveBudget, budgetReportCsv, budgetVsActual, copyBudget, councilBudgetPacket, createBillDraft, createBudget, createVendor, forecastBudget, listBudgets, listVendors, lockBudget, payablesOverview, postBill, rejectBill, submitBill, submitBudget, createPayment, postPayment, listPayments, paymentDetail, getCheckSettings, updateCheckSettings, recordCheckPrint, voidPayment } from "../accounting/index.js";
import { accountingContext } from "./accounting-ledger.js";

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", Vary: "Authorization" };
const reply = (payload, status = 200) => json(payload, { status, headers: HEADERS });
const today = () => new Date().toISOString().slice(0, 10);
const serviceTier = (tier) => tier === "advanced_operations" ? "parish" : "mission";
const rows = async (db, sql, ...params) => (await db.prepare(sql).bind(...params).all()).results || [];

async function bills(db) {
  return rows(db, `SELECT b.id,b.bill_number billNumber,b.vendor_id vendorId,v.display_name vendorName,b.vendor_invoice_number vendorInvoiceNumber,b.bill_date billDate,b.due_date dueDate,b.description,b.status,b.approval_status approvalStatus,b.payment_status paymentStatus,b.total_amount totalAmount,b.amount_paid amountPaid,b.amount_due amountDue,b.version FROM accounting_bills b JOIN accounting_vendors v ON v.id=b.vendor_id ORDER BY b.due_date DESC,b.created_at DESC`);
}
async function budgetDetail(db, budgetId) {
  const lines = await rows(db, `SELECT l.id,l.account_id accountId,a.account_number accountNumber,a.name accountName,l.fund_id fundId,f.code fundCode,l.annual_amount annualAmount,l.allocation_strategy allocationStrategy,l.version FROM accounting_budget_lines l JOIN accounting_accounts a ON a.id=l.account_id JOIN accounting_funds f ON f.id=l.fund_id WHERE l.budget_id=? ORDER BY a.account_number`, budgetId);
  return { lines };
}

function requiredCapability(path, method) {
  if (path === "/payables/check-settings") return "ap.pay";
  if (path.includes("/payments/") && path.endsWith("/void")) return "ap.void";
  if (path.startsWith("/payables/payments") && method !== "GET") return "ap.pay";
  if (method === "GET") return path.startsWith("/payables") ? "ap.view" : "budgets.view";
  if (/\/approve$|\/reject$|\/post$/.test(path)) return path.startsWith("/payables") ? "ap.approve" : "budgets.approve";
  if (/\/lock$/.test(path)) return "budgets.lock";
  return path.startsWith("/payables") ? "ap.enter" : "budgets.manage";
}

export async function handleAccountingPayablesBudgets(request, env, parishId) {
  const url = new URL(request.url), base = `/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting`;
  if (!url.pathname.startsWith(base)) return null;
  let path = url.pathname.slice(base.length), csv = false;
  if (path.endsWith(".csv")) { csv = true; path = path.slice(0, -4); }
  if (!path.startsWith("/payables") && !path.startsWith("/budgets")) return null;
  try {
    const ctx = await accountingContext(request, env, parishId, requiredCapability(path, request.method));
    if (!ctx) return reply({ error: "Unauthorized" }, 401);
    if (ctx.error) return ctx.error;
    const tier = serviceTier(ctx.tier), body = request.method === "GET" ? {} : await request.json().catch(() => ({}));
    if (request.method === "GET" && path === "/payables/overview") return reply({ ok: true, overview: await payablesOverview(ctx.db, { actor: ctx.actor, entitlementTier: tier, asOfDate: url.searchParams.get("asOf") || today() }) });
    if (request.method === "GET" && path === "/payables/vendors") return reply({ ok: true, vendors: await listVendors(ctx.db, { actor: ctx.actor, entitlementTier: tier }) });
    if (request.method === "POST" && path === "/payables/vendors") return reply({ ok: true, vendor: await createVendor(ctx.db, { actor: ctx.actor, entitlementTier: tier, input: body }) }, 201);
    if (request.method === "GET" && path === "/payables/bills") return reply({ ok: true, bills: await bills(ctx.db) });
    if (request.method === "POST" && path === "/payables/bills") return reply({ ok: true, bill: await createBillDraft(ctx.db, { actor: ctx.actor, entitlementTier: tier, input: body }) }, 201);
    if (request.method === "GET" && path === "/payables/aging") return reply({ ok: true, aging: await accountsPayableAging(ctx.db, { actor: ctx.actor, entitlementTier: tier, asOfDate: url.searchParams.get("asOf") || today() }) });
    if (request.method === "GET" && path === "/payables/payments") return reply({ ok: true, payments: await listPayments(ctx.db, { actor: ctx.actor, entitlementTier: tier }) });
    if (request.method === "POST" && path === "/payables/payments") return reply({ ok: true, payment: await createPayment(ctx.db, { actor: ctx.actor, entitlementTier: tier, input: body }) }, 201);
    if (request.method === "GET" && path === "/payables/check-settings") return reply({ ok: true, settings: await getCheckSettings(ctx.db, { actor: ctx.actor, entitlementTier: tier, bankAccountId: url.searchParams.get("bankAccountId") }) });
    if (request.method === "PATCH" && path === "/payables/check-settings") return reply({ ok: true, settings: await updateCheckSettings(ctx.db, { actor: ctx.actor, entitlementTier: tier, bankAccountId: body.bankAccountId, expectedVersion: body.expectedVersion, patch: body.patch || {} }) });
    const paymentAction = path.match(/^\/payables\/payments\/([^/]+)(?:\/(post|print|void))?$/);
    if (paymentAction) {
      const paymentId = decodeURIComponent(paymentAction[1]), action = paymentAction[2];
      if (request.method === "GET" && !action) return reply({ ok: true, detail: await paymentDetail(ctx.db, { actor: ctx.actor, entitlementTier: tier, paymentId }) });
      if (request.method === "POST" && action === "post") return reply({ ok: true, payment: await postPayment(ctx.db, { actor: ctx.actor, entitlementTier: tier, paymentId, expectedVersion: body.expectedVersion, idempotencyKey: body.idempotencyKey }) });
      if (request.method === "POST" && action === "void") return reply({ ok: true, payment: await voidPayment(ctx.db, { actor: ctx.actor, entitlementTier: tier, paymentId, expectedVersion: body.expectedVersion, reason: body.reason }) });
      if (request.method === "POST" && action === "print") {
        const detail = await recordCheckPrint(ctx.db, { actor: ctx.actor, entitlementTier: tier, paymentId, reason: body.reason || "" });
        return reply({ ok: true, detail, html: printableCheck(detail) });
      }
    }
    const billAction = path.match(/^\/payables\/bills\/([^/]+)\/(submit|approve|reject|post)$/);
    if (request.method === "POST" && billAction) {
      const billId = decodeURIComponent(billAction[1]), args = { actor: ctx.actor, entitlementTier: tier, billId, expectedVersion: body.expectedVersion };
      if (billAction[2] === "submit") return reply({ ok: true, bill: await submitBill(ctx.db, args) });
      if (billAction[2] === "approve") return reply({ ok: true, bill: await approveBill(ctx.db, args) });
      if (billAction[2] === "reject") return reply({ ok: true, bill: await rejectBill(ctx.db, { ...args, reason: body.reason }) });
      return reply({ ok: true, bill: await postBill(ctx.db, { ...args, idempotencyKey: body.idempotencyKey }) });
    }
    if (request.method === "GET" && path === "/budgets") return reply({ ok: true, budgets: await listBudgets(ctx.db, { actor: ctx.actor, entitlementTier: tier, fiscalYearId: url.searchParams.get("fiscalYearId") || null }) });
    if (request.method === "POST" && path === "/budgets") return reply({ ok: true, budget: await createBudget(ctx.db, { actor: ctx.actor, entitlementTier: tier, input: body }) }, 201);
    const budgetMatch = path.match(/^\/budgets\/([^/]+)(?:\/(lines|submit|approve|lock|copy|variance|forecast|council-packet))?$/);
    if (budgetMatch) {
      const budgetId = decodeURIComponent(budgetMatch[1]), action = budgetMatch[2] || "", throughMonth = Number(url.searchParams.get("throughMonth") || new Date().getUTCMonth() + 1);
      if (request.method === "GET" && !action) return reply({ ok: true, detail: await budgetDetail(ctx.db, budgetId) });
      if (request.method === "POST" && action === "lines") return reply({ ok: true, line: await addBudgetLine(ctx.db, { actor: ctx.actor, entitlementTier: tier, budgetId, input: body }) }, 201);
      const transition = { actor: ctx.actor, entitlementTier: tier, budgetId, expectedVersion: body.expectedVersion };
      if (request.method === "POST" && action === "submit") return reply({ ok: true, budget: await submitBudget(ctx.db, transition) });
      if (request.method === "POST" && action === "approve") return reply({ ok: true, budget: await approveBudget(ctx.db, transition) });
      if (request.method === "POST" && action === "lock") return reply({ ok: true, budget: await lockBudget(ctx.db, transition) });
      if (request.method === "POST" && action === "copy") return reply({ ok: true, budget: await copyBudget(ctx.db, { actor: ctx.actor, entitlementTier: tier, sourceBudgetId: budgetId, name: body.name, includeNotes: body.includeNotes !== false }) });
      if (request.method === "GET" && ["variance", "forecast"].includes(action)) {
        const report = action === "forecast" ? await forecastBudget(ctx.db, { actor: ctx.actor, entitlementTier: tier, budgetId, throughMonth }) : await budgetVsActual(ctx.db, { actor: ctx.actor, entitlementTier: tier, budgetId, throughMonth });
        if (csv) return new Response(budgetReportCsv(report), { headers: { ...HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=agapay-budget-variance.csv" } });
        return reply({ ok: true, report });
      }
      if (request.method === "GET" && action === "council-packet") return reply({ ok: true, packet: await councilBudgetPacket(ctx.db, { actor: ctx.actor, entitlementTier: tier, budgetId, throughMonth }) });
    }
    return reply({ error: "Not found" }, 404);
  } catch (error) {
    const conflict = Boolean(error?.details?.conflict);
    return reply({ error: conflict ? "conflict" : "accounting_request_failed", message: error?.message || "Accounting request failed." }, conflict ? 409 : 400);
  }
}

function printableCheck(detail) {
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);
  const payment = detail.payment, copy = detail.prints.length > 1 ? `<div class="reprint">REPRINT · ORIGINAL CHECK ${esc(payment.checkNumber)}</div>` : "";
  const rows = detail.applications.map((item) => `<tr><td>${esc(item.vendorInvoiceNumber || item.billNumber)}</td><td>${esc(item.billDate)}</td><td>${esc(item.description)}</td><td>${money(item.amountApplied)}</td></tr>`).join("");
  const stub = `<section class="stub"><strong>${esc(detail.vendor.displayName)}</strong><span>Check ${esc(payment.checkNumber)} · ${esc(payment.paymentDate)}</span><table><thead><tr><th>Invoice</th><th>Date</th><th>Description</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><b>Total ${money(payment.totalAmount)}</b></section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Check ${esc(payment.checkNumber)}</title><style>@page{size:letter;margin:0}*{box-sizing:border-box}body{margin:0;color:#061522;font:12px Arial,sans-serif}.sheet{width:8.5in;height:11in;padding:.35in .55in}.check{height:3.45in;position:relative;border-bottom:1px dashed #999;padding:.15in}.payer{font:700 16px Georgia,serif;white-space:pre-line}.number{position:absolute;right:.1in;top:.1in;font-weight:700}.date{position:absolute;right:.1in;top:.55in}.payline{margin-top:.55in;display:grid;grid-template-columns:1fr 1.5in;gap:.2in;border-bottom:1px solid #222;padding:.08in 0;font-size:14px}.words{border-bottom:1px solid #222;padding:.14in 0}.memo{position:absolute;left:.15in;bottom:.35in}.signature{position:absolute;right:.15in;bottom:.35in;width:2.6in;border-top:1px solid #222;padding-top:4px;text-align:center}.stub{height:3.42in;padding:.22in .15in;border-bottom:1px dashed #999}.stub span{float:right}.stub table{width:100%;border-collapse:collapse;margin-top:.18in}.stub th,.stub td{padding:6px;border-bottom:1px solid #ddd;text-align:left}.stub th:last-child,.stub td:last-child{text-align:right}.stub b{display:block;text-align:right;margin-top:10px}.reprint{position:absolute;inset:1.35in .8in auto;transform:rotate(-12deg);color:#a02626;border:3px solid #a02626;text-align:center;font-size:22px;font-weight:800;opacity:.72;padding:8px}@media print{.toolbar{display:none}}.toolbar{position:fixed;right:15px;top:15px;z-index:2}.toolbar button{padding:10px 16px;background:#061522;color:#fff;border:0;border-radius:8px}</style></head><body><div class="toolbar"><button onclick="window.print()">Print check</button></div><main class="sheet"><section class="check">${copy}<div class="payer">${esc(detail.settings.payerName || "Parish")}</div><div>${esc(detail.settings.payerAddress)}</div><div class="number">No. ${esc(payment.checkNumber)}</div><div class="date">Date ${esc(payment.paymentDate)}</div><div class="payline"><span>Pay to the order of <strong>${esc(detail.vendor.legalName || detail.vendor.displayName)}</strong></span><strong>${money(payment.totalAmount)}</strong></div><div class="words">${esc(amountInWords(payment.totalAmount))} and ${String(Number(payment.totalAmount) % 100).padStart(2, "0")}/100 dollars</div><div class="memo">Memo: ${esc(payment.referenceNumber || detail.applications.map(x => x.vendorInvoiceNumber || x.billNumber).join(", "))}</div><div class="signature">${esc(detail.settings.signatureLine1 || "Authorized signature")}</div></section>${stub}${stub}</main></body></html>`;
}
function amountInWords(cents) { const n = Math.floor(Number(cents || 0) / 100), small=["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"], tens=["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"], under100=x=>x<20?small[x]:`${tens[Math.floor(x/10)]}${x%10?`-${small[x%10]}`:""}`, under1000=x=>x<100?under100(x):`${small[Math.floor(x/100)]} hundred${x%100?` ${under100(x%100)}`:""}`, words=x=>x<1000?under1000(x):x<1000000?`${under1000(Math.floor(x/1000))} thousand${x%1000?` ${under1000(x%1000)}`:""}`:String(x); return `${words(n).replace(/^./,c=>c.toUpperCase())}`; }
