import { json } from "./core.js";
import { offeringFeeBreakdown } from "./stripe-fees.js";
import { outsideGiftsForGiving } from "./outside-gifts.js";

const PAGE_SIZE = 500;
const MAX_EXPORT_ROWS = 25000;
const SETTLED = "'paid','succeeded','complete','completed','refunded','partially_refunded','disputed'";

export function csvCell(value) {
  let text = String(value ?? "");
  // Quoting alone does not prevent spreadsheet formula execution.
  if (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function givingExportOptions(params, registration = {}) {
  const month = params.get("month") || "";
  if (!/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error("Choose a valid giving month.");
  const groupBy = params.get("groupBy") || "date";
  if (!["date", "giver"].includes(groupBy)) throw new Error("Group transactions by giving date or giver.");
  let timezone = registration.timezone || "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); } catch { timezone = "UTC"; }
  const start = Date.parse(month + "-01T00:00:00Z");
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { month, groupBy, timezone, start: new Date(start - 86400000).toISOString(), end: new Date(next.getTime() + 86400000).toISOString() };
}

export function givingExportRows(records, options) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: options.timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  return records.map((record) => {
    const offering = JSON.parse(record.data);
    if (!offering || typeof offering !== "object") throw new Error("Invalid giving record.");
    const timestamp = offering.paidAt || offering.createdAt || record.created_at;
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) throw new Error("Invalid giving date.");
    const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
    const givingDate = `${parts.year}-${parts.month}-${parts.day}`;
    const name = [offering.firstName, offering.lastName].filter(Boolean).join(" ") || offering.donorName || "Anonymous";
    const email = offering.email || offering.donorEmail || "";
    return { offering, id: record.id, status: offering.paymentStatus || record.payment_status || offering.status || record.status, timestamp: date.toISOString(), givingDate, name, email, giverKey: email.trim().toLowerCase() || name.trim().toLowerCase(), fees: offeringFeeBreakdown(offering) };
  }).filter((row) => row.givingDate.startsWith(options.month + "-")).sort((a, b) => {
    const group = options.groupBy === "giver"
      ? a.giverKey.localeCompare(b.giverKey)
      : a.givingDate.localeCompare(b.givingDate);
    return group || a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id);
  });
}

export function monthlyGivingCsv(rows, options) {
  const headers = ["Giving date", "Parish timezone", "Paid timestamp UTC", "Giver", "Giver email", "Fund", "Fund ID", "Campaign", "Gift type", "Frequency", "Currency", "Gift amount", "Amount charged", "Stripe fee", "AGAPAY fee", "Total fees", "Net before refunds", "Fees covered by donor", "Fee basis", "Refunds to date", "Latest refund timestamp", "Status", "Transaction ID", "Stripe payment intent", "Stripe charge", "Stripe balance transaction"];
  headers.push("Source", "Outside reference", "Recorded by", "Giving purpose", "Pledge year");
  const money = (cents) => cents === null ? "" : (Number(cents || 0) / 100).toFixed(2);
  const data = rows.map(({ offering: o, id, status, timestamp, givingDate, name, email, fees: f }) => [
    givingDate, options.timezone, timestamp, name, email,
    ["general", "stewardship"].includes(o.giftType) ? "General Operating Fund" : o.fund || o.fundId || "General Operating Fund",
    o.fundId || (["general", "stewardship"].includes(o.giftType) ? "general" : ""), o.campaign || o.campaignId || "", o.giftType || "offering", o.frequency || "once", (o.currency || "usd").toUpperCase(),
    money(f.giftAmountCents), money(f.chargeCents), money(f.stripeFeeCents), money(f.agapayFeeCents), money(f.totalFeeCents), money(f.parishNetCents), money(f.donorCoveredFeeCents),
    o.source === "outside" ? "Outside contribution; fees and bank net not verified" : o.stripeBalanceTransactionId ? "Stripe balance transaction" : "Estimate / unverified",
    o.source === "outside" ? "" : money(o.refundedCents), o.refundedAt || "", status, id, o.stripePaymentIntentId || o.paymentIntentId || "", o.stripeChargeId || "", o.stripeBalanceTransactionId || "",
    o.source === "outside" ? o.sourceLabel : "AGAPAY online", o.reference || "", o.enteredBy || "", o.source === "outside" ? (o.givingKind === "pledge" ? "Pledge payment" : "Other giving") : "", o.pledgeYear || ""
  ]);
  return "\uFEFF" + [headers, ...data].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// Called only after the giving-history handler verifies the parish session.
// Page through the selected month, not the dashboard's 500-row history cache.
export async function exportMonthlyGiving(request, env, parishId, registration) {
  let options;
  try { options = givingExportOptions(new URL(request.url).searchParams, registration); }
  catch (error) { return json({ error: error.message }, { status: 422 }); }
  if (!env.AGAPAY_DB) return json({ error: "Complete monthly exports require the giving database. Contact support." }, { status: 503 });
  let cursor = "";
  const records = [];
  for (;;) {
    const page = await env.AGAPAY_DB.prepare(`
      SELECT id, data, status, payment_status, created_at FROM donor_offerings
      WHERE parish_id = ?1 AND id > ?2
        AND (payment_status IN (${SETTLED}) OR status IN (${SETTLED}))
        AND julianday(COALESCE(json_extract(data, '$.paidAt'), json_extract(data, '$.createdAt'), created_at)) >= julianday(?3)
        AND julianday(COALESCE(json_extract(data, '$.paidAt'), json_extract(data, '$.createdAt'), created_at)) < julianday(?4)
      ORDER BY id LIMIT ?5
    `).bind(parishId, cursor, options.start, options.end, PAGE_SIZE).all();
    const rows = page.results || [];
    records.push(...rows);
    if (records.length > MAX_EXPORT_ROWS) return json({ error: "This month exceeds the 25,000-record export limit. Contact support for a complete export; no partial CSV was generated." }, { status: 413 });
    if (rows.length < PAGE_SIZE) break;
    cursor = rows[rows.length - 1].id;
  }
  let rows;
  try {
    rows = givingExportRows(records, options);
    const outside = await outsideGiftsForGiving(env,parishId,registration,{start:options.month+"-01",end:options.month+"-31"});
    rows.push(...outside.map(g => ({ offering:g,id:g.id,status:"recorded outside",timestamp:"",givingDate:g.receivedDate,name:g.donorName,email:g.donorEmail,giverKey:(g.donorEmail || g.donorName).toLowerCase(),fees:{giftAmountCents:g.amountCents,chargeCents:null,stripeFeeCents:null,agapayFeeCents:null,totalFeeCents:null,parishNetCents:null,donorCoveredFeeCents:null} })));
    rows.sort((a,b) => (options.groupBy === "giver" ? a.giverKey.localeCompare(b.giverKey) : a.givingDate.localeCompare(b.givingDate)) || a.givingDate.localeCompare(b.givingDate) || a.id.localeCompare(b.id));
    if (rows.length > MAX_EXPORT_ROWS) return json({error:"This month exceeds the complete export limit. Contact support; no partial CSV was generated."},{status:413});
  }
  catch { return json({ error: "A giving record needs review before a complete CSV can be generated. Contact support." }, { status: 409 }); }
  const filename = `${String(parishId).replace(/[^a-zA-Z0-9_-]/g, "-")}-giving-${options.month}-by-${options.groupBy}.csv`;
  return new Response(monthlyGivingCsv(rows, options), { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "Vary": "Authorization",
    "X-Content-Type-Options": "nosniff",
    "X-AGAPAY-Export-Rows": String(rows.length)
  } });
}
