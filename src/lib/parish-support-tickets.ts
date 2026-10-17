import type { EmailEnv } from './email.js';
export type SupportTicketEnv = EmailEnv & { AGAPAY_SUPPORT_EMAIL?: string };
export interface SupportTicket {
  id: string;
  status: string;
  type: string;
  source: string;
  subject: string;
  message: string;
  parishId: string;
  parishName: string;
  submittedBy: string;
  page: string;
  path: string;
  userAgent: string;
  createdAt: string;
  updatedAt: string;
  adminNote: string;
  updatedBy: string;
  email: { status: string; sentAt: string } | null;
}
export interface SupportTicketInput {
  message?: unknown;
  type?: unknown;
  source?: unknown;
  subject?: unknown;
  submittedBy?: unknown;
  page?: unknown;
  path?: unknown;
  status?: unknown;
  note?: unknown;
}

import { d1, d1All, d1First, d1SetSetting, generateSecret, listKvKeys } from './core.js';
import { agapayEmailHtml, sendEmail } from './email.js';
import { htmlEscape } from './format.js';

const PREFIX = '__agapay_parish_support_ticket:';
const STATUSES = new Set(['new', 'in_progress', 'resolved', 'closed']);
const clean = (value: unknown, limit = 500) =>
  String(value || '')
    .trim()
    .slice(0, limit);
const key = (id: string) => `${PREFIX}${id}`;
const TICKET_STRING_FIELDS = [
  'status',
  'type',
  'source',
  'subject',
  'message',
  'parishId',
  'parishName',
  'submittedBy',
  'page',
  'path',
  'userAgent',
  'createdAt',
  'updatedAt',
  'adminNote',
  'updatedBy',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSupportTicket(value: unknown): value is SupportTicket {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    TICKET_STRING_FIELDS.every((field) => typeof value[field] === 'string') &&
    (value.email === null ||
      (isRecord(value.email) && typeof value.email.status === 'string' && typeof value.email.sentAt === 'string'))
  );
}

const parse = (value: unknown, expectedId: string): SupportTicket | null => {
  try {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (!isRecord(parsed)) return null;
    // Older tickets may omit later-added display/admin fields and email metadata.
    const candidate: Record<string, unknown> = { ...parsed };
    for (const field of TICKET_STRING_FIELDS) {
      if (candidate[field] === undefined) candidate[field] = field === 'status' ? 'new' : '';
    }
    if (candidate.email === undefined) candidate.email = null;
    else if (isRecord(candidate.email) && candidate.email.sentAt === undefined) {
      candidate.email = { ...candidate.email, sentAt: '' };
    }
    return isSupportTicket(candidate) && candidate.id === expectedId ? candidate : null;
  } catch {
    return null;
  }
};

async function save(env: SupportTicketEnv, ticket: SupportTicket) {
  const raw = JSON.stringify(ticket);
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.put(key(ticket.id), raw);
  if (d1(env)) await d1SetSetting(env, key(ticket.id), raw);
  return ticket;
}

export async function getParishSupportTicket(env: SupportTicketEnv, id: string) {
  const ticketId = clean(id, 120);
  if (!ticketId) return null;
  if (d1(env)) {
    const row = await d1First<{ value: string }>(env, 'SELECT value FROM app_settings WHERE key = ?1', key(ticketId));
    if (row) return parse(row.value, ticketId);
  }
  return env.AGAPAY_REGISTRATIONS ? parse(await env.AGAPAY_REGISTRATIONS.get(key(ticketId)), ticketId) : null;
}

export async function listParishSupportTickets(env: SupportTicketEnv, { limit = 200 }: { limit?: number } = {}) {
  const records = new Map<string, SupportTicket>();
  const canonicalIds = new Set<string>();
  const bounded = Math.max(1, Math.min(500, Number(limit || 200)));
  if (d1(env)) {
    const rows = await d1All<{ key: string; value: string }>(
      env,
      'SELECT key, value FROM app_settings WHERE key LIKE ?1 ORDER BY updated_at DESC LIMIT ?2',
      `${PREFIX}%`,
      bounded
    );
    for (const row of rows) {
      if (!row.key.startsWith(PREFIX)) continue;
      const id = row.key.slice(PREFIX.length);
      canonicalIds.add(id);
      const ticket = parse(row.value, id);
      if (ticket) records.set(id, ticket);
    }
  }
  if (env.AGAPAY_REGISTRATIONS) {
    const keys = await listKvKeys(env, { prefix: PREFIX, limit: bounded });
    const values = await Promise.all(keys.map((item) => env.AGAPAY_REGISTRATIONS!.get(item.name)));
    values.forEach((value, index) => {
      const id = keys[index]!.name.slice(PREFIX.length);
      if (canonicalIds.has(id)) return;
      const ticket = parse(value, id);
      if (ticket) records.set(id, ticket);
    });
  }
  return [...records.values()]
    .sort((a, b) => {
      if ((a.status || 'new') !== (b.status || 'new')) return (a.status || 'new') === 'new' ? -1 : 1;
      return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
    })
    .slice(0, bounded);
}

