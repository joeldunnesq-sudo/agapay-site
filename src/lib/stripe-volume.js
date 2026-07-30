import { d1All, d1Batch, d1First, d1Run } from "./core.js";
import { stripeGetConnectedRequest } from "./stripe-connect.js";
import {
  classifyStripeCharge,
  STRIPE_PAYMENT_CLASSES,
} from "./payment-classification.js";
export { classifyStripeCharge, STRIPE_PAYMENT_CLASSES } from "./payment-classification.js";

function cents(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

export function stripeChargeVolumeRecord(parishId, stripeAccountId, charge = {}) {
  const classification = classifyStripeCharge(charge);
  const grossCents = cents(charge.amount_captured || charge.amount);
  const refundedCents = Math.min(grossCents, cents(charge.amount_refunded));
  return {
    parishId,
    stripeAccountId,
    stripeChargeId: String(charge.id || ""),
    paymentClass: classification.paymentClass,
    classificationSource: classification.source,
    currency: String(charge.currency || "usd").toLowerCase(),
    grossCents,
    refundedCents,
    netCents: Math.max(0, grossCents - refundedCents),
    chargeStatus: String(charge.status || (charge.paid === false ? "failed" : "succeeded")),
    occurredAt: new Date((Number(charge.created) || Math.floor(Date.now() / 1000)) * 1000).toISOString()
  };
}

const UPSERT_VOLUME_SQL = `
  INSERT INTO stripe_payment_volume_records
    (stripe_account_id, stripe_charge_id, parish_id, payment_class, classification_source,
     currency, gross_cents, refunded_cents, net_cents, charge_status, occurred_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(stripe_account_id, stripe_charge_id) DO UPDATE SET
    parish_id = excluded.parish_id,
    payment_class = excluded.payment_class,
    classification_source = excluded.classification_source,
    currency = excluded.currency,
    gross_cents = excluded.gross_cents,
    refunded_cents = excluded.refunded_cents,
    net_cents = excluded.net_cents,
    charge_status = excluded.charge_status,
    occurred_at = excluded.occurred_at,
    updated_at = excluded.updated_at
`;

export async function upsertStripeChargeVolumeRecord(env, parishId, stripeAccountId, charge) {
  if (!parishId || !stripeAccountId || !charge?.id) return null;
  const record = stripeChargeVolumeRecord(parishId, stripeAccountId, charge);
  const now = new Date().toISOString();
  return d1Run(env, UPSERT_VOLUME_SQL,
    record.stripeAccountId, record.stripeChargeId, record.parishId, record.paymentClass,
    record.classificationSource, record.currency, record.grossCents, record.refundedCents,
    record.netCents, record.chargeStatus, record.occurredAt, now);
}

async function upsertChargePage(env, parishId, stripeAccountId, charges) {
  const now = new Date().toISOString();
  const statements = charges
    .filter(charge => charge?.id)
    .map(charge => {
      const record = stripeChargeVolumeRecord(parishId, stripeAccountId, charge);
      return {
        sql: UPSERT_VOLUME_SQL,
        params: [
          record.stripeAccountId, record.stripeChargeId, record.parishId, record.paymentClass,
          record.classificationSource, record.currency, record.grossCents, record.refundedCents,
          record.netCents, record.chargeStatus, record.occurredAt, now
        ]
      };
    });
  if (statements.length) await d1Batch(env, statements);
}

export function startOfCurrentYearIso(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1)).toISOString();
}

