import { d1, hasProductionStore, json, missingProductionStoreResponse, normalizeEmail } from '../lib/core.js';
import { listDirectoryMilestones } from '../directory/milestones.js';
import { enrichLiturgicalDayWithOrthocal } from '../learn/readings-source.js';
import { loadPublishedCommerceCalendarEvents } from './parish-events.js';
import { requireCommunicationsAdmin } from './parish-communications.js';

const BULLETIN_TEMPLATES = new Set(['heritage', 'quiet', 'folded']);
const BULLETIN_BLOCK_TYPES = new Set([
  'message',
  'liturgical',
  'hymns',
  'celebrations',
  'schedule',
  'announcements',
  'events',
  'giving',
]);
const MAX_BULLETIN_BYTES = 128 * 1024;

function bulletinError(message, status = 422) {
  return Object.assign(new Error(message), { status });
}

function cleanText(value, max, { required = false, label = 'Text' } = {}) {
  const text = String(value ?? '')
    .trim()
    .slice(0, max);
  if (required && !text) throw bulletinError(`${label} is required.`);
  return text;
}

function cleanBulletinDate(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bulletinError('Choose a valid bulletin date.');
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw bulletinError('Choose a valid bulletin date.');
  }
  return date;
}

function cleanBulletinItem(item = {}) {
  const requestedSource = String(item.source || '')
    .trim()
    .toLowerCase();
  return {
    label: cleanText(item.label, 80, { label: 'Item label' }),
    text: cleanText(item.text, 500, { required: true, label: 'Item text' }),
    source: requestedSource === 'directory' ? 'directory' : 'manual',
  };
}

function cleanTempleTroparion(item = {}, index = 0) {
  const requestedId = cleanText(item.id, 80);
  const requestedKind = String(item.kind || 'troparion')
    .trim()
    .toLowerCase();
  const kind = ['troparion', 'kontakion', 'other'].includes(requestedKind) ? requestedKind : 'troparion';
  return {
    id: /^[a-zA-Z0-9-]{8,80}$/.test(requestedId) ? requestedId : crypto.randomUUID(),
    kind,
    title: cleanText(item.title, 120, { required: true, label: 'Troparion title' }),
    tone: cleanText(item.tone, 80, { label: 'Tone' }),
    text: cleanText(item.text, 5000, { required: true, label: 'Troparion text' }),
    sortOrder: index,
  };
}

function cleanBulletinBlock(block = {}) {
  const type = String(block.type || '')
    .trim()
    .toLowerCase();
  if (!BULLETIN_BLOCK_TYPES.has(type)) throw bulletinError('Choose a supported bulletin block.');
  const requestedId = cleanText(block.id, 80);
  const cleaned = {
    id: /^[a-zA-Z0-9-]{8,80}$/.test(requestedId) ? requestedId : crypto.randomUUID(),
    type,
    title: cleanText(block.title, 120, { required: true, label: 'Block title' }),
  };
  if (type === 'schedule' || type === 'events' || type === 'celebrations') {
    const items = Array.isArray(block.items) ? block.items.slice(0, 20).map(cleanBulletinItem) : [];
    return { ...cleaned, items };
  }
  if (type === 'liturgical') {
    const items = Array.isArray(block.items) ? block.items.slice(0, 10).map(cleanBulletinItem) : [];
    const serviceDate = block.serviceDate ? cleanBulletinDate(block.serviceDate) : '';
    return {
      ...cleaned,
      saint: cleanText(block.saint, 500, { label: 'Saint or feast' }),
      saintLife: cleanText(block.saintLife, 4000, { label: 'Life of the saint' }),
      quoteText: cleanText(block.quoteText, 1000, { label: 'Saint quotation' }),
      quoteAttribution: cleanText(block.quoteAttribution, 200, { label: 'Quotation attribution' }),
      items,
      serviceDate,
      sourceLabel: cleanText(block.sourceLabel, 80, { label: 'Liturgical source' }),
    };
  }
  if (type === 'hymns') {
    const hymns = Array.isArray(block.hymns)
      ? block.hymns.slice(0, 12).map((item, index) => cleanTempleTroparion(item, index))
      : [];
    return { ...cleaned, hymns };
  }
  return { ...cleaned, body: cleanText(block.body, 8000, { label: 'Block body' }) };
}

