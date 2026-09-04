import {
  d1,
  d1All,
  d1SetSetting,
  generateSecret,
  hasProductionStore,
  json,
  listKvKeys,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
} from '../lib/core.js';
import { monthLabel } from '../lib/format.js';
import { listParishSupportTickets, updateParishSupportTicket } from '../lib/parish-support-tickets.js';
import { listLearnBillingRecords } from '../learn/billing.js';
import {
  createCuratedLearnCommunityResource,
  listLearnCommunityResources,
  moderateLearnCommunityResource,
  updateCuratedLearnCommunityResource,
} from '../learn/community-store.js';
import { listLearnFeedback, updateLearnFeedbackStatus } from '../learn/feedback-store.js';
import { requireAdmin, requireAdminContext } from './parish.js';

const LEARN_SCHOLARSHIP_KV_PREFIX = '__agapay_learn_scholarship:';

function learnPlanMonthlyCents(plan = 'family') {
  return String(plan || '')
    .toLowerCase()
    .includes('founding')
    ? Math.round(4900 / 12)
    : Math.round(5900 / 12);
}

function learnSubscriptionStatus(value) {
  const status = String(value || 'active')
    .trim()
    .toLowerCase();
  if (['active', 'trialing', 'past_due', 'cancelled', 'canceled', 'free_forever'].includes(status)) {
    return status === 'canceled' ? 'cancelled' : status;
  }
  return 'active';
}

function learnScholarshipKey(id) {
  return `${LEARN_SCHOLARSHIP_KV_PREFIX}${id}`;
}

function learnScholarshipCode(prefix = 'AGAPAYLEARN') {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `${
    String(prefix || 'AGAPAYLEARN')
      .replace(/[^A-Z0-9]+/gi, '')
      .toUpperCase()
      .slice(0, 18) || 'AGAPAYLEARN'
  }-${suffix}`;
}

async function saveLearnScholarship(env, record) {
  const raw = JSON.stringify(record);
  if (env.AGAPAY_REGISTRATIONS) await env.AGAPAY_REGISTRATIONS.put(learnScholarshipKey(record.id), raw);
  if (d1(env)) {
    try {
      await d1SetSetting(env, learnScholarshipKey(record.id), raw);
    } catch {}
  }
}

async function listLearnScholarships(env) {
  const byId = new Map();
  if (env.AGAPAY_REGISTRATIONS) {
    const keys = await listKvKeys(env, { prefix: LEARN_SCHOLARSHIP_KV_PREFIX, limit: 1000 });
    for (const key of keys) {
      const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
      if (!raw) continue;
      try {
        const record = JSON.parse(raw);
        if (record?.id) byId.set(record.id, record);
      } catch {}
    }
  }
  if (d1(env)) {
    try {
      const rows = await d1All(
        env,
        'SELECT key, value FROM app_settings WHERE key LIKE ?1 ORDER BY updated_at DESC LIMIT 1000',
        `${LEARN_SCHOLARSHIP_KV_PREFIX}%`
      );
      for (const row of rows) {
        try {
          const record = JSON.parse(row.value || '');
          if (record?.id) byId.set(record.id, record);
        } catch {}
      }
    } catch {}
  }
  return [...byId.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function learnBillingMetrics(records = [], now = new Date()) {
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: monthLabel(index),
    newSubscriptions: 0,
    cancellations: 0,
    active: 0,
  }));
  const counts = { active: 0, trialing: 0, pastDue: 0, cancelled: 0, freeForever: 0 };
  let monthlyRecurringCents = 0;

  for (const record of records) {
    const status =
      record.cancelAtPeriodEnd || record.cancelledAt || record.canceledAt
        ? 'cancelled'
        : learnSubscriptionStatus(record.status);
    if (status === 'active') counts.active += 1;
    if (status === 'trialing') counts.trialing += 1;
    if (status === 'past_due') counts.pastDue += 1;
    if (status === 'free_forever') counts.freeForever += 1;
    if (status === 'cancelled') counts.cancelled += 1;
    if (!['cancelled', 'free_forever'].includes(status)) {
      monthlyRecurringCents += Math.max(
        0,
        Number(record.monthlyEquivalentCents || record.monthlyCents || learnPlanMonthlyCents(record.plan))
      );
    }

    const created = record.createdAt ? new Date(record.createdAt) : null;
    if (created && !Number.isNaN(created.getTime()) && created.getUTCFullYear() === now.getUTCFullYear()) {
      monthly[created.getUTCMonth()].newSubscriptions += 1;
    }
    const cancelledAt = record.cancelledAt || record.canceledAt || (status === 'cancelled' ? record.updatedAt : '');
    const cancelledDate = cancelledAt ? new Date(cancelledAt) : null;
    if (
      cancelledDate &&
      !Number.isNaN(cancelledDate.getTime()) &&
      cancelledDate.getUTCFullYear() === now.getUTCFullYear()
    ) {
      monthly[cancelledDate.getUTCMonth()].cancellations += 1;
    }
  }

  let running = 0;
  for (const month of monthly) {
    running += month.newSubscriptions - month.cancellations;
    month.active = Math.max(0, running);
  }

  return {
    year: now.getUTCFullYear(),
    generatedAt: now.toISOString(),
    totalRecords: records.length,
    monthlyRecurringCents,
    counts,
    monthly,
    recent: records
      .slice()
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
      .slice(0, 12)
      .map((record) => ({
        email: record.email || '',
        plan: record.plan || 'family',
        status:
          record.cancelAtPeriodEnd || record.cancelledAt || record.canceledAt
            ? 'cancelled'
            : learnSubscriptionStatus(record.status),
        createdAt: record.createdAt || '',
        updatedAt: record.updatedAt || '',
        stripeSubscriptionId: record.stripeSubscriptionId || '',
      })),
  };
}

