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
const restrictions = new Set(["unrestricted", "board_designated", "donor_restricted_temporary", "donor_restricted_permanent"]);
const restriction = (value, fallback = "unrestricted") => restrictions.has(text(value)) ? text(value) : fallback;
const fundCode = (value) => text(value).toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
const generalFundAliases = new Set(["general", "general operating fund", "general stewardship", "stewardship"]);
const isGeneralOperatingFund = (...values) => values.some((value) => generalFundAliases.has(text(value).toLowerCase()));

function allocateCommerceItemTax(items, orderTaxCents) {
  const totalTax = cents(orderTaxCents);
  const existingTax = items.reduce((sum, item) => sum + cents(item.tax_cents), 0);
  if (!totalTax || existingTax > 0 || !items.length) {
    return items.map((item) => ({ ...item, accountingTaxCents: cents(item.tax_cents) }));
  }
  const gross = items.reduce((sum, item) => sum + cents(item.subtotal_cents), 0);
  let remaining = totalTax;
  return items.map((item, index) => {
    const allocated = index === items.length - 1
      ? remaining
      : Math.min(remaining, gross ? Math.round(totalTax * cents(item.subtotal_cents) / gross) : 0);
    remaining -= allocated;
    return { ...item, accountingTaxCents: allocated };
  });
}

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

async function releaseConflictingGivingIdentity(db, sourceType, sourceId, accountingFundId) {
  const normalizedSourceId = text(sourceId);
  if (!sourceType || !normalizedSourceId || !accountingFundId) return;
  // Keep the archived fund and its immutable journal history, but release a
  // stale publishing identity before assigning it to the canonical linked
  // fund.
  await db.prepare(`UPDATE accounting_funds SET
    giving_source_type=NULL,giving_source_id=NULL,giving_enabled=0,
    version=version+1,updated_at=datetime('now')
    WHERE giving_source_type=? AND giving_source_id=? AND id<>?`)
    .bind(sourceType, normalizedSourceId, accountingFundId).run();
}

export async function accountingFund(db, {
  sourceType, sourceId, name, description = "", purpose = "", accountNumber = "",
  restrictionType = "", restricted = false, goalCents = null, slug = "", metadata = {}, publish = false,
  accountingFundId = ""
}) {
  if (!sourceId && !name) return "fund_general";
  if (sourceType === "fund" && isGeneralOperatingFund(sourceId, name)) {
    await releaseConflictingGivingIdentity(db, "fund", "general", "fund_general");
    await db.prepare(`UPDATE accounting_funds SET
      name='General Operating Fund',description=?,restriction_type='unrestricted',
      purpose='Parish operations',is_default=1,is_active=1,is_system=1,
      giving_source_type='fund',giving_source_id='general',giving_enabled=1,
      giving_slug=NULL,giving_goal_cents=NULL,giving_metadata_json='{}',
      archived_at=NULL,version=version+1,updated_at=datetime('now')
      WHERE id='fund_general'`)
      .bind("Stewardship and other unrestricted support for day-to-day parish operations.").run();
    return "fund_general";
  }
  const identity = `${sourceType}:${sourceId || name.toLowerCase()}`;
  const suffix = await digest(identity);
  // Once a catalog record is linked to a ledger fund, retain that identity.
  // Posted journal lines are immutable and must never be orphaned by replacing
  // their fund solely because the parish later edits its catalog metadata.
  let id = text(accountingFundId) || `fund_operational_${suffix}`;
  const identityOwner = await db.prepare(`SELECT id FROM accounting_funds
    WHERE giving_source_type=? AND giving_source_id=? LIMIT 1`)
    .bind(sourceType, text(sourceId)).first();
  if (identityOwner?.id && identityOwner.id !== id) {
    if (text(accountingFundId)) {
      await releaseConflictingGivingIdentity(db, sourceType, sourceId, id);
    } else {
      id = identityOwner.id;
    }
  }
  if (!publish) {
    const existing = await db.prepare(`SELECT id FROM accounting_funds
      WHERE giving_source_type=? AND giving_source_id=? AND is_active=1 AND archived_at IS NULL`)
      .bind(sourceType, text(sourceId)).first();
    if (existing?.id) return existing.id;
  }
  const code = fundCode(accountNumber) || `${sourceType === "campaign" ? "CAM" : "GIV"}-${suffix.slice(0, 8).toUpperCase()}`;
  const displayName = text(name) || (sourceType === "campaign" ? "Giving Campaign" : "Giving Fund");
  const resolvedRestriction = restriction(restrictionType, restricted ? "donor_restricted_temporary" : "unrestricted");
  await db.prepare(`INSERT INTO accounting_funds
    (id,code,name,description,restriction_type,purpose,is_default,is_active,is_system,
     giving_source_type,giving_source_id,giving_enabled,giving_slug,giving_goal_cents,giving_metadata_json)
    VALUES(?,?,?,?,?,?,0,1,0,?,?,1,?,?,?)
    ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,description=excluded.description,
      restriction_type=excluded.restriction_type,purpose=excluded.purpose,is_active=1,
      giving_source_type=excluded.giving_source_type,giving_source_id=excluded.giving_source_id,
      giving_enabled=1,giving_slug=excluded.giving_slug,giving_goal_cents=excluded.giving_goal_cents,
      giving_metadata_json=excluded.giving_metadata_json,archived_at=NULL,
      version=accounting_funds.version+1,updated_at=datetime('now')`)
    .bind(id, code, displayName, text(description) || null, resolvedRestriction, text(purpose) || displayName,
      sourceType, text(sourceId), text(slug) || null, goalCents == null ? null : cents(goalCents),
      JSON.stringify(metadata || {})).run();
  return id;
}

