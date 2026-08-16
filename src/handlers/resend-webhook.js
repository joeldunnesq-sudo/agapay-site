import { Webhook } from "svix";

import { agapayEmailHtml, sendEmail } from "../lib/email.js";
import { htmlEscape } from "../lib/format.js";
import { json } from "../lib/core.js";

const ALERT_EVENT_TYPES = new Set([
  "email.bounced",
  "email.delivery_delayed",
  "email.failed",
  "email.complained",
]);

const EVENT_LABELS = Object.freeze({
  "email.bounced": "Email bounced",
  "email.delivery_delayed": "Email delivery delayed",
  "email.failed": "Email failed",
  "email.complained": "Spam complaint received",
});

const WEBHOOK_DEDUPE_PREFIX = "resend:webhook:";
const WEBHOOK_DEDUPE_TTL_SECONDS = 7 * 24 * 60 * 60;
const ALERT_SUBJECT_PREFIX = "[AGAPAY Ops] Resend delivery alert";

function webhookHeaders(request) {
  return {
    "svix-id": request.headers.get("svix-id") || "",
    "svix-timestamp": request.headers.get("svix-timestamp") || "",
    "svix-signature": request.headers.get("svix-signature") || "",
  };
}

async function duplicateDelivery(env, deliveryId) {
  if (!env.AGAPAY_REGISTRATIONS || !deliveryId) return false;
  try {
    return Boolean(await env.AGAPAY_REGISTRATIONS.get(`${WEBHOOK_DEDUPE_PREFIX}${deliveryId}`));
  } catch (error) {
    console.warn(JSON.stringify({
      eventType: "resend.webhook.dedupe_check_failed",
      severity: "warn",
      deliveryId,
      error: error?.message || String(error),
      timestamp: new Date().toISOString(),
    }));
    return false;
  }
}

async function markDelivered(env, deliveryId, eventType) {
  if (!env.AGAPAY_REGISTRATIONS || !deliveryId) return;
  try {
    await env.AGAPAY_REGISTRATIONS.put(
      `${WEBHOOK_DEDUPE_PREFIX}${deliveryId}`,
      JSON.stringify({ eventType, processedAt: new Date().toISOString() }),
      { expirationTtl: WEBHOOK_DEDUPE_TTL_SECONDS },
    );
  } catch (error) {
    console.warn(JSON.stringify({
      eventType: "resend.webhook.dedupe_store_failed",
      severity: "warn",
      deliveryId,
      error: error?.message || String(error),
      timestamp: new Date().toISOString(),
    }));
  }
}

function recipientSummary(data) {
  const recipients = Array.isArray(data?.to) ? data.to : [data?.to];
  return recipients.filter(Boolean).map((value) => String(value)).join(", ") || "Unknown recipient";
}

function providerDetail(event) {
  const data = event?.data || {};
  if (event?.type === "email.bounced") {
    return [data.bounce?.type, data.bounce?.subType, data.bounce?.message].filter(Boolean).join(" — ");
  }
  if (event?.type === "email.delivery_delayed") {
    return String(data.reason || data.message || "The receiving mail server reported a temporary delay.");
  }
  if (event?.type === "email.failed") {
    return String(data.error || data.reason || data.message || "Resend reported that the message failed.");
  }
  return String(data.reason || data.message || "The recipient reported the message as spam.");
}

function isAlertLoop(event) {
  return String(event?.data?.subject || "").startsWith(ALERT_SUBJECT_PREFIX);
}

async function sendDeliveryAlert(env, event, deliveryId) {
  const recipient = String(env.AGAPAY_OPS_ALERT_EMAIL || env.AGAPAY_REPLY_TO_EMAIL || "").trim();
  if (!recipient) return { status: "missing_recipient", detail: "AGAPAY_OPS_ALERT_EMAIL is not configured." };

  const data = event.data || {};
  const label = EVENT_LABELS[event.type] || event.type;
  const sourceSubject = String(data.subject || "(no subject)");
  const detail = providerDetail(event);
  const emailId = String(data.email_id || "");
  const happenedAt = String(event.created_at || data.created_at || new Date().toISOString());
  const appUrl = env.AGAPAY_APP_URL || "https://agapay.app";

  return sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || "AGAPAY <onboarding@agapay.app>",
    to: [recipient],
    reply_to: env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
    subject: `${ALERT_SUBJECT_PREFIX}: ${label}`,
    text: [
      "AGAPAY Resend delivery alert",
      "",
      `Event: ${event.type}`,
      `Recipient: ${recipientSummary(data)}`,
      `Subject: ${sourceSubject}`,
      `Provider detail: ${detail}`,
      `Resend email ID: ${emailId || "Unavailable"}`,
      `Webhook delivery ID: ${deliveryId || "Unavailable"}`,
      `Occurred: ${happenedAt}`,
    ].join("\n"),
    html: agapayEmailHtml(appUrl, label, `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#171715;">Resend reported an outbound AGAPAY email delivery problem that requires review.</p>
      <div style="background:#FBEFE9;border:1px solid rgba(178,68,30,0.28);border-radius:12px;padding:18px;margin:0 0 20px;">
        <p style="margin:0 0 8px;font-size:14px;"><strong>Event:</strong> ${htmlEscape(event.type)}</p>
        <p style="margin:0 0 8px;font-size:14px;"><strong>Recipient:</strong> ${htmlEscape(recipientSummary(data))}</p>
        <p style="margin:0 0 8px;font-size:14px;"><strong>Original subject:</strong> ${htmlEscape(sourceSubject)}</p>
        <p style="margin:0 0 8px;font-size:14px;"><strong>Provider detail:</strong> ${htmlEscape(detail)}</p>
        <p style="margin:0 0 8px;font-size:12px;color:#625D53;"><strong>Resend email ID:</strong> ${htmlEscape(emailId || "Unavailable")}</p>
        <p style="margin:0;font-size:12px;color:#625D53;"><strong>Occurred:</strong> ${htmlEscape(happenedAt)}</p>
      </div>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#171715;">Review the message in the Resend Emails dashboard and correct or suppress the recipient before retrying.</p>
    `),
  });
}

export async function handleResendWebhook(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const secret = String(env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!secret) return json({ error: "Resend webhook is not configured" }, { status: 503 });

  const headers = webhookHeaders(request);
  if (!headers["svix-id"] || !headers["svix-timestamp"] || !headers["svix-signature"]) {
    return json({ error: "Missing webhook signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event;
  try {
    event = new Webhook(secret).verify(rawBody, headers);
  } catch {
    return json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const deliveryId = headers["svix-id"];
  if (await duplicateDelivery(env, deliveryId)) return json({ ok: true, duplicate: true });

  const eventType = String(event?.type || "");
  if (ALERT_EVENT_TYPES.has(eventType) && !isAlertLoop(event)) {
    const alert = await sendDeliveryAlert(env, event, deliveryId);
    if (alert.status !== "sent") {
      console.error(JSON.stringify({
        eventType: "resend.delivery_alert.failed",
        severity: "error",
        resendEventType: eventType,
        deliveryId,
        detail: alert.detail || alert.status || "Unknown email error",
        timestamp: new Date().toISOString(),
      }));
      return json({ error: "Unable to dispatch delivery alert" }, { status: 502 });
    }
  }

  await markDelivered(env, deliveryId, eventType);
  console.log(JSON.stringify({
    eventType: "resend.webhook.processed",
    severity: ALERT_EVENT_TYPES.has(eventType) ? "warn" : "info",
    resendEventType: eventType,
    deliveryId,
    timestamp: new Date().toISOString(),
  }));
  return json({ ok: true });
}