export async function submitParishSupportTicket(
  env: SupportTicketEnv,
  request: Request,
  parish: Record<string, unknown> = {},
  body: SupportTicketInput = {}
) {
  const message = clean(body.message, 2400);
  if (message.length < 8)
    return { ok: false, status: 400, error: 'Please include a little more detail so we can help.' };
  const type = ['question', 'issue', 'help', 'feature'].includes(clean(body.type, 30).toLowerCase())
    ? clean(body.type, 30).toLowerCase()
    : 'help';
  const source = clean(body.source, 30).toLowerCase() === 'myagapay' ? 'myagapay' : 'parish_dashboard';
  const sourceLabel = source === 'myagapay' ? 'My AGAPAY' : 'Parish dashboard';
  const now = new Date().toISOString();
  const ticket: SupportTicket = {
    id: generateSecret('parish_support'),
    status: 'new',
    type,
    source,
    subject:
      clean(body.subject, 160) ||
      `${type === 'issue' ? 'Issue' : type === 'question' ? 'Question' : type === 'feature' ? 'Feature request' : 'Help request'} from ${clean(parish.parishName, 160) || 'My AGAPAY'}`,
    message,
    parishId: clean(parish.parishId, 160),
    parishName: clean(parish.parishName, 160),
    submittedBy: clean(body.submittedBy || parish.priestEmail || parish.email, 180),
    page: clean(body.page, 80),
    path: clean(body.path, 240),
    userAgent: clean(request.headers.get('user-agent'), 240),
    createdAt: now,
    updatedAt: now,
    adminNote: '',
    updatedBy: '',
    email: null,
  };
  await save(env, ticket);
  const recipient =
    env.AGAPAY_SUPPORT_EMAIL ||
    env.AGAPAY_REGISTRATION_NOTIFY_EMAIL ||
    env.AGAPAY_REPLY_TO_EMAIL ||
    'support@agapay.app';
  const appUrl = env.AGAPAY_APP_URL || new URL(request.url).origin;
  const email = await sendEmail(env, {
    from: env.AGAPAY_FROM_EMAIL || 'AGAPAY <hello@agapay.app>',
    to: [recipient],
    reply_to: ticket.submittedBy || env.AGAPAY_REPLY_TO_EMAIL || 'support@agapay.app',
    subject: `[${sourceLabel} ${type}] ${ticket.parishName || ticket.parishId}: ${ticket.subject}`,
    html: agapayEmailHtml(
      appUrl,
      `New ${sourceLabel} support ticket`,
      `<p><strong>${htmlEscape(ticket.parishName || ticket.parishId)}</strong> submitted a ${htmlEscape(type)} from ${htmlEscape(sourceLabel)}.</p><p><strong>Subject:</strong> ${htmlEscape(ticket.subject)}</p><p><strong>App area:</strong> ${htmlEscape(ticket.page || 'Not specified')}</p><p style="white-space:pre-wrap">${htmlEscape(ticket.message)}</p><p><strong>Reply to:</strong> ${htmlEscape(ticket.submittedBy || 'Not provided')}</p>`
    ),
    text: `New ${sourceLabel} ${type}\n\nParish: ${ticket.parishName || ticket.parishId}\nSubject: ${ticket.subject}\nArea: ${ticket.page || 'Not specified'}\nReply to: ${ticket.submittedBy || 'Not provided'}\n\n${ticket.message}`,
  });
  ticket.email = { status: email.status || 'unknown', sentAt: email.status === 'sent' ? now : '' };
  await save(env, ticket);
  return { ok: true, ticket };
}

export async function updateParishSupportTicket(
  env: SupportTicketEnv,
  adminContext: { actor?: string },
  id: string,
  body: SupportTicketInput = {}
) {
  const ticket = await getParishSupportTicket(env, id);
  if (!ticket) return { ok: false, status: 404, error: 'Support ticket not found.' };
  const status = clean(body.status, 40).toLowerCase();
  if (!STATUSES.has(status)) return { ok: false, status: 400, error: 'Ticket status was invalid.' };
  const updated = {
    ...ticket,
    status,
    adminNote: clean(body.note, 1000),
    updatedAt: new Date().toISOString(),
    updatedBy: adminContext.actor || 'Admin',
  };
  await save(env, updated);
  return { ok: true, ticket: updated };
}
