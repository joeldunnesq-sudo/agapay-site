import { d1, d1First, d1Run } from '../lib/core.js';
import { sendEmail } from '../lib/email.js';
import {
  loadDonorOfferingByCheckout,
  loadDonorOfferingByPaymentIntent,
  paidOfferingStatus,
  storeDonorOffering,
} from '../handlers/parish-donor-offerings.js';

export async function deliverDonationReceipt(env, offering = {}, send) {
  if (!offering || offering.emailReceiptSentAt || !paidOfferingStatus(offering)) return offering;
  let current = offering;
  if (offering.checkoutSessionId)
    current = (await loadDonorOfferingByCheckout(env, offering.checkoutSessionId)) || offering;
  else if (offering.stripePaymentIntentId)
    current = (await loadDonorOfferingByPaymentIntent(env, offering.stripePaymentIntentId)) || offering;
  if (current.emailReceiptSentAt || !paidOfferingStatus(current)) return current;
  const email = await send(env, current);
  return storeDonorOffering(env, {
    ...current,
    emailReceiptStatus: email.status || 'unknown',
    emailReceiptId: email.id || '',
    emailReceiptDetail: email.detail || '',
    emailReceiptSentAt: email.status === 'sent' ? email.sentAt || new Date().toISOString() : '',
  });
}

// Resend retains keys for 24 hours. Ambiguous delivery is never automatically
// retried beyond 23 hours; its durable row remains available for reconciliation.
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export async function sendDonationReceiptMessage(env, offering, message) {
  if (offering.isDiagnostic || !env.RESEND_API_KEY) return sendEmail(env, message);
  if (!d1(env) || !offering.id) throw new Error('Durable storage is required for donation receipts.');
  const id = `donation:${offering.parishId}:${offering.id}`;
  await d1Run(
    env,
    `INSERT INTO donation_receipt_deliveries (id, parish_id, message)
    VALUES (?1, ?2, ?3) ON CONFLICT(id) DO NOTHING`,
    id,
    offering.parishId,
    JSON.stringify(message)
  );
  const now = Date.now();
  const token = crypto.randomUUID();
  const result = await d1Run(
    env,
    `UPDATE donation_receipt_deliveries
    SET status='sending', first_attempt_at=COALESCE(first_attempt_at, ?2), lease_until=?3, lease_token=?4
    WHERE id=?1 AND status IN ('pending','sending','failed') AND lease_until<=?2
      AND (first_attempt_at IS NULL OR first_attempt_at>?5)`,
    id,
    now,
    now + 60000,
    token,
    now - RETRY_WINDOW_MS
  );
  const row = await d1First(env, 'SELECT * FROM donation_receipt_deliveries WHERE id=?1', id);
  if (row.status === 'sent') return { status: 'sent', id: row.provider_id, sentAt: row.sent_at };
  if (!result?.meta?.changes) {
    if (row.first_attempt_at && row.first_attempt_at <= now - RETRY_WINDOW_MS) {
      await d1Run(
        env,
        "UPDATE donation_receipt_deliveries SET status='needs_review' WHERE id=?1 AND status!='sent'",
        id
      );
      throw new Error('Donation receipt delivery requires review; automatic retry window expired.');
    }
    throw new Error('Donation receipt delivery is already in progress; retry later.');
  }
  // Freeze the complete provider payload, including timestamps and fee details.
  const delivery = await sendEmail(env, JSON.parse(row.message), { idempotencyKey: id });
  const sentAt = delivery.status === 'sent' ? new Date().toISOString() : '';
  await d1Run(
    env,
    `UPDATE donation_receipt_deliveries SET status=?3, provider_id=?4,
    sent_at=?5, detail=?6, lease_until=0 WHERE id=?1 AND lease_token=?2`,
    id,
    token,
    delivery.status === 'sent' ? 'sent' : 'failed',
    delivery.id || '',
    sentAt,
    delivery.detail || ''
  );
  if (delivery.status !== 'sent')
    throw new Error('Donation receipt delivery failed; retry with the same payment identity.');
  return { ...delivery, sentAt };
}