export function validateBulletinInput(input = {}) {
  const title = cleanText(input.title, 120, { required: true, label: 'Bulletin title' });
  const serviceDate = cleanBulletinDate(input.serviceDate);
  const template = String(input.template || 'heritage')
    .trim()
    .toLowerCase();
  if (!BULLETIN_TEMPLATES.has(template)) throw bulletinError('Choose a supported bulletin design.');
  if (!Array.isArray(input.blocks) || !input.blocks.length) throw bulletinError('Add at least one bulletin block.');
  if (input.blocks.length > 30) throw bulletinError('A bulletin can contain up to 30 blocks.');
  const blocks = input.blocks.map(cleanBulletinBlock);
  const contentJson = JSON.stringify(blocks);
  if (new TextEncoder().encode(contentJson).byteLength > MAX_BULLETIN_BYTES) {
    throw bulletinError('This bulletin is too large. Shorten its content and try again.', 413);
  }
  return { title, serviceDate, template, blocks, contentJson };
}

function parseBlocks(value) {
  try {
    const blocks = JSON.parse(String(value || '[]'));
    return Array.isArray(blocks) ? blocks : [];
  } catch {
    return [];
  }
}

export function bulletinFromRow(row = {}) {
  return {
    id: row.id || '',
    parishId: row.parish_id || '',
    title: row.title || '',
    serviceDate: row.service_date || '',
    template: row.template || 'heritage',
    status: row.status || 'draft',
    blocks: parseBlocks(row.content_json),
    createdBy: row.created_by || '',
    publishedAt: row.published_at || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

async function readBulletinBody(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BULLETIN_BYTES + 16 * 1024) {
    throw bulletinError('This bulletin is too large. Shorten its content and try again.', 413);
  }
  try {
    return await request.json();
  } catch {
    throw bulletinError('The bulletin could not be read. Refresh and try again.', 400);
  }
}

export async function listParishBulletins(db, parishId) {
  const rows = await db
    .prepare(
      `
      SELECT * FROM parish_bulletins
      WHERE parish_id = ? AND status != 'archived'
      ORDER BY service_date DESC, updated_at DESC
      LIMIT 50
    `
    )
    .bind(parishId)
    .all();
  return (rows.results || []).map(bulletinFromRow);
}

export async function listParishTempleTroparia(db, parishId) {
  const rows = await db
    .prepare(
      `
      SELECT id, kind, title, tone, text_body, sort_order
      FROM parish_bulletin_troparia
      WHERE parish_id = ? AND active = 1
      ORDER BY sort_order ASC, created_at ASC
    `
    )
    .bind(parishId)
    .all();
  return (rows.results || []).map((row) => ({
    id: row.id || '',
    kind: row.kind || 'troparion',
    title: row.title || '',
    tone: row.tone || '',
    text: row.text_body || '',
    sortOrder: Number(row.sort_order || 0),
  }));
}

export async function saveParishTempleTroparia(db, { parishId, createdBy, input }) {
  if (!Array.isArray(input?.troparia)) throw bulletinError('Provide the temple troparia to save.');
  if (input.troparia.length > 12) throw bulletinError('A parish can save up to 12 temple troparia.');
  const troparia = input.troparia.map((item, index) => cleanTempleTroparion(item, index));
  const statements = [
    db.prepare('DELETE FROM parish_bulletin_troparia WHERE parish_id = ?').bind(parishId),
    ...troparia.map((item) =>
      db
        .prepare(
          `
          INSERT INTO parish_bulletin_troparia
            (id, parish_id, kind, title, tone, text_body, sort_order, active, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        `
        )
        .bind(item.id, parishId, item.kind, item.title, item.tone, item.text, item.sortOrder, createdBy)
    ),
  ];
  await db.batch(statements);
  return listParishTempleTroparia(db, parishId);
}

export async function createParishBulletin(db, { parishId, createdBy, input }) {
  const bulletin = validateBulletinInput(input);
  const id = crypto.randomUUID();
  await db
    .prepare(
      `
      INSERT INTO parish_bulletins
        (id, parish_id, title, service_date, template, status, content_json, created_by)
      VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)
    `
    )
    .bind(id, parishId, bulletin.title, bulletin.serviceDate, bulletin.template, bulletin.contentJson, createdBy)
    .run();
  const row = await db
    .prepare('SELECT * FROM parish_bulletins WHERE id = ? AND parish_id = ?')
    .bind(id, parishId)
    .first();
  return bulletinFromRow(row);
}

export async function updateParishBulletin(db, { parishId, bulletinId, input }) {
  const bulletin = validateBulletinInput(input);
  const result = await db
    .prepare(
      `
      UPDATE parish_bulletins
      SET title = ?, service_date = ?, template = ?, content_json = ?, updated_at = datetime('now')
      WHERE id = ? AND parish_id = ? AND status = 'draft'
    `
    )
    .bind(bulletin.title, bulletin.serviceDate, bulletin.template, bulletin.contentJson, bulletinId, parishId)
    .run();
  if (!result.meta?.changes) return null;
  const row = await db
    .prepare('SELECT * FROM parish_bulletins WHERE id = ? AND parish_id = ?')
    .bind(bulletinId, parishId)
    .first();
  return bulletinFromRow(row);
}

export async function archiveParishBulletin(db, { parishId, bulletinId }) {
  const result = await db
    .prepare(
      `
      UPDATE parish_bulletins
      SET status = 'archived', updated_at = datetime('now')
      WHERE id = ? AND parish_id = ? AND status = 'draft'
    `
    )
    .bind(bulletinId, parishId)
    .run();
  return Boolean(result.meta?.changes);
}

function bulletinExcerpt(value, max = 220) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function bulletinCalendarType(registration = {}) {
  const calendar = String(registration.liturgicalCalendar || 'julian')
    .trim()
    .toLowerCase();
  return calendar === 'gregorian' || calendar === 'revised-julian' ? 'revised-julian' : 'julian';
}

function capitalizeReadingType(value = '') {
  const text = String(value || '').trim();
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : 'Reading';
}

export async function buildSundayLiturgicalBlock({ serviceDate, registration = {}, fetcher = fetch } = {}) {
  const cleanServiceDate = cleanBulletinDate(serviceDate);
  const day = await enrichLiturgicalDayWithOrthocal(
    {
      feastTitle: '',
      saints: [],
      saintStories: [],
      readingAppointments: [],
      epistleRef: '',
      gospelRef: '',
    },
    {
      calendarType: bulletinCalendarType(registration),
      civilDate: cleanServiceDate,
      fetcher,
    }
  );
  const appointments = Array.isArray(day.readingAppointments) ? day.readingAppointments : [];
  const saintStories = Array.isArray(day.saintStories) ? day.saintStories : [];
  const primaryStory = saintStories.find((story) => story.primary) || saintStories[0] || null;
  const items = appointments.slice(0, 10).map((reading) => ({
    label: capitalizeReadingType(reading.type),
    text: [reading.ref, reading.appointment].filter(Boolean).join(' · '),
  }));
  if (!items.length) {
    if (day.epistleRef && day.epistleRef !== 'Not listed') items.push({ label: 'Epistle', text: day.epistleRef });
    if (day.gospelRef && day.gospelRef !== 'Not listed') items.push({ label: 'Gospel', text: day.gospelRef });
  }
  return {
    id: crypto.randomUUID(),
    type: 'liturgical',
    title: 'Saint & appointed readings',
    saint: day.primarySaintTitle || day.feastTitle || day.saints?.[0] || 'Add Sunday’s saint or feast',
    saintLife: primaryStory?.storyText ? bulletinExcerpt(primaryStory.storyText, 900) : '',
    quoteText: '',
    quoteAttribution: '',
    items,
    serviceDate: cleanServiceDate,
    sourceLabel: day.sourceConnected ? day.sourceLabel || 'Orthocal.info' : '',
    sourceConnected: Boolean(day.sourceConnected),
  };
}

function shortCelebrationDate(value) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    date
  );
}