export async function handleAdminLearnSummary(request, env) {
  const limited = await rateLimit(request, env, 'admin-auth', { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!(await requireAdmin(request, env))) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const records = await listLearnBillingRecords(env);
  const scholarships = await listLearnScholarships(env);
  const communityResources = await listLearnCommunityResources(env, { includeAll: true, includeSeeded: true });
  const feedback = await listLearnFeedback(env, { limit: 200 });
  return json({
    ok: true,
    learn: {
      subscriptions: learnBillingMetrics(records),
      scholarships,
      communityModeration: {
        counts: communityResources.reduce(
          (counts, resource) => {
            counts[resource.status] = (counts[resource.status] || 0) + 1;
            if ((resource.flags || []).length) counts.flagged += 1;
            return counts;
          },
          { pending: 0, approved: 0, hidden: 0, removed: 0, flagged: 0 }
        ),
        resources: communityResources.slice(0, 100),
      },
      feedback: {
        counts: feedback.reduce(
          (counts, item) => {
            const status = item.status || 'new';
            counts[status] = (counts[status] || 0) + 1;
            counts.total += 1;
            return counts;
          },
          { total: 0, new: 0, 'seen-considered': 0, archived: 0 }
        ),
        suggestions: feedback.slice(0, 100),
      },
      stripeConfigured: Boolean(env.STRIPE_SECRET_KEY),
      promotionCodesEnabled: true,
    },
  });
}

export async function handleAdminLearnFeedback(request, env, feedbackId = '') {
  if (request.method !== 'PATCH') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-learn-feedback', { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object')
    return json({ ok: false, error: 'Suggestion update was invalid.' }, { status: 400 });
  const result = await updateLearnFeedbackStatus(env, request, adminContext, feedbackId, body);
  return json(result, { status: result.ok ? 200 : result.status || 500 });
}

