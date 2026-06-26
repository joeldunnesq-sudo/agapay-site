import { d1, d1All, d1GetSetting, d1SetSetting, generateSecret, listKvKeys } from "../lib/core.js";
import { agapayEmailHtml, sendEmail } from "../lib/email.js";
import { htmlEscape } from "../lib/format.js";

const LEARN_FEEDBACK_PREFIX = "__agapay_learn_feedback:";
const ALLOWED_FEEDBACK_STATUSES = new Set(["new", "seen-considered", "archived"]);

function feedbackKey(id) {
  return `${LEARN_FEEDBACK_PREFIX}${id}`;
}

function parse(value) {
  if (!value) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function clean(value, limit = 500) {
  return String(value || "").trim().slice(0, limit);
}

async function saveFeedback(env, record) {
  const raw = JSON.stringify(record);
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.put(feedbackKey(record.id), raw);
  if (d1(env)) await d1SetSetting(env, feedbackKey(record.id), raw);
  return record;
}

export async function getLearnFeedback(env, id) {
  const feedbackId = clean(id, 120);
  if (!feedbackId) return null;
  if (d1(env)) {
    const stored = parse(await d1GetSetting(env, feedbackKey(feedbackId)));
    if (stored) return stored;
  }
  return env.AGAPAY_REGISTRATIONS ? parse(await env.AGAPAY_REGISTRATIONS.get(feedbackKey(feedbackId))) : null;
}

export async function listLearnFeedback(env, { limit = 200 } = {}) {
  const records = new Map();
  if (d1(env)) {
    const rows = await d1All(env, "SELECT value FROM app_settings WHERE key LIKE ?1 ORDER BY updated_at DESC LIMIT ?2", `${LEARN_FEEDBACK_PREFIX}%`, Math.max(1, Math.min(1000, Number(limit || 200))));
    rows.map((row) => parse(row.value)).filter(Boolean).forEach((record) => records.set(record.id, record));
  }
  if (env.AGAPAY_REGISTRATIONS) {
    const keys = await listKvKeys(env, { prefix: LEARN_FEEDBACK_PREFIX, limit: Math.max(1, Math.min(1000, Number(limit || 200))) });
    const values = await Promise.all(keys.map((item) => env.AGAPAY_REGISTRATIONS.get(item.name)));
    values.map(parse).filter(Boolean).forEach((record) => {
      if (!records.has(record.id)) records.set(record.id, record);
    });
  }
  return [...records.values()]
    .sort((a, b) => {
      if ((a.status || "new") !== (b.status || "new")) return (a.status || "new") === "new" ? -1 : 1;
      return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    })
    .slice(0, Math.max(1, Math.min(1000, Number(limit || 200))));
}

export async function submitLearnFeedback(env, identity, body = {}) {
  const message = clean(body.message, 1600);
  if (message.length < 8) return { ok: false, status: 400, error: "Please add a little more detail before sending your suggestion." };
  const now = new Date().toISOString();
  const record = {
    id: generateSecret("learn_feedback"),
    status: "new",
    subject: clean(body.subject, 120) || "Learn Dashboard suggestion",
    message,
    page: clean(body.page, 80) || "dashboard",
    path: clean(body.path, 240),
    submittedBy: identity.email || "",
    householdId: identity.householdId || "",
    familyName: clean(body.familyName, 120),
    userAgent: clean(body.userAgent, 240),
    createdAt: now,
    updatedAt: now,
    seenAt: "",
    consideredAt: "",
    consideredBy: "",
    userNotification: null
  };
  await saveFeedback(env, record);
  return { ok: true, feedback: record };
}

async function sendSeenConsideredEmail(env, request, feedback) {
  if (!feedback.submittedBy) return { status: "missing_recipient" };
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const safeSubject = htmlEscape(feedback.subject || "your AGAPAY Learn suggestion");
  return sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || "AGAPAY <hello@agapay.app>",
    to: [feedback.submittedBy],
    subject: "Your AGAPAY Learn suggestion has been seen",
    html: agapayEmailHtml(appUrl, "Thank you for helping AGAPAY Learn", `
      <p style="margin:0 0 16px;">Thank you for taking the time to suggest an improvement to AGAPAY Learn.</p>
      <p style="margin:0 0 16px;">Your suggestion, <strong>${safeSubject}</strong>, has been seen and considered. We are grateful that you helped make AGAPAY Learn better for Orthodox homeschooling families.</p>
      <p style="margin:0;">With gratitude,<br />The AGAPAY team</p>
    `),
    text: `Thank you for taking the time to suggest an improvement to AGAPAY Learn.\n\nYour suggestion, "${feedback.subject || "AGAPAY Learn suggestion"}", has been seen and considered. We are grateful that you helped make AGAPAY Learn better for Orthodox homeschooling families.\n\nWith gratitude,\nThe AGAPAY team`
  });
}

export async function updateLearnFeedbackStatus(env, request, adminContext, id, body = {}) {
  const record = await getLearnFeedback(env, id);
  if (!record) return { ok: false, status: 404, error: "Learn suggestion not found." };
  const status = clean(body.status, 40).toLowerCase();
  if (!ALLOWED_FEEDBACK_STATUSES.has(status)) return { ok: false, status: 400, error: "Suggestion status was invalid." };
  const now = new Date().toISOString();
  let updated = {
    ...record,
    status,
    updatedAt: now
  };
  if (status === "seen-considered") {
    const email = record.userNotification?.status === "sent"
      ? record.userNotification
      : await sendSeenConsideredEmail(env, request, record);
    updated = {
      ...updated,
      seenAt: record.seenAt || now,
      consideredAt: now,
      consideredBy: adminContext.actor || "Admin",
      adminNote: clean(body.note, 500),
      userNotification: {
        status: email.status || "unknown",
        detail: email.detail || email.error || email.body || "",
        httpStatus: email.httpStatus || "",
        sentAt: email.status === "sent" ? now : record.userNotification?.sentAt || ""
      }
    };
  }
  await saveFeedback(env, updated);
  return { ok: true, feedback: updated };
}
