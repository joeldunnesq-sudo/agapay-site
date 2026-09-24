import { d1All, d1Run } from '../lib/core.js';
import { invoiceDonationMetadata, invoiceSubscriptionId } from '../payments/donation-events.js';
import { stripeObjectId } from '../lib/stripe-connect.js';
import { subscriptionTierFromStripePriceId } from '../lib/subscriptions.js';
import { ingestAccountingSourceEvent, processAccountingSourceEvent } from './integrations/service.js';

const actor = { id: 'agapay_service_billing', type: 'system', capabilities: ['accounting.integrations.post'] };

// Only a verified platform subscription may supply these facts. Never infer a
// historical charge from today's catalog price or the parish's current tier.
export function serviceInvoiceFacts(env, invoice, registration) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  const customerId = stripeObjectId(invoice.customer);
  if (
    !registration?.parishId ||
    !subscriptionId ||
    subscriptionId !== registration.stripeSubscriptionId ||
    !customerId ||
    customerId !== registration.stripeCustomerId ||
    invoiceDonationMetadata(invoice).donor_email ||
    invoice.status !== 'paid'
  )
    return null;
  if (
    !invoice.id ||
    !Number.isSafeInteger(invoice.amount_paid) ||
    invoice.amount_paid < 0 ||
    !Number.isSafeInteger(invoice.status_transitions?.paid_at) ||
    !/^[a-z]{3}$/i.test(invoice.currency || '')
  )
    throw new Error('Paid subscription invoice is missing confirmed billing facts.');
  const prices = [
    ...new Set(
      (invoice.lines?.data || [])
        .map((line) => stripeObjectId(line.pricing?.price_details?.price) || stripeObjectId(line.price))
        .filter(Boolean)
    ),
  ];
  const labels = [
    ...new Set(prices.map((price) => subscriptionTierFromStripePriceId(env, price)?.label).filter(Boolean)),
  ];
  return {
    invoiceId: invoice.id,
    parishId: registration.parishId,
    subscriptionId,
    customerId,
    paidAt: new Date(invoice.status_transitions.paid_at * 1000).toISOString(),
    currency: invoice.currency.toUpperCase(),
    amountCents: invoice.amount_paid,
    planLabel: labels.join(' / ') || 'Subscription as invoiced',
    priceIds: prices,
  };
}

export async function recordServiceInvoice(env, invoice, registration) {
  const facts = serviceInvoiceFacts(env, invoice, registration);
  if (!facts) return null;
  if (!env.AGAPAY_DB) throw new Error('Durable subscription accounting storage is unavailable.');
  await d1Run(
    env,
    `INSERT OR IGNORE INTO agapay_service_invoices
    (invoice_id,parish_id,subscription_id,customer_id,paid_at,currency,amount_cents,plan_label,price_ids_json)
    VALUES(?,?,?,?,?,?,?,?,?)`,
    facts.invoiceId,
    facts.parishId,
    facts.subscriptionId,
    facts.customerId,
    facts.paidAt,
    facts.currency,
    facts.amountCents,
    facts.planLabel,
    JSON.stringify(facts.priceIds)
  );
  const stored = await env.AGAPAY_DB.prepare('SELECT * FROM agapay_service_invoices WHERE invoice_id=?')
    .bind(facts.invoiceId)
    .first();
  if (
    stored.parish_id !== facts.parishId ||
    stored.subscription_id !== facts.subscriptionId ||
    stored.customer_id !== facts.customerId ||
    stored.amount_cents !== facts.amountCents ||
    stored.currency !== facts.currency ||
    stored.paid_at !== facts.paidAt
  )
    throw new Error('A repeated subscription invoice has conflicting billing facts.');
  return facts;
}

export async function postServiceInvoices(env, db, parishId) {
  const rows = await d1All(
    env,
    `SELECT * FROM agapay_service_invoices WHERE parish_id=?
    AND accounting_status NOT IN ('posted','no_charge') ORDER BY CASE WHEN accounting_status='pending' THEN 0 ELSE 1 END,paid_at,invoice_id LIMIT 100`,
    parishId
  );
  for (const row of rows) {
    if (!row.amount_cents) {
      await d1Run(
        env,
        "UPDATE agapay_service_invoices SET accounting_status='no_charge' WHERE invoice_id=?",
        row.invoice_id
      );
      continue;
    }
    const source = await ingestAccountingSourceEvent(db, {
      actor,
      entitlementTier: 'parish',
      event: {
        sourceSystem: 'agapay_billing',
        sourceType: 'agapay_subscription_paid',
        sourceEventId: `subscription:${row.invoice_id}`,
        sourceObjectId: row.invoice_id,
        occurredAt: row.paid_at,
        currency: row.currency,
        feeAmount: row.amount_cents,
        donationType: row.plan_label,
        designatedFundId: 'fund_general',
      },
    });
    const result = await processAccountingSourceEvent(db, {
      actor,
      entitlementTier: 'parish',
      sourceEventId: source.id,
    });
    await d1Run(
      env,
      'UPDATE agapay_service_invoices SET accounting_status=?,accounting_message=? WHERE invoice_id=?',
      result.status,
      result.exceptionMessage || null,
      row.invoice_id
    );
  }
}

export async function readServiceCosts(env, parishId, year) {
  const rows = await d1All(
    env,
    `SELECT invoice_id,paid_at,currency,amount_cents,plan_label,accounting_status
    FROM agapay_service_invoices WHERE parish_id=? AND paid_at>=? AND paid_at<? ORDER BY paid_at`,
    parishId,
    `${year}-01-01`,
    `${Number(year) + 1}-01-01`
  );
  return {
    invoices: rows,
    totalCents: rows.filter((row) => row.currency === 'USD').reduce((sum, row) => sum + row.amount_cents, 0),
    excludedCurrencyCount: rows.filter((row) => row.currency !== 'USD').length,
  };
}
