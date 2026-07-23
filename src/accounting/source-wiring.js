import {
  createD1DatabaseFacade,
  ingestAccountingSourceEvent,
  ingestCommerceSourceEvent,
  loadAccountingDatabaseForEntity,
  loadAccountingDatabaseProviderRecord,
  loadAccountingEntityByParish,
  processAccountingSourceEvent,
  processCommerceSourceEvent,
  resolveCloudflareD1Adapter
} from "./index.js";
import { d1All, d1First } from "../lib/core.js";

const actor = (capability) => ({ id: "agapay_operational_sync", type: "system", capabilities: [capability] });
const text = (value) => String(value || "").trim();
const cents = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;

async function digest(value) {
  const bytes = new TextEncoder().encode(String(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

export async function resolveOperationalAccountingDatabase(env, parishId) {
  if (!parishId) return null;
  let entity;
  let registry;
  try {
    entity = await loadAccountingEntityByParish(env, parishId);
    registry = entity && await loadAccountingDatabaseForEntity(env, entity.id, "production");
  } catch (error) {
    if (/no such table|accounting.*not configured|central agapay database is required/i.test(String(error?.message || ""))) return null;
    throw error;
  }
  if (!entity || entity.entityStatus !== "ready"
    || registry?.provisioningStatus !== "ready" || registry?.healthStatus !== "healthy") return null;
  const provider = await loadAccountingDatabaseProviderRecord(env, entity.id, "production");
  if (!provider?.databaseIdentifier) return null;
  const adapter = await resolveCloudflareD1Adapter(env, provider.databaseIdentifier);
  const physical = await adapter.findByName(provider.databaseIdentifier);
  return physical ? createD1DatabaseFacade(adapter, physical.providerId) : null;
}

async function accountingFund(db, { sourceType, sourceId, name, restricted = false }) {
  if (!sourceId && !name) return "fund_general";
  const identity = `${sourceType}:${sourceId || name.toLowerCase()}`;
  const suffix = await digest(identity);
  const id = `fund_operational_${suffix}`;
  const code = `${sourceType === "campaign" ? "CAM" : "GIV"}-${suffix.slice(0, 8).toUpperCase()}`;
  const displayName = text(name) || (sourceType === "campaign" ? "Giving Campaign" : "Giving Fund");
  await db.prepare(`INSERT INTO accounting_funds
    (id,code,name,description,restriction_type,purpose,is_default,is_active,is_system)
    VALUES(?,?,?,?,?,?,0,1,0)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,
      restriction_type=excluded.restriction_type,purpose=excluded.purpose,is_active=1,
      archived_at=NULL,version=accounting_funds.version+1,updated_at=datetime('now')`)
    .bind(id, code, displayName, `Synced from AGAPAY ${sourceType}`, restricted ? "donor_restricted_temporary" : "unrestricted", displayName).run();
  return id;
}

export async function wireGivingOfferingToAccounting(env, offering = {}) {
  const parishId = text(offering.parishId);
  const db = await resolveOperationalAccountingDatabase(env, parishId);
  if (!db || !parishId) return null;
  const campaignId = text(offering.campaignId);
  const fundSourceId = campaignId || text(offering.fundId) || text(offering.fund) || text(offering.giftType);
  const fundName = campaignId ? text(offering.campaign) : (text(offering.fund) || text(offering.giftType) || "General");
  const fundId = await accountingFund(db, {
    sourceType: campaignId ? "campaign" : "fund",
    sourceId: fundSourceId,
    name: fundName,
    restricted: Boolean(offering.donorRestricted)
  });
  const donationId = text(offering.id) || text(offering.reference)
    || text(offering.stripePaymentIntentId) || text(offering.checkoutSessionId);
  if (!donationId) return null;
  const paymentIntentId = text(offering.stripePaymentIntentId);
  const occurredAt = text(offering.completedAt) || text(offering.createdAt) || new Date().toISOString();
  const grossAmount = cents(offering.giftAmountCents ?? offering.amountCents);
  const event = await ingestAccountingSourceEvent(db, {
    actor: actor("accounting.integrations.post"),
    entitlementTier: "parish",
    event: {
      sourceSystem: "agapay_give",
      sourceType: "donation_succeeded",
      sourceEventId: `give:${donationId}:succeeded`,
      sourceObjectId: donationId,
      occurredAt,
      currency: text(offering.currency) || "USD",
      grossAmount,
      netAmount: cents(offering.parishNetCents) || grossAmount,
      donationId,
      paymentIntentId,
      donationType: text(offering.giftType) || "offering",
      campaignId,
      designatedFundId: fundId,
      donorRestricted: Boolean(offering.donorRestricted)
    }
  });
  const processed = await processAccountingSourceEvent(db, {
    actor: actor("accounting.integrations.post"),
    entitlementTier: "parish",
    sourceEventId: event.id
  });
  const fee = cents(offering.stripeFeeCents);
  if (fee) {
    const feeEvent = await ingestAccountingSourceEvent(db, {
      actor: actor("accounting.integrations.post"),
      entitlementTier: "parish",
      event: {
        sourceSystem: "stripe", sourceType: "stripe_fee_assessed",
        sourceEventId: `give:${donationId}:stripe_fee`, sourceObjectId: donationId,
        occurredAt, currency: text(offering.currency) || "USD", feeAmount: fee,
        donationId, paymentIntentId, balanceTransactionId: text(offering.stripeBalanceTransactionId),
        designatedFundId: fundId
      }
    });
    await processAccountingSourceEvent(db, {
      actor: actor("accounting.integrations.post"), entitlementTier: "parish", sourceEventId: feeEvent.id
    });
  }
  return processed;
}

export async function wireGivingRefundsToAccounting(env, offering = {}, charge = {}) {
  const db = await resolveOperationalAccountingDatabase(env, text(offering.parishId));
  const donationId = text(offering.id) || text(offering.reference)
    || text(offering.stripePaymentIntentId) || text(offering.checkoutSessionId);
  if (!db || !donationId) return [];
  const campaignId = text(offering.campaignId);
  const fundId = await accountingFund(db, {
    sourceType: campaignId ? "campaign" : "fund",
    sourceId: campaignId || text(offering.fundId) || text(offering.fund) || text(offering.giftType),
    name: campaignId ? text(offering.campaign) : (text(offering.fund) || text(offering.giftType) || "General"),
    restricted: Boolean(offering.donorRestricted)
  });
  const refunds = Array.isArray(charge.refunds?.data) ? charge.refunds.data : [];
  const results = [];
  for (const refund of refunds) {
    const refundId = text(refund.id);
    if (!refundId) continue;
    const source = await ingestAccountingSourceEvent(db, {
      actor: actor("accounting.integrations.post"), entitlementTier: "parish",
      event: {
        sourceSystem: "stripe",
        sourceType: cents(refund.amount) >= cents(charge.amount) ? "donation_refunded" : "donation_partially_refunded",
        sourceEventId: `give:${donationId}:refund:${refundId}`, sourceObjectId: donationId,
        originalSourceEventId: `give:${donationId}:succeeded`,
        occurredAt: refund.created ? new Date(refund.created * 1000).toISOString() : new Date().toISOString(),
        currency: text(refund.currency || charge.currency) || "USD", refundAmount: cents(refund.amount),
        donationId, paymentIntentId: text(offering.stripePaymentIntentId),
        chargeId: text(charge.id), refundId, campaignId, designatedFundId: fundId,
        donorRestricted: Boolean(offering.donorRestricted)
      }
    });
    results.push(await processAccountingSourceEvent(db, {
      actor: actor("accounting.integrations.post"), entitlementTier: "parish", sourceEventId: source.id
    }));
  }
  return results;
}

export async function synchronizeGivingCatalogWithAccounting(env, parishId, registration = {}) {
  const db = await resolveOperationalAccountingDatabase(env, parishId);
  if (!db) return { synchronized: 0 };
  const records = [
    ...(Array.isArray(registration.funds) ? registration.funds : []).map((item) => ({ ...item, sourceType: "fund" })),
    ...(Array.isArray(registration.campaigns) ? registration.campaigns : []).map((item) => ({ ...item, sourceType: "campaign" })),
    ...(Array.isArray(registration.feastCampaigns) ? registration.feastCampaigns : []).map((item) => ({ ...item, sourceType: "campaign" }))
  ];
  await db.prepare(`UPDATE accounting_funds SET is_active=0,archived_at=COALESCE(archived_at,datetime('now')),
    version=version+1,updated_at=datetime('now')
    WHERE id LIKE 'fund_operational_%' AND description LIKE 'Synced from AGAPAY %'`).run();
  for (const item of records) {
    await accountingFund(db, {
      sourceType: item.sourceType,
      sourceId: text(item.id) || text(item.code) || text(item.slug) || text(item.name) || text(item.title),
      name: text(item.name) || text(item.title) || text(item.label),
      restricted: Boolean(item.donorRestricted || item.restricted)
    });
  }
  return { synchronized: records.length };
}

export async function wireCommerceOrderToAccounting(env, orderId) {
  if (!env?.AGAPAY_DB?.prepare || !orderId) return null;
  const order = await d1First(env, "SELECT * FROM commerce_orders WHERE id=? AND commerce_module='bookstore'", orderId);
  if (!order || order.payment_status !== "paid") return null;
  const db = await resolveOperationalAccountingDatabase(env, order.parish_id);
  if (!db) return null;
  let items = await d1All(env, "SELECT * FROM commerce_order_items WHERE order_id=? ORDER BY created_at,id", order.id);
  if (!items.length) items = [{
    product_id: order.product_id || order.id, sku: order.product_sku, item_name: order.item_description,
    item_category: order.item_category, quantity: order.quantity, subtotal_cents: order.subtotal_cents,
    tax_cents: order.tax_cents, cost_basis_cents: null
  }];
  for (const item of items) {
    const operationalId = text(item.product_id) || text(item.variant_id) || text(item.id);
    await db.prepare(`INSERT INTO accounting_commerce_items
      (id,operational_item_id,sku,name,category_id,default_revenue_account_id,default_fund_id,
       is_taxable,is_inventory_tracked,current_unit_cost,quantity_on_hand)
      VALUES(?,?,?,?,?,'acct_4050','fund_general',?,0,?,0)
      ON CONFLICT(operational_item_id) DO UPDATE SET sku=excluded.sku,name=excluded.name,
       category_id=excluded.category_id,is_taxable=excluded.is_taxable,
       current_unit_cost=COALESCE(excluded.current_unit_cost,accounting_commerce_items.current_unit_cost),
       is_active=1,version=accounting_commerce_items.version+1,updated_at=datetime('now')`)
      .bind(`commerceitem_${await digest(operationalId)}`, operationalId, text(item.sku) || null,
        text(item.item_name) || "Bookstore item", text(item.item_category) || null,
        cents(item.tax_cents) > 0 ? 1 : 0, item.cost_basis_cents == null ? null : cents(item.cost_basis_cents)).run();
  }
  const gross = items.reduce((sum, item) => sum + cents(item.subtotal_cents), 0) || cents(order.subtotal_cents);
  const tax = cents(order.tax_cents);
  const source = await ingestCommerceSourceEvent(db, {
    actor: actor("accounting.commerce.post"), entitlementTier: "parish",
    event: {
      sourceType: "commerce_sale_completed", sourceEventId: `commerce:${order.id}:completed`,
      orderId: order.id, orderNumber: text(order.order_number), occurredAt: order.completed_at || order.updated_at,
      commerceChannel: "bookstore", tenderType: "stripe", grossMerchandiseAmount: gross,
      taxableAmount: tax ? gross : 0, taxExemptAmount: tax ? 0 : gross, salesTaxAmount: tax,
      feeAmount: cents(order.stripe_fee_cents), netAmount: cents(order.parish_net_cents),
      items: items.map((item) => ({
        operationalItemId: text(item.product_id) || text(item.variant_id) || text(item.id),
        sku: text(item.sku), name: text(item.item_name) || "Bookstore item",
        quantity: cents(item.quantity) || 1, grossAmount: cents(item.subtotal_cents),
        taxAmount: cents(item.tax_cents), unitCostSnapshot: item.cost_basis_cents == null ? null : cents(item.cost_basis_cents)
      }))
    }
  });
  return processCommerceSourceEvent(db, {
    actor: actor("accounting.commerce.post"), entitlementTier: "parish", sourceEventId: source.id
  });
}

export async function wireCommerceRefundsToAccounting(env, orderId, charge = {}) {
  if (!env?.AGAPAY_DB?.prepare || !orderId) return [];
  const order = await d1First(env, "SELECT * FROM commerce_orders WHERE id=?", orderId);
  if (!order) return [];
  const db = await resolveOperationalAccountingDatabase(env, order.parish_id);
  if (!db) return [];
  const total = cents(order.total_charged_cents) || cents(charge.amount);
  const refunds = Array.isArray(charge.refunds?.data) ? charge.refunds.data : [];
  const results = [];
  for (const refund of refunds) {
    const amount = cents(refund.amount);
    const refundId = text(refund.id);
    if (!refundId || !amount) continue;
    const tax = total ? Math.min(cents(order.tax_cents), Math.round(amount * cents(order.tax_cents) / total)) : 0;
    const source = await ingestCommerceSourceEvent(db, {
      actor: actor("accounting.commerce.post"), entitlementTier: "parish",
      event: {
        sourceType: amount >= total ? "commerce_sale_refunded" : "commerce_sale_partially_refunded",
        sourceEventId: `commerce:${order.id}:refund:${refundId}`, orderId: order.id,
        orderNumber: text(order.order_number),
        occurredAt: refund.created ? new Date(refund.created * 1000).toISOString() : new Date().toISOString(),
        currency: text(refund.currency || charge.currency) || "USD", commerceChannel: "bookstore",
        tenderType: "stripe", refundAmount: amount, salesTaxAmount: tax
      }
    });
    results.push(await processCommerceSourceEvent(db, {
      actor: actor("accounting.commerce.post"), entitlementTier: "parish", sourceEventId: source.id
    }));
  }
  return results;
}