export async function handleAdminParishSupportTickets(request, env, ticketId = '') {
  const limited = await rateLimit(request, env, 'admin-parish-support', { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (request.method === 'GET') {
    const tickets = await listParishSupportTickets(env, { limit: 200 });
    return json({
      ok: true,
      tickets,
      counts: tickets.reduce(
        (counts, ticket) => {
          const status = ticket.status || 'new';
          counts[status] = (counts[status] || 0) + 1;
          counts.total += 1;
          return counts;
        },
        { total: 0, new: 0, in_progress: 0, resolved: 0, closed: 0 }
      ),
    });
  }
  if (request.method !== 'PATCH') return json({ error: 'Method not allowed' }, { status: 405 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'Ticket update was invalid.' }, { status: 400 });
  const result = await updateParishSupportTicket(env, adminContext, ticketId, body);
  return json(result, { status: result.ok ? 200 : result.status || 500 });
}

export async function handleAdminLearnCommunity(request, env, resourceId = '') {
  if (!['POST', 'PATCH'].includes(request.method)) return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-learn-community', { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object')
    return json({ ok: false, error: 'Moderation update was invalid.' }, { status: 400 });
  if (request.method === 'POST') {
    const result = await createCuratedLearnCommunityResource(env, adminContext, body);
    return json(result, { status: result.ok ? 201 : result.status || 500 });
  }
  if (body.action === 'update') {
    const result = await updateCuratedLearnCommunityResource(env, adminContext, resourceId, body);
    return json(result, { status: result.ok ? 200 : result.status || 500 });
  }
  const result = await moderateLearnCommunityResource(env, adminContext, resourceId, body);
  return json(result, { status: result.ok ? 200 : result.status || 500 });
}

export async function handleAdminLearnScholarship(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'admin-learn-scholarship', { limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  const adminContext = await requireAdminContext(request, env);
  if (!adminContext) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const body = await request.json().catch(() => ({}));
  const percentOff = Math.min(100, Math.max(1, Number(body.percentOff || 100)));
  const maxRedemptions = Math.max(1, Number(body.maxRedemptions || 1));
  const code = String(body.code || learnScholarshipCode(body.prefix))
    .trim()
    .toUpperCase();
  const label = String(body.label || 'AGAPAY Learn scholarship').trim();
  const createdAt = new Date().toISOString();
  const record = {
    id: generateSecret('learn_scholarship'),
    product: 'learn',
    code,
    label,
    percentOff,
    maxRedemptions,
    redeemedCount: 0,
    status: 'active',
    stripeConfigured: Boolean(env.STRIPE_SECRET_KEY),
    stripeCouponId: '',
    stripePromotionCodeId: '',
    createdAt,
    createdBy: adminContext.actor || 'Admin',
  };

  if (env.STRIPE_SECRET_KEY) {
    const couponParams = new URLSearchParams();
    couponParams.set('percent_off', String(percentOff));
    couponParams.set('duration', 'forever');
    couponParams.set('name', label);
    couponParams.set('metadata[product]', 'learn');
    couponParams.set('metadata[source]', 'agapay_admin');
    const couponResponse = await fetch('https://api.stripe.com/v1/coupons', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: couponParams,
    });
    const coupon = await couponResponse.json().catch(() => ({}));
    if (!couponResponse.ok || !coupon.id) {
      return json(
        { ok: false, error: coupon.error?.message || 'Stripe could not create the scholarship coupon.' },
        { status: couponResponse.status || 502 }
      );
    }
    const promoParams = new URLSearchParams();
    promoParams.set('promotion[type]', 'coupon');
    promoParams.set('promotion[coupon]', coupon.id);
    promoParams.set('code', code);
    promoParams.set('max_redemptions', String(maxRedemptions));
    promoParams.set('active', 'true');
    promoParams.set('metadata[product]', 'learn');
    promoParams.set('metadata[source]', 'agapay_admin');
    const promoResponse = await fetch('https://api.stripe.com/v1/promotion_codes', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: promoParams,
    });
    const promotion = await promoResponse.json().catch(() => ({}));
    if (!promoResponse.ok || !promotion.id) {
      return json(
        { ok: false, error: promotion.error?.message || 'Stripe could not create the scholarship promotion code.' },
        { status: promoResponse.status || 502 }
      );
    }
    record.stripeCouponId = coupon.id;
    record.stripePromotionCodeId = promotion.id;
  }

  await saveLearnScholarship(env, record);
  return json({ ok: true, scholarship: record });
}
