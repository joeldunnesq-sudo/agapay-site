import { centsFromAmount, json, requireFields } from "../_shared/http.js";
import { findParish } from "../_shared/parishes.js";

const requiredFields = ["parishId", "giftType", "amount", "firstName", "email"];

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const missing = requireFields(body, requiredFields);
  if (missing.length) return json({ error: "Missing required fields", fields: missing }, { status: 422 });

  const amountCents = centsFromAmount(body.amount);
  if (!amountCents) return json({ error: "Amount must be greater than zero" }, { status: 422 });

  const parish = findParish(body.parishId);
  if (!parish || parish.status !== "verified") return json({ error: "Verified parish not found" }, { status: 404 });

  if (!env.STRIPE_SECRET_KEY) {
    return json({
      mode: "demo",
      reference: `AGP-DEMO-${Date.now().toString(36).toUpperCase()}`,
      message: "Stripe is not configured yet. Set STRIPE_SECRET_KEY to create live checkout sessions."
    });
  }

  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const feeCents = body.coverFees ? Math.round(amountCents * 0.029 + 30) : 0;
  const chargeCents = amountCents + feeCents;
  const recurring = body.frequency && body.frequency !== "once";
  const giftLabel = String(body.giftType).replace(/-/g, " ");

  const form = new URLSearchParams({
    mode: recurring ? "subscription" : "payment",
    success_url: `${appUrl}/give/${parish.id}?success=1`,
    cancel_url: `${appUrl}/give/${parish.id}?canceled=1`,
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
  });

  if (recurring) {
    form.set("line_items[0][price_data][recurring][interval]", body.frequency === "weekly" ? "week" : "month");
    if (body.frequency === "biweekly") {
      form.set("line_items[0][price_data][recurring][interval_count]", "2");
    }
  }

  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (parish.stripeAccountId) headers["Stripe-Account"] = parish.stripeAccountId;

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers,
    body: form
  });
  const stripeBody = await stripeResponse.json();

  if (!stripeResponse.ok) {
    return json(
      { error: "Stripe checkout session failed", detail: stripeBody.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  return json({ id: stripeBody.id, url: stripeBody.url }, { status: 201 });
}
