import { d1, d1All, d1GetSetting, d1SetSetting, generateSecret, listKvKeys } from "./core.js";
import { agapayEmailHtml, sendEmail } from "./email.js";
import { htmlEscape } from "./format.js";

const PREFIX = "__agapay_parish_support_ticket:";
const STATUSES = new Set(["new", "in_progress", "resolved", "closed"]);
const clean = (value, limit = 500) => String(value || "").trim().slice(0, limit);
const key = (id) => `${PREFIX}${id}`;
const parse = (value) => { try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return parsed && typeof parsed === "object" ? parsed : null; } catch { return null; } };

async function save(env, ticket) {
  const raw = JSON.stringify(ticket);
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.put(key(ticket.id), raw);
  if (d1(env)) await d1SetSetting(env, key(ticket.id), raw);
  return ticket;
}

export async function getParishSupportTicket(env, id) {
  const ticketId = clean(id, 120);
  if (!ticketId) return null;
  if (d1(env)) {
    const stored = parse(await d1GetSetting(env, key(ticketId)));
    if (stored) return stored;
  }
  return env.AGAPAY_REGISTRATIONS ? parse(await env.AGAPAY_REGISTRATIONS.get(key(ticketId))) : null;
}

export async function listParishSupportTickets(env, { limit = 200 } = {}) {
  const records = new Map();
  const bounded = Math.max(1, Math.min(500, Number(limit || 200)));
  if (d1(env)) {
    const rows = await d1All(env, "SELECT value FROM app_settings WHERE key LIKE ?1 ORDER BY updated_at DESC LIMIT ?2", `${PREFIX}%`, bounded);
    rows.map((row) => parse(row.value)).filter(Boolean).forEach((ticket) => records.set(ticket.id, ticket));
  }
  if (env.AGAPAY_REGISTRATIONS) {
    const keys = await listKvKeys(env, { prefix: PREFIX, limit: bounded });
    const values = await Promise.all(keys.map((item) => env.AGAPAY_REGISTRATIONS.get(item.name)));
    values.map(parse).filter(Boolean).forEach((ticket) => { if (!records.has(ticket.id)) records.set(ticket.id, ticket); });
  }
  return [...records.values()].sort((a, b) => {
    if ((a.status || "new") !== (b.status || "new")) return (a.status || "new") === "new" ? -1 : 1;
    return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  }).slice(0, bounded);
}

export async function submitParishSupportTicket(env, request, parish = {}, body = {}) {
  const message = clean(body.message, 2400);
  if (message.length < 8) return { ok: false, status: 400, error: "Please include a little more detail so we can help." };
  const type = ["question", "issue", "help"].includes(clean(body.type, 30).toLowerCase()) ? clean(body.type, 30).toLowerCase() : "help";
  const now = new Date().toISOString();
  const ticket = {
    id: generateSecret("parish_support"), status: "new", type,
    subject: clean(body.subject, 160) || `${type === "issue" ? "Issue" : type === "question" ? "Question" : "Help request"} from ${clean(parish.parishName, 160) || "a parish"}`,
    message, parishId: clean(parish.parishId, 160), parishName: clean(parish.parishName, 160),
    submittedBy: clean(body.submittedBy || parish.priestEmail || parish.email, 180),
    page: clean(body.page, 80), path: clean(body.path, 240), userAgent: clean(request.headers.get("user-agent"), 240),
    createdAt: now, updatedAt: now, adminNote: "", updatedBy: "", email: null
  };
  await save(env, ticket);
  const recipient = env.AGAPAY_SUPPORT_EMAIL || env.AGAPAY_REGISTRATION_NOTIFY_EMAIL || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app";
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const email = await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || "AGAPAY <hello@agapay.app>", to: [recipient], reply_to: ticket.submittedBy || env.AGAPAY_REPLY_TO_EMAIL || "support@agapay.app",
    subject: `[Parish ${type}] ${ticket.parishName || ticket.parishId}: ${ticket.subject}`,
    html: agapayEmailHtml(appUrl, "New parish dashboard support ticket", `<p><strong>${htmlEscape(ticket.parishName || ticket.parishId)}</strong> submitted a ${htmlEscape(type)}.</p><p><strong>Subject:</strong> ${htmlEscape(ticket.subject)}</p><p><strong>Dashboard area:</strong> ${htmlEscape(ticket.page || "Not specified")}</p><p style="white-space:pre-wrap">${htmlEscape(ticket.message)}</p><p><strong>Reply to:</strong> ${htmlEscape(ticket.submittedBy || "Not provided")}</p>`),
    text: `New parish dashboard ${type}\n\nParish: ${ticket.parishName || ticket.parishId}\nSubject: ${ticket.subject}\nArea: ${ticket.page || "Not specified"}\nReply to: ${ticket.submittedBy || "Not provided"}\n\n${ticket.message}`
  });
  ticket.email = { status: email.status || "unknown", sentAt: email.status === "sent" ? now : "" };
  await save(env, ticket);
  return { ok: true, ticket };
}

export async function updateParishSupportTicket(env, adminContext, id, body = {}) {
  const ticket = await getParishSupportTicket(env, id);
  if (!ticket) return { ok: false, status: 404, error: "Support ticket not found." };
  const status = clean(body.status, 40).toLowerCase();
  if (!STATUSES.has(status)) return { ok: false, status: 400, error: "Ticket status was invalid." };
  const updated = { ...ticket, status, adminNote: clean(body.note, 1000), updatedAt: new Date().toISOString(), updatedBy: adminContext.actor || "Admin" };
  await save(env, updated);
  return { ok: true, ticket: updated };
}
