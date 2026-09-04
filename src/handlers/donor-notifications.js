import { d1, d1All, d1Run, generateSecret, json, normalizeEmail, unauthorized } from '../lib/core.js';
import { requireDonor } from './parish.js';

// ── Donor notification helpers ───────────────────────────────────────────────

function newNotifId() {
  return generateSecret(16);
}

// GET /api/donor/notifications
// Returns active (undismissed) pledge nudge notifications for the signed-in donor.
export async function handleDonorNotifications(request, env) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!d1(env)) return json({ notifications: [] });

  const notifications = await d1All(
    env,
    `SELECT id, parish_id, type, fiscal_year, pledge_cents, given_cents, message, sent_at
     FROM donor_notifications
     WHERE donor_email = ? AND dismissed_at IS NULL
     ORDER BY sent_at DESC
     LIMIT 10`,
    normalizeEmail(donor.email)
  );

  return json({
    notifications: (notifications || []).map((n) => ({
      id: n.id,
      parishId: n.parish_id,
      type: n.type,
      fiscalYear: n.fiscal_year,
      pledgeCents: n.pledge_cents,
      givenCents: n.given_cents,
      message: n.message || '',
      sentAt: n.sent_at,
    })),
  });
}

// POST /api/donor/notifications/:id/dismiss
export async function handleDonorNotificationDismiss(request, env, notifId) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!d1(env)) return json({ ok: true });

  await d1Run(
    env,
    `UPDATE donor_notifications
     SET dismissed_at = datetime('now')
     WHERE id = ? AND donor_email = ?`,
    notifId,
    normalizeEmail(donor.email)
  );

  return json({ ok: true });
}
