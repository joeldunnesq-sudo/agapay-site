// TEXT-TO-GIVE -- WORKER ADDITIONS
// Paste these three sections into src/worker.js.
// Single shared AGAPAY number; keywords are globally unique across all parishes.

// --- SECTION 1: SignalWire SMS Webhook ---
// Place near handleStripeWebhook

async function handleSignalWireSmsWebhook(request, env) {
  let body;
  try {
    const text = await request.text();
    body = Object.fromEntries(new URLSearchParams(text));
  } catch {
    return smsXmlResponse("We couldn't process your message. Please try again.");
  }
  const keyword = (body.Body || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!keyword) return smsXmlResponse("Text a keyword to give. Contact your parish for details.");
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";
  // Keyword is globally unique -- no parish_id filter needed
  const row = await d1First(env,
    "SELECT sk.fund_id, sk.parish_id, r.data FROM sms_keywords sk LEFT JOIN registrations r ON r.parish_id = sk.parish_id WHERE sk.keyword = ?1 AND sk.is_active = 1 LIMIT 1",
    keyword
  );
  let giveUrl;
  if (row) {
    let pd = {};
    try { pd = JSON.parse(row.data || "{}"); } catch {}
    const slug = pd.parishId || slugify(pd.parishName || row.parish_id);
    giveUrl = appUrl + "/give/" + slug + "?fund=" + encodeURIComponent(row.fund_id);
  } else {
    giveUrl = appUrl + "/giving";
  }
  const msg = row
    ? "Glory to Jesus Christ! Click here to complete your stewardship gift: " + giveUrl
    : "Thank you for your desire to give! Visit AGAPAY to find your parish: " + giveUrl;
  return smsXmlResponse(msg);
}

function smsXmlResponse(message) {
  const esc = message.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Message>' + esc + '</Message></Response>', {
    status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" }
  });
}

// --- SECTION 2: Parish Admin API ---
// Place near other handleParish* functions

async function handleParishSmsKeywords(request, env, parishId) {
  const session = await getParishSession(request, env, parishId);
  if (!session) return unauthorized();
  const db = d1(env);
  if (!db) return json({ error: "Database not available" }, { status: 503 });

  if (request.method === "GET") {
    const r = await db.prepare("SELECT id, keyword, fund_id, is_active, created_at FROM sms_keywords WHERE parish_id = ?1 ORDER BY created_at DESC").bind(parishId).all();
    return json({ keywords: r.results || [] });
  }

  if (request.method === "POST") {
    let body; try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const keyword = String(body.keyword || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const fundId  = String(body.fund_id || "").trim();
    if (!keyword) return json({ error: "keyword required" }, { status: 400 });
    if (!fundId)  return json({ error: "fund_id required" }, { status: 400 });
    if (keyword.length > 20) return json({ error: "keyword max 20 chars" }, { status: 400 });
    // Check global uniqueness -- keyword must be unique across ALL parishes
    const existing = await db.prepare("SELECT id FROM sms_keywords WHERE keyword = ?1").bind(keyword).first();
    if (existing) return json({ error: "Keyword \"" + keyword + "\" is already taken by another parish. Try including your parish name, e.g. trinitygive." }, { status: 409 });
    await db.prepare("INSERT INTO sms_keywords (parish_id, fund_id, keyword, is_active) VALUES (?1, ?2, ?3, 1)").bind(parishId, fundId, keyword).run();
    const created = await db.prepare("SELECT id, keyword, fund_id, is_active, created_at FROM sms_keywords WHERE parish_id = ?1 AND keyword = ?2").bind(parishId, keyword).first();
    return json({ keyword: created }, { status: 201 });
  }

  if (request.method === "DELETE") {
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);
    const keywordId = parts[parts.length - 1];
    if (!keywordId || keywordId === "sms-keywords") return json({ error: "keyword id required" }, { status: 400 });
    const row = await db.prepare("SELECT id FROM sms_keywords WHERE id = ?1 AND parish_id = ?2").bind(keywordId, parishId).first();
    if (!row) return json({ error: "Not found" }, { status: 404 });
    await db.prepare("DELETE FROM sms_keywords WHERE id = ?1 AND parish_id = ?2").bind(keywordId, parishId).run();
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

// --- SECTION 3: Routes (add inside fetch() handler) ---
//
// if (request.method === "POST" && url.pathname === "/api/webhooks/sms") {
//   return handleSignalWireSmsWebhook(request, env);
// }
// if (url.pathname.startsWith("/api/parish/dashboard/") && url.pathname.includes("/sms-keywords")) {
//   const parishId = decodeURIComponent(url.pathname.replace("/api/parish/dashboard/", "").split("/")[0]);
//   return handleParishSmsKeywords(request, env, parishId);
// }
