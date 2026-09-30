import { d1All, d1First, d1Run, json, rateLimit, unauthorized } from '../lib/core.js';
import { requireAdmin } from './admin.js';
import { loadAllRegistrations } from '../lib/registrations.js';
import { defaultMilestonePreferences, localOccasionClock, parishAttention, parishOccasions, relationshipSnapshot, retentionFromSnapshots } from '../lib/parish-relationships.js';
import { buildMilestoneMessage, milestonePreferences } from '../operations/parish-milestones.js';

export async function handleAdminRelationships(request, env) {
  const limited = await rateLimit(request, env, 'admin-relationships', { limit: 100, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!env.AGAPAY_DB) return json({ error: 'Relationship reporting requires the production database.' }, { status: 503 });
  const url = new URL(request.url);
  const now = new Date();
  try {
    const registrations = await loadAllRegistrations(env, { hardLimit: 25000 });
    if (registrations.length >= 25000) return json({ error: 'Reporting capacity reached. No partial metrics are shown.' }, { status: 503 });
    if (request.method === 'POST') {
      const body = await request.json();
      const r = registrations.find(item => item.reference === body.reference);
      if (!r) return json({ error: 'Parish not found.' }, { status: 404 });
      const prefs = { ...defaultMilestonePreferences(r), ...body.preferences };
      const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      if ((prefs.anniversary && !validEmail(prefs.recipient)) || (prefs.feast && !validEmail(prefs.feastRecipient))) return json({ error: 'Enter a valid recipient for each enabled message.' }, { status: 400 });
      try { localOccasionClock(now, prefs.timeZone); } catch { return json({ error: 'Choose a valid IANA time zone, such as America/Chicago.' }, { status: 400 }); }
      if (prefs.feast && !parishOccasions(r, now.toISOString().slice(0, 10)).some(o => o.kind === 'feast')) return json({ error: 'Set a patronal feast and observed date in the parish settings before enabling greetings.' }, { status: 400 });
      const saved = { anniversary: prefs.anniversary === true, feast: prefs.feast === true, recipient: String(prefs.recipient || '').trim(), feastRecipient: String(prefs.feastRecipient || '').trim(), timeZone: prefs.timeZone };
      await d1Run(env, 'INSERT INTO parish_milestone_preferences(reference, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(reference) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at', r.reference, JSON.stringify(saved), now.toISOString());
      return json({ preferences: saved });
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
    if (url.searchParams.has('preview')) {
      const r = registrations.find(item => item.reference === url.searchParams.get('reference'));
      if (!r) return json({ error: 'Parish not found.' }, { status: 404 });
      const kind = url.searchParams.get('preview');
      if (!['anniversary', 'feast'].includes(kind)) return json({ error: 'Unknown message type.' }, { status: 400 });
      const prefs = await milestonePreferences(env, r);
      const occasion = parishOccasions(r, localOccasionClock(now, prefs.timeZone).date).find(o => o.kind === kind);
      if (!occasion) return json({ error: 'Add the patronal feast and observed date in parish settings first.' }, { status: 400 });
      return json({ message: await buildMilestoneMessage(env, r, occasion, now), occasion, note: 'Preview only. Annual figures use the last twelve completed months through today; the scheduled email recalculates on its send date.' });
    }
    const days = [30, 90, 365].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
    const beforeDay = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
    const baseline = await d1First(env, 'SELECT day, data FROM parish_relationship_snapshots WHERE day = ?', beforeDay);
    const first = await d1First(env, 'SELECT MIN(day) AS day FROM parish_relationship_snapshots');
    const history = await d1All(env, 'SELECT reference, kind, occasion_date, status, updated_at, detail FROM parish_milestone_deliveries ORDER BY occasion_date DESC LIMIT 50');
    const preferences = new Map((await d1All(env, 'SELECT reference, data FROM parish_milestone_preferences')).map(row => [row.reference, JSON.parse(row.data)]));
    const parishes = registrations.map(r => {
      const prefs = { ...defaultMilestonePreferences(r), ...preferences.get(r.reference) };
      const occasions = parishOccasions(r, localOccasionClock(now, prefs.timeZone).date);
      return { reference: r.reference, parishId: r.parishId, name: r.parishName || 'Unnamed parish', preferences: prefs, attention: parishAttention(r), occasions,
        eligible: r.status === 'verified' && !['cancelled', 'canceled', 'unpaid'].includes(r.subscriptionStatus),
        hasFeast: occasions.some(o => o.kind === 'feast'), connected: Boolean(r.stripeAccountId), verified: r.status === 'verified' };
    });
    const firstGift = await d1First(env, `SELECT COUNT(DISTINCT parish_id) AS count FROM donor_offerings WHERE payment_status = 'paid' AND parish_id IN (SELECT parish_id FROM registrations)`);
    return json({ days, baselineDay: baseline?.day || null, trackingSince: first?.day || null,
      retention: baseline ? retentionFromSnapshots(JSON.parse(baseline.data), relationshipSnapshot(registrations)) : null,
      parishes, history, emailConfigured: Boolean(env.RESEND_API_KEY), onboarding: { registered: parishes.length, verified: parishes.filter(p => p.verified).length, connected: parishes.filter(p => p.connected).length, firstGift: Number(firstGift?.count || 0) } });
  } catch (error) {
    console.error('admin_relationships_failed', error.message);
    return json({ error: 'Parish relationships could not load. Please retry after the deployment finishes.' }, { status: 503 });
  }
}
