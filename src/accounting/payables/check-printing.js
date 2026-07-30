const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);

function amountInWords(cents) {
  const n = Math.floor(Number(cents || 0) / 100);
  const small = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  const under100 = (x) => x < 20 ? small[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? `-${small[x % 10]}` : ""}`;
  const under1000 = (x) => x < 100 ? under100(x) : `${small[Math.floor(x / 100)]} hundred${x % 100 ? ` ${under100(x % 100)}` : ""}`;
  const words = (x) => x < 1000 ? under1000(x) : x < 1000000 ? `${under1000(Math.floor(x / 1000))} thousand${x % 1000 ? ` ${under1000(x % 1000)}` : ""}` : String(x);
  return words(n).replace(/^./, (character) => character.toUpperCase());
}

function checkSheet(detail) {
  const payment = detail.payment;
  const copy = detail.prints.length > 1 ? `<div class="reprint">REPRINT · ORIGINAL CHECK ${esc(payment.checkNumber)}</div>` : "";
  const rows = detail.applications.map((item) => `<tr><td>${esc(item.vendorInvoiceNumber || item.billNumber)}</td><td>${esc(item.billDate)}</td><td>${esc(item.description)}</td><td>${money(item.amountApplied)}</td></tr>`).join("");
  const stub = `<section class="stub"><strong>${esc(detail.vendor.displayName)}</strong><span>Check ${esc(payment.checkNumber)} · ${esc(payment.paymentDate)}</span><table><thead><tr><th>Invoice</th><th>Date</th><th>Description</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><b>Total ${money(payment.totalAmount)}</b></section>`;
  const check = `<section class="check">${copy}<div class="payer">${esc(detail.settings.payerName || "Parish")}</div><div class="address">${esc(detail.settings.payerAddress)}</div><div class="number">No. ${esc(payment.checkNumber)}</div><div class="date">Date ${esc(payment.paymentDate)}</div><div class="payline"><span>Pay to the order of <strong>${esc(detail.vendor.legalName || detail.vendor.displayName)}</strong></span><strong>${money(payment.totalAmount)}</strong></div><div class="words">${esc(amountInWords(payment.totalAmount))} and ${String(Number(payment.totalAmount) % 100).padStart(2, "0")}/100 dollars</div><div class="memo">Memo: ${esc(payment.referenceNumber || detail.applications.map((item) => item.vendorInvoiceNumber || item.billNumber).join(", "))}</div><div class="signature">${esc(detail.settings.signatureLine1 || "Authorized signature")}<small>${esc(detail.settings.signatureLine2 || "")}</small></div></section>`;
  const style = detail.settings.checkStyle || "top_check_two_stubs";
  const stock = style === "bottom_check_two_stubs" ? `${stub}${stub}${check}` : style === "check_only" ? check : `${check}${stub}${stub}`;
  return `<main class="sheet" data-check-style="${esc(style)}">${stock}</main>`;
}

export function printableChecks(details) {
  const title = details.length === 1 ? `Check ${esc(details[0].payment.checkNumber)}` : `Payment run · ${details.length} checks`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>@page{size:letter;margin:0}*{box-sizing:border-box}body{margin:0;color:#061522;font:12px Arial,sans-serif}.sheet{width:8.5in;height:11in;padding:.35in .55in;break-after:page}.sheet:last-child{break-after:auto}.check{height:3.45in;position:relative;border-bottom:1px dashed #999;padding:.15in}.payer{font:700 16px Georgia,serif;white-space:pre-line}.address{white-space:pre-line}.number{position:absolute;right:.1in;top:.1in;font-weight:700}.date{position:absolute;right:.1in;top:.55in}.payline{margin-top:.55in;display:grid;grid-template-columns:1fr 1.5in;gap:.2in;border-bottom:1px solid #222;padding:.08in 0;font-size:14px}.words{border-bottom:1px solid #222;padding:.14in 0}.memo{position:absolute;left:.15in;bottom:.35in}.signature{position:absolute;right:.15in;bottom:.35in;width:2.6in;border-top:1px solid #222;padding-top:4px;text-align:center}.signature small{display:block;margin-top:3px}.stub{height:3.42in;padding:.22in .15in;border-bottom:1px dashed #999}.stub span{float:right}.stub table{width:100%;border-collapse:collapse;margin-top:.18in}.stub th,.stub td{padding:6px;border-bottom:1px solid #ddd;text-align:left}.stub th:last-child,.stub td:last-child{text-align:right}.stub b{display:block;text-align:right;margin-top:10px}.reprint{position:absolute;inset:1.35in .8in auto;transform:rotate(-12deg);color:#a02626;border:3px solid #a02626;text-align:center;font-size:22px;font-weight:800;opacity:.72;padding:8px}@media print{.toolbar{display:none}}.toolbar{position:fixed;right:15px;top:15px;z-index:2}.toolbar button{padding:10px 16px;background:#061522;color:#fff;border:0;border-radius:8px}</style></head><body><div class="toolbar"><button onclick="window.print()">Print ${details.length === 1 ? "check" : "payment run"}</button></div>${details.map(checkSheet).join("")}</body></html>`;
}

export function printableCheck(detail) {
  return printableChecks([detail]);
}