export async function buildBulletinCelebrationsBlock(
  env,
  parishId,
  serviceDate,
  { milestoneLoader = listDirectoryMilestones } = {}
) {
  const cleanServiceDate = cleanBulletinDate(serviceDate);
  const milestones = await milestoneLoader(env, {
    context: { parishId },
    days: 7,
    fromDate: new Date(`${cleanServiceDate}T12:00:00Z`),
  });
  return {
    id: crypto.randomUUID(),
    type: 'celebrations',
    title: 'Parish celebrations',
    serviceDate: cleanServiceDate,
    items: (milestones.items || []).slice(0, 24).map((item) => ({
      label: shortCelebrationDate(item.date),
      text: [item.label, item.typeLabel, item.detail].filter(Boolean).join(' · '),
      source: 'directory',
    })),
  };
}

export async function buildBulletinSuggestions(db, env, parishId, registration = {}, serviceDate = nextSundayDate()) {
  const announcementRows = await db
    .prepare(
      `
      SELECT id, title, body
      FROM parish_announcements
      WHERE parish_id = ? AND status = 'published'
      ORDER BY pinned DESC, published_at DESC
      LIMIT 5
    `
    )
    .bind(parishId)
    .all();
  const announcements = announcementRows.results || [];
  let events = [];
  try {
    events = await loadPublishedCommerceCalendarEvents(env, parishId, registration);
  } catch (error) {
    console.warn(
      'bulletin_event_suggestions_failed',
      JSON.stringify({ parishId, message: error?.message || String(error) })
    );
  }
  const liturgicalBlock = await buildSundayLiturgicalBlock({ serviceDate, registration });
  let celebrationsBlock = null;
  try {
    celebrationsBlock = await buildBulletinCelebrationsBlock(env, parishId, serviceDate);
  } catch (error) {
    console.warn(
      'bulletin_celebration_suggestions_failed',
      JSON.stringify({ parishId, message: error?.message || String(error) })
    );
  }
  const templeTroparia = await listParishTempleTroparia(db, parishId);
  const blocks = [
    {
      id: crypto.randomUUID(),
      type: 'message',
      title: 'A word of welcome',
      body: `Welcome to worship at ${registration.parishName || 'our parish'}.`,
    },
    liturgicalBlock,
    {
      id: crypto.randomUUID(),
      type: 'schedule',
      title: 'This week in worship',
      items: [],
    },
  ];
  if (templeTroparia.length) {
    blocks.splice(2, 0, {
      id: crypto.randomUUID(),
      type: 'hymns',
      title: 'Troparia & kontakia',
      hymns: templeTroparia.map((item) => ({ ...item })),
    });
  }
  if (celebrationsBlock?.items.length) blocks.push(celebrationsBlock);
  if (announcements.length) {
    blocks.push({
      id: crypto.randomUUID(),
      type: 'announcements',
      title: 'Parish life',
      body: announcements.map((item) => `${item.title}\n${bulletinExcerpt(item.body)}`).join('\n\n'),
      sourceIds: announcements.map((item) => item.id),
    });
  }
  if (events.length) {
    blocks.push({
      id: crypto.randomUUID(),
      type: 'events',
      title: 'Coming up',
      items: events.slice(0, 6).map((event) => ({
        label: String(event.startsAt || '').slice(0, 10),
        text: [event.title, event.location].filter(Boolean).join(' · '),
      })),
      sourceIds: events.slice(0, 6).map((event) => event.id),
    });
  }
  blocks.push({
    id: crypto.randomUUID(),
    type: 'giving',
    title: 'Give with gratitude',
    body: 'Support the worship, ministries, and charitable life of our parish.',
  });
  return {
    blocks,
    announcementCount: announcements.length,
    eventCount: events.length,
    templeTroparia,
  };
}