export async function wireGivingOfferingToAccounting(env, offering = {}) {
  const parishId = text(offering.parishId);
  const db = await resolveOperationalAccountingDatabase(env, parishId);
  if (!db || !parishId) return null;
  const campaignId = text(offering.campaignId);
  const festalAlmsGift = ["alms", "feast"].includes(text(offering.giftType).toLowerCase());
  const campaignGift = Boolean(campaignId) && !festalAlmsGift;
  const stewardshipGift = !campaignGift && isGeneralOperatingFund(offering.giftType, offering.fundId, offering.fund);
  const fundSourceId = campaignGift ? campaignId : (stewardshipGift ? "general" : text(offering.fundId) || text(offering.fund) || text(offering.giftType));
  const fundName = campaignGift ? text(offering.campaign) : (stewardshipGift ? "General Operating Fund" : text(offering.fund) || text(offering.giftType) || "General Operating Fund");
  const fundId = await accountingFund(db, {
    sourceType: campaignGift ? "campaign" : "fund",
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
  await db.prepare(`INSERT OR IGNORE INTO accounting_accounts
    (id,account_number,name,account_type_id,normal_balance,is_posting_account,is_system,requires_fund)
    VALUES('acct_5850','5850','AGAPAY Platform Fees','type_expense','debit',1,1,1)`).run();
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
  const agapayFee = cents(offering.agapayFeeCents);
  if (agapayFee) {
    const agapayFeeEvent = await ingestAccountingSourceEvent(db, {
      actor: actor("accounting.integrations.post"), entitlementTier: "parish",
      event: {
        sourceSystem: "agapay_give", sourceType: "agapay_fee_assessed",
        sourceEventId: `give:${donationId}:agapay_fee`, sourceObjectId: donationId,
        occurredAt, currency: text(offering.currency) || "USD", feeAmount: agapayFee,
        donationId, paymentIntentId, designatedFundId: fundId
      }
    });
    await processAccountingSourceEvent(db, {
      actor: actor("accounting.integrations.post"), entitlementTier: "parish", sourceEventId: agapayFeeEvent.id
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
  const festalAlmsGift = ["alms", "feast"].includes(text(offering.giftType).toLowerCase());
  const campaignGift = Boolean(campaignId) && !festalAlmsGift;
  const stewardshipGift = !campaignGift && isGeneralOperatingFund(offering.giftType, offering.fundId, offering.fund);
  const fundId = await accountingFund(db, {
    sourceType: campaignGift ? "campaign" : "fund",
    sourceId: campaignGift ? campaignId : (stewardshipGift ? "general" : text(offering.fundId) || text(offering.fund) || text(offering.giftType)),
    name: campaignGift ? text(offering.campaign) : (stewardshipGift ? "General Operating Fund" : text(offering.fund) || text(offering.giftType) || "General Operating Fund"),
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
  if (!db) return { available: false, synchronized: 0 };
  const records = [
    ...(Array.isArray(registration.funds) ? registration.funds : []).map((item) => ({ ...item, sourceType: "fund" })),
    ...(Array.isArray(registration.campaigns) ? registration.campaigns : []).map((item) => ({ ...item, sourceType: "campaign" }))
  ].filter((item) => item.enabled !== false);
  // Funds & Alms is the parish-managed catalog. Retire every non-system,
  // non-default accounting fund before republishing that catalog so parallel
  // fund lists cannot drift. Historical journal lines keep their fund IDs.
  await db.prepare(`UPDATE accounting_funds SET is_active=0,archived_at=COALESCE(archived_at,datetime('now')),
    giving_enabled=0,version=version+1,updated_at=datetime('now')
    WHERE is_system=0 AND is_default=0`).run();
  const synchronized = [];
  for (const item of records) {
    const sourceId = text(item.id) || text(item.code) || text(item.slug) || text(item.name) || text(item.title);
    const accountingFundId = await accountingFund(db, {
      sourceType: item.sourceType,
      sourceId,
      name: text(item.name) || text(item.title) || text(item.label),
      description: item.description,
      purpose: item.purpose || item.description,
      accountNumber: item.accountNumber || item.code,
      restrictionType: item.restrictionType,
      restricted: Boolean(item.donorRestricted || item.restricted || item.sourceType === "campaign"),
      goalCents: item.goalCents,
      slug: item.slug,
      metadata: {
        endsAt: item.endsAt || null,
        coverPhotoUrl: item.coverPhotoUrl || null,
        photos: Array.isArray(item.photos) ? item.photos : [],
        updates: Array.isArray(item.updates) ? item.updates : [],
        createdAt: item.createdAt || null,
        feastCampaign: Boolean(item.feastCampaign),
        enabled: item.enabled !== false,
        campaignName: item.campaignName || null
      },
      accountingFundId: item.accountingFundId,
      publish: true
    });
    const row = await db.prepare(`SELECT code,name,description,restriction_type,purpose
      FROM accounting_funds WHERE id=?`).bind(accountingFundId).first();
    synchronized.push({
      ...item,
      id: sourceId,
      accountingFundId,
      accountNumber: row?.code || "",
      name: row?.name || item.name,
      description: row?.description || "",
      purpose: row?.purpose || "",
      restrictionType: row?.restriction_type || "unrestricted"
    });
  }
  return {
    available: true,
    synchronized: synchronized.length,
    funds: synchronized.filter((item) => item.sourceType === "fund").map(({ sourceType, ...item }) => item),
    campaigns: synchronized.filter((item) => item.sourceType === "campaign").map(({ sourceType, ...item }) => item),
    feastCampaigns: Array.isArray(registration.feastCampaigns) ? registration.feastCampaigns : []
  };
}

export async function loadGivingCatalogFromAccounting(env, parishId, registration = {}) {
  const db = await resolveOperationalAccountingDatabase(env, parishId);
  if (!db) return { available: false, funds: registration.funds || [], campaigns: registration.campaigns || [], feastCampaigns: registration.feastCampaigns || [] };
  const rows = (await db.prepare(`SELECT id,code,name,description,restriction_type,purpose,
    giving_source_type,giving_source_id,giving_slug,giving_goal_cents,giving_metadata_json
    FROM accounting_funds
    WHERE giving_enabled=1 AND is_active=1 AND archived_at IS NULL
      AND giving_source_type IS NOT NULL AND giving_source_id IS NOT NULL
    ORDER BY code`).all()).results || [];
  if (!rows.length) return { available: true, funds: registration.funds || [], campaigns: registration.campaigns || [], feastCampaigns: registration.feastCampaigns || [] };
  const mapped = rows.map((row) => {
    let metadata = {};
    try { metadata = JSON.parse(row.giving_metadata_json || "{}"); } catch { metadata = {}; }
    return {
      id: row.giving_source_id,
      accountingFundId: row.id,
      accountNumber: row.code,
      name: row.name,
      description: row.description || "",
      purpose: row.purpose || "",
      restrictionType: row.restriction_type,
      ...(row.giving_source_type === "campaign" ? {
        slug: row.giving_slug || undefined,
        goalCents: row.giving_goal_cents ?? undefined,
        endsAt: metadata.endsAt || undefined,
        coverPhotoUrl: metadata.coverPhotoUrl || undefined,
        photos: Array.isArray(metadata.photos) ? metadata.photos : [],
        updates: Array.isArray(metadata.updates) ? metadata.updates : [],
        createdAt: metadata.createdAt || undefined,
        enabled: metadata.enabled !== false,
        campaignName: metadata.campaignName || undefined
      } : {})
    };
  });
  return {
    available: true,
    funds: mapped.filter((item) => rows.find((row) => row.id === item.accountingFundId)?.giving_source_type === "fund"),
    campaigns: mapped.filter((item) => {
      const row = rows.find((candidate) => candidate.id === item.accountingFundId);
      if (row?.giving_source_type !== "campaign") return false;
      try { return !JSON.parse(row.giving_metadata_json || "{}").feastCampaign; } catch { return true; }
    }),
    feastCampaigns: Array.isArray(registration.feastCampaigns) ? registration.feastCampaigns : []
  };
}

export async function wireCommerceOrderToAccounting(env, orderId) {
  if (!env?.AGAPAY_DB?.prepare || !orderId) return null;
  const order = await d1First(env, "SELECT * FROM commerce_orders WHERE id=?", orderId);
  if (!order || !["paid", "partially_refunded", "refunded", "disputed", "dispute_closed"].includes(order.payment_status)) return null;
  const db = await resolveOperationalAccountingDatabase(env, order.parish_id);
  if (!db) return null;
  let items = await d1All(env, "SELECT * FROM commerce_order_items WHERE order_id=? ORDER BY created_at,id", order.id);
  if (!items.length) items = [{
    product_id: order.product_id || order.id, sku: order.product_sku, item_name: order.item_description,
    item_category: order.item_category, quantity: order.quantity, subtotal_cents: order.subtotal_cents,
    tax_cents: order.tax_cents, cost_basis_cents: null
  }];
  items = allocateCommerceItemTax(items, order.tax_cents);
  const commerceModule = text(order.commerce_module) || "bookstore";
  const fallbackItemName = commerceModule === "events" ? "Event item" : "Bookstore item";
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
        text(item.item_name) || fallbackItemName, text(item.item_category) || null,
        item.accountingTaxCents > 0 || Boolean(text(item.tax_code)) ? 1 : 0,
        item.cost_basis_cents == null ? null : cents(item.cost_basis_cents)).run();
  }
  const gross = items.reduce((sum, item) => sum + cents(item.subtotal_cents), 0) || cents(order.subtotal_cents);
  const tax = cents(order.tax_cents);
  const source = await ingestCommerceSourceEvent(db, {
    actor: actor("accounting.commerce.post"), entitlementTier: "parish",
    event: {
      sourceType: "commerce_sale_completed", sourceEventId: `commerce:${order.id}:completed`,
      orderId: order.id, orderNumber: text(order.order_number), occurredAt: order.completed_at || order.updated_at,
      commerceChannel: commerceModule, tenderType: "stripe", grossMerchandiseAmount: gross,
      taxableAmount: tax ? gross : 0, taxExemptAmount: tax ? 0 : gross, salesTaxAmount: tax,
      feeAmount: cents(order.stripe_fee_cents), netAmount: cents(order.parish_net_cents),
      settlementProfileId: text(order.settlement_profile_id),
      items: items.map((item) => ({
        operationalItemId: text(item.product_id) || text(item.variant_id) || text(item.id),
        sku: text(item.sku), name: text(item.item_name) || fallbackItemName,
        quantity: cents(item.quantity) || 1, grossAmount: cents(item.subtotal_cents),
        taxAmount: item.accountingTaxCents,
        unitCostSnapshot: item.cost_basis_cents == null ? null : cents(item.cost_basis_cents)
      }))
    }
  });
  return processCommerceSourceEvent(db, {
    actor: actor("accounting.commerce.post"), entitlementTier: "parish", sourceEventId: source.id
  });
}

export async function wireCommerceDisputeToAccounting(env, orderId, dispute = {}, phase = "created") {
  if (!env?.AGAPAY_DB?.prepare || !orderId) return null;
  const order = await d1First(env, "SELECT * FROM commerce_orders WHERE id=?", orderId);
  if (!order) return null;
  const db = await resolveOperationalAccountingDatabase(env, order.parish_id);
  if (!db) return null;
  const disputeId = text(dispute.id);
  const amount = cents(dispute.amount);
  if (!disputeId || !amount) return null;
  const won = phase === "closed" && text(dispute.status).toLowerCase() === "won";
  const sourceType = won
    ? "commerce_dispute_won"
    : phase === "closed"
      ? "commerce_dispute_lost"
      : "commerce_dispute_created";
  const source = await ingestCommerceSourceEvent(db, {
    actor: actor("accounting.commerce.post"), entitlementTier: "parish",
    event: {
      sourceType,
      sourceEventId: `commerce:${order.id}:dispute:${disputeId}:${phase}`,
      orderId: order.id,
      orderNumber: text(order.order_number),
      occurredAt: dispute.created ? new Date(dispute.created * 1000).toISOString() : new Date().toISOString(),
      currency: text(dispute.currency) || "USD",
      commerceChannel: text(order.commerce_module) || "bookstore",
      tenderType: "stripe",
      grossMerchandiseAmount: amount,
      settlementProfileId: text(order.settlement_profile_id)
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
        currency: text(refund.currency || charge.currency) || "USD",
        commerceChannel: text(order.commerce_module) || "bookstore",
        tenderType: "stripe", refundAmount: amount, salesTaxAmount: tax,
        settlementProfileId: text(order.settlement_profile_id)
      }
    });
    results.push(await processCommerceSourceEvent(db, {
      actor: actor("accounting.commerce.post"), entitlementTier: "parish", sourceEventId: source.id
    }));
  }
  return results;
}