export async function refreshStripeVolume(env, parishId, stripeAccountId, { maxPages = 5 } = {}) {
  const periodStart = startOfCurrentYearIso();
  const now = new Date().toISOString();
  const existing = await d1First(
    env,
    `SELECT * FROM stripe_payment_volume_scans WHERE parish_id = ? AND period_start = ?`,
    parishId,
    periodStart
  );
  let cursor = existing?.status === "in_progress" ? existing.starting_after || "" : "";
  let scannedCount = existing?.status === "in_progress" ? Number(existing.scanned_count || 0) : 0;
  const passStartedAt = existing?.status === "in_progress" ? existing.pass_started_at : now;
  let hasMore = false;

  try {
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({
        limit: "100",
        "created[gte]": String(Math.floor(new Date(periodStart).getTime() / 1000))
      });
      params.append("expand[]", "data.payment_intent");
      params.append("expand[]", "data.invoice");
      if (cursor) params.set("starting_after", cursor);
      const result = await stripeGetConnectedRequest(env, `/v1/charges?${params}`, stripeAccountId);
      if (!result.ok) throw new Error(result.body?.error?.message || "Stripe charge scan failed");
      const charges = Array.isArray(result.body?.data) ? result.body.data : [];
      await upsertChargePage(env, parishId, stripeAccountId, charges);
      scannedCount += charges.length;
      cursor = charges.at(-1)?.id || "";
      hasMore = Boolean(result.body?.has_more && cursor);
      if (!hasMore) break;
    }
    const status = hasMore ? "in_progress" : "complete";
    await d1Run(env, `
      INSERT INTO stripe_payment_volume_scans
        (parish_id, stripe_account_id, period_start, status, starting_after, scanned_count,
         pass_started_at, last_completed_at, last_error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      ON CONFLICT(parish_id, period_start) DO UPDATE SET
        stripe_account_id = excluded.stripe_account_id,
        status = excluded.status,
        starting_after = excluded.starting_after,
        scanned_count = excluded.scanned_count,
        pass_started_at = excluded.pass_started_at,
        last_completed_at = COALESCE(excluded.last_completed_at, stripe_payment_volume_scans.last_completed_at),
        last_error = NULL,
        updated_at = excluded.updated_at
    `, parishId, stripeAccountId, periodStart, status, hasMore ? cursor : "", scannedCount,
    passStartedAt, hasMore ? null : now, now);
    return { status, scannedCount, hasMore, periodStart, lastCompletedAt: hasMore ? existing?.last_completed_at || null : now };
  } catch (error) {
    await d1Run(env, `
      INSERT INTO stripe_payment_volume_scans
        (parish_id, stripe_account_id, period_start, status, starting_after, scanned_count,
         pass_started_at, last_error, updated_at)
      VALUES (?, ?, ?, 'failed', ?, ?, ?, ?, ?)
      ON CONFLICT(parish_id, period_start) DO UPDATE SET
        status = 'failed', starting_after = excluded.starting_after, scanned_count = excluded.scanned_count,
        last_error = excluded.last_error, updated_at = excluded.updated_at
    `, parishId, stripeAccountId, periodStart, cursor, scannedCount, passStartedAt, error.message, now);
    throw error;
  }
}

export async function summarizeStoredStripeVolume(env, parishId, periodStart = startOfCurrentYearIso()) {
  const rows = await d1All(env, `
    SELECT payment_class,
           COUNT(*) AS payment_count,
           SUM(gross_cents) AS gross_cents,
           SUM(refunded_cents) AS refunded_cents,
           SUM(net_cents) AS net_cents
      FROM stripe_payment_volume_records
     WHERE parish_id = ? AND occurred_at >= ? AND charge_status = 'succeeded'
     GROUP BY payment_class
  `, parishId, periodStart);
  const scan = await d1First(env,
    `SELECT status, scanned_count, pass_started_at, last_completed_at, last_error, updated_at
       FROM stripe_payment_volume_scans WHERE parish_id = ? AND period_start = ?`,
    parishId, periodStart);
  return summarizeStripeVolumeRows(rows, scan, periodStart);
}

export function summarizeStripeVolumeRows(rows = [], scan = null, periodStart = startOfCurrentYearIso()) {
  const byClass = Object.fromEntries(STRIPE_PAYMENT_CLASSES.map(paymentClass => [
    paymentClass,
    { paymentCount: 0, grossCents: 0, refundedCents: 0, netCents: 0 }
  ]));
  for (const row of rows || []) {
    const bucket = byClass[row.payment_class] || byClass.unclassified;
    bucket.paymentCount += Number(row.payment_count || 0);
    bucket.grossCents += Number(row.gross_cents || 0);
    bucket.refundedCents += Number(row.refunded_cents || 0);
    bucket.netCents += Number(row.net_cents || 0);
  }
  const donation = byClass.qualifying_donation;
  const totalNetCents = Object.values(byClass).reduce((sum, bucket) => sum + bucket.netCents, 0);
  const totalPaymentCount = Object.values(byClass).reduce((sum, bucket) => sum + bucket.paymentCount, 0);
  const donationPercent = totalNetCents ? Math.round((donation.netCents / totalNetCents) * 10_000) / 100 : 0;
  const complete = scan?.status === "complete" || Boolean(scan?.last_completed_at);
  return {
    periodStart,
    currency: "usd",
    totalPaymentCount,
    totalNetCents,
    donationNetCents: donation.netCents,
    nonDonationNetCents: Object.entries(byClass)
      .filter(([paymentClass]) => paymentClass.startsWith("nonqualifying_"))
      .reduce((sum, [, bucket]) => sum + bucket.netCents, 0),
    unclassifiedNetCents: byClass.unclassified.netCents,
    donationPercent,
    thresholdPercent: 80,
    meetsVolumeThreshold: complete && donationPercent >= 80,
    estimateOnly: true,
    scan: {
      status: scan?.status || "not_started",
      complete,
      refreshInProgress: scan?.status === "in_progress",
      scannedCount: Number(scan?.scanned_count || 0),
      lastCompletedAt: scan?.last_completed_at || null,
      updatedAt: scan?.updated_at || null,
      error: scan?.last_error || null
    },
    byClass
  };
}
