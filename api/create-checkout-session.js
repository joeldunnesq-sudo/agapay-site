import https from "node:https";
import { findParish } from "../lib/parishes.js";
import { handleOptions, readJson, requireFields, sendJson } from "../lib/http.js";

const requiredFields = ["parishId", "giftType", "amount", "firstName", "email"];
const MAX_DONATION_CENTS = 5_000_000;

function centsFromAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const cents = Math.round(numeric * 100);
  if (cents <= 0 || cents > MAX_DONATION_CENTS) return null;
  return cents;
}

function donationAmountError(amount) {
  const numeric = Number(amount);
  const cents = Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
  if (Number.isFinite(numeric) && numeric > 0 && cents > MAX_DONATION_CENTS) {
    return "Amount exceeds the maximum allowed gift.";
  }
  return "Amount must be greater than zero.";
}

function postToStripe(form, stripeKey, stripeAccountId) {
  const body = new URLSearchParams(form).toString();
  const headers = {
    Authorization: `Bearer ${stripeKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "Content-Length": Buffer.byteLength(body)
  };
  if (stripeAccountId) headers["Stripe-Account"] = stripeAccountId;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.stripe.com",
        path: "/v1/checkout/sessions",
        method: "POST",
        headers
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const parsed = raw ? JSON.parse(raw) : {};
          if (res.statusCode >= 400) reject(parsed);
          else resolve(parsed);
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const missing = requireFields(body, requiredFields);
  if (missing.length) return sendJson(res, 422, { error: "Missing required fields", fields: missing });

  const amountCents = centsFromAmount(body.amount);
  if (!amountCents) return sendJson(res, 422, { error: donationAmountError(body.amount) });

  const parish = await findParish(body.parishId);
  if (!parish || parish.status !== "verified") return sendJson(res, 404, { error: "Verified parish not found" });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return sendJson(res, 200, {
      mode: "demo",
      reference: `AGP-DEMO-${Date.now().toString(36).toUpperCase()}`,
      message: "Stripe is not configured yet. Set STRIPE_SECRET_KEY to create live checkout sessions."
    });
  }

  const origin = process.env.AGAPAY_APP_URL || `https://${req.headers.host}`;
  const feeCents = body.coverFees ? Math.round(amountCents * 0.029 + 30) : 0;
  const chargeCents = amountCents + feeCents;
  const giftLabel = String(body.giftType).replace(/-/g, " ");

  const form = {
    mode: body.frequency && body.frequency !== "once" ? "subscription" : "payment",
    success_url: `${origin}/give/${parish.id}?success=1`,
    cancel_url: `${origin}/give/${parish.id}?canceled=1`,
    customer_email: body.email,
    "metadata[parish_id]": parish.id,
    "metadata[gift_type]": body.giftType,
    "metadata[fund]": body.fund || "",
    "metadata[frequency]": body.frequency || "once",
    "metadata[names_living]": body.namesLiving || "",
    "metadata[names_departed]": body.namesDeparted || "",
    "payment_intent_data[metadata][parish_id]": parish.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": `${parish.name} - ${giftLabel}`,
    "line_items[0][price_data][unit_amount]": String(chargeCents)
  };

  if (form.mode === "subscription") {
    form["line_items[0][price_data][recurring][interval]"] = body.frequency === "weekly" ? "week" : "month";
    if (body.frequency === "biweekly") form["line_items[0][price_data][recurring][interval_count]"] = "2";
  }

  try {
    const session = await postToStripe(form, stripeKey, parish.stripeAccountId);
    sendJson(res, 201, { url: session.url, id: session.id });
  } catch (error) {
    sendJson(res, 502, { error: "Stripe checkout session failed", detail: error.message || error.error?.message });
  }
}
