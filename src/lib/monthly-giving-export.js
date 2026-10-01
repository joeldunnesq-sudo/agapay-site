import { json } from "./core.js";
import { givingExportOptions, givingExportRows, monthlyGivingCsv } from './monthly-giving-csv.js';
export { csvCell, givingExportOptions, givingExportRows, monthlyGivingCsv } from './monthly-giving-csv.js';
import { outsideGiftsForGiving } from "./outside-gifts.js";

const PAGE_SIZE = 500;
const MAX_EXPORT_ROWS = 25000;
const SETTLED = "'paid','succeeded','complete','completed','refunded','partially_refunded','disputed'";

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