function nextSundayDate(from = new Date()) {
  const date = new Date(from);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + ((7 - date.getUTCDay()) % 7));
  return date.toISOString().slice(0, 10);
}

export async function handleParishBulletins(request, env, parishId, subpath = '') {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = d1(env);
  if (!db) return missingProductionStoreResponse();
  const auth = await requireCommunicationsAdmin(request, env, parishId);
  if (auth.error) return auth.error;
  const bulletinId = decodeURIComponent(String(subpath || '').replace(/^\/+|\/+$/g, ''));

  try {
    if (bulletinId === 'liturgical' && request.method === 'GET') {
      const serviceDate = new URL(request.url).searchParams.get('serviceDate');
      const block = await buildSundayLiturgicalBlock({
        serviceDate,
        registration: auth.found.registration,
      });
      return json({ block });
    }
    if (bulletinId === 'celebrations' && request.method === 'GET') {
      const serviceDate = new URL(request.url).searchParams.get('serviceDate');
      return json({ block: await buildBulletinCelebrationsBlock(env, parishId, serviceDate) });
    }
    if (bulletinId === 'hymns' && request.method === 'GET') {
      return json({ troparia: await listParishTempleTroparia(db, parishId) });
    }
    if (bulletinId === 'hymns' && request.method === 'PUT') {
      const createdBy =
        normalizeEmail(auth.found.registration.treasurerEmail || auth.found.registration.priestEmail) ||
        `parish:${parishId}`;
      const troparia = await saveParishTempleTroparia(db, {
        parishId,
        createdBy,
        input: await readBulletinBody(request),
      });
      return json({ ok: true, troparia });
    }
    if (!bulletinId && request.method === 'GET') {
      const requestedServiceDate = new URL(request.url).searchParams.get('serviceDate') || nextSundayDate();
      const [bulletins, suggestions] = await Promise.all([
        listParishBulletins(db, parishId),
        buildBulletinSuggestions(db, env, parishId, auth.found.registration, requestedServiceDate),
      ]);
      return json({ bulletins, suggestions, templeTroparia: suggestions.templeTroparia || [] });
    }
    if (!bulletinId && request.method === 'POST') {
      const createdBy =
        normalizeEmail(auth.found.registration.treasurerEmail || auth.found.registration.priestEmail) ||
        `parish:${parishId}`;
      const bulletin = await createParishBulletin(db, {
        parishId,
        createdBy,
        input: await readBulletinBody(request),
      });
      return json({ ok: true, bulletin }, { status: 201 });
    }
    if (bulletinId && request.method === 'PATCH') {
      const bulletin = await updateParishBulletin(db, {
        parishId,
        bulletinId,
        input: await readBulletinBody(request),
      });
      return bulletin
        ? json({ ok: true, bulletin })
        : json({ error: 'Editable bulletin draft not found.' }, { status: 404 });
    }
    if (bulletinId && request.method === 'DELETE') {
      const archived = await archiveParishBulletin(db, { parishId, bulletinId });
      return archived
        ? json({ ok: true, archivedId: bulletinId })
        : json({ error: 'Editable bulletin draft not found.' }, { status: 404 });
    }
    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    return json({ error: error.message || 'Unable to save the bulletin.' }, { status: error.status || 422 });
  }
}
