// src/handlers/parish-giving-reports.js
// Parish giving summaries, history, Stripe volume, and recurring-gift health.

import {
  findRegistrationByParishId,
  getBearerToken,
  givingFeatureAccess,
  hasProductionStore,
  json,
  loadParishPaidOfferings,
  loadParishRecurringOfferings,
  missingProductionStoreResponse,
  parishDashboardPayload,
  rateLimit,
  summarizeCharges,
  summarizeParishRecurringHealth,
  unauthorized,
  verifyParishDashboardBearer,
} from "./parish.js";
import { fundReportPeriod, parishReportingTimezone, loadFundGiftActivity } from "../lib/fund-reporting.js";
import { exportMonthlyGiving } from "../lib/monthly-giving-export.js";
import { outsideGiftsForGiving, subtractLinkedOutsideGifts } from "../lib/outside-gifts.js";
import { d1 } from "../lib/core.js";
import { monthLabel } from "../lib/format.js";
import {
  listYtdStripeCharges,
  numericCents,
} from "../lib/stripe-connect.js";
import {
  refreshStripeVolume,
  summarizeStoredStripeVolume,
} from "../lib/stripe-volume.js";
import { resolveOperationalAccountingDatabase } from "../accounting/source-wiring.js";

// Keep parishDashboardPayload in the explicit shared-core dependency contract for
// this reporting cluster, even though the current endpoints return narrower payloads.
void parishDashboardPayload;

const MANUAL_GIVING_SIGNAL = /\b(alms?|candle|candles|collection|contribution|donation|gift|giving|offering|stewardship|tithe|tithes|vigil)\b/i;

export async function loadManualAccountingGivingEntries(env, parishId, limit = 500) {
  const db = await resolveOperationalAccountingDatabase(env, parishId);
  if (!db) return [];
  try {
    const result = await db.prepare(`
      SELECT e.id entry_id,l.id line_id,COALESCE(e.posting_date,e.entry_date) gift_date,
        e.description entry_description,e.source_type,l.credit_amount,
        a.account_number,a.name account_name,f.code fund_code,f.name fund_name
      FROM accounting_journal_entries e
      JOIN accounting_journal_lines l ON l.journal_entry_id=e.id
      JOIN accounting_accounts a ON a.id=l.account_id
      JOIN accounting_account_types t ON t.id=a.account_type_id
      JOIN accounting_funds f ON f.id=l.fund_id
      WHERE e.status='posted'
        AND e.source_type IN ('manual','manual_register_contribution')
        AND t.category='revenue' AND l.credit_amount>0
      ORDER BY gift_date DESC,e.created_at DESC,l.line_number
      LIMIT ?
    `).bind(Math.max(1, Math.min(2000, Number(limit) || 500))).all();
    return (result.results || [])
      .filter((row) => row.source_type === "manual_register_contribution"
        || MANUAL_GIVING_SIGNAL.test(`${row.account_name || ""} ${row.entry_description || ""}`))
      .map((row) => ({
        id: `accounting:${row.entry_id}:${row.line_id}`,
        source: "manual_accounting",
        giftType: "manual_accounting",
        amountCents: Number(row.credit_amount || 0),
        parishNetCents: Number(row.credit_amount || 0),
        giftAmountCents: Number(row.credit_amount || 0),
        createdAt: row.gift_date,
        date: row.gift_date,
        description: [row.entry_description, row.account_name].filter(Boolean).join(" · "),
        label: row.account_name || "",
        fund: row.fund_name || "",
        fundId: row.fund_code || "",
        donorName: "",
        donorEmail: "",
        recurring: false,
        type: "one_time"
      }));
  } catch (error) {
    if (/no such table|not configured|unavailable/i.test(String(error?.message || ""))) return [];
    throw error;
  }
}

export function summarizeStoredParishGifts(gifts = []) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const giftYears = gifts
    .map((gift) => new Date(gift.createdAt || gift.date || 0).getUTCFullYear())
    .filter((yearValue) => Number.isFinite(yearValue));
  const year = giftYears.includes(currentYear)
    ? currentYear
    : giftYears.length
      ? Math.max(...giftYears)
      : currentYear;
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: monthLabel(index),
    amountCents: 0,
    giftCount: 0
  }));
  const givers = new Set();
  let ytdCents = 0;
  let grossGiftCents = 0;
  let donorCoveredFeeCents = 0;
  let feesAbsorbedCents = 0;
  let coverFeesCount = 0;
  let giftCount = 0;
  let lastGiftAt = "";

  for (const gift of gifts) {
    const created = new Date(gift.createdAt || gift.date || 0);
    if (created.getUTCFullYear() !== year) continue;
    const netCents = numericCents(gift.parishNetCents ?? gift.amountCents);
    const grossCents = numericCents(gift.giftAmountCents ?? gift.amountCents);
    if (!netCents && !grossCents) continue;

    const monthIndex = created.getUTCMonth();
    monthly[monthIndex].amountCents += netCents;
    monthly[monthIndex].giftCount += 1;
    ytdCents += netCents;
    grossGiftCents += grossCents;
    feesAbsorbedCents += numericCents(gift.totalFeeCents);
    if (gift.coverFees) {
      coverFeesCount += 1;
      donorCoveredFeeCents += numericCents(gift.donorCoveredFeeCents);
    }
    giftCount += 1;
    const giverKey = gift.donorEmail || gift.donorName || gift.id;
    if (giverKey) givers.add(String(giverKey).toLowerCase());
    const iso = created.toISOString();
    if (!lastGiftAt || iso > lastGiftAt) lastGiftAt = iso;
  }

  return {
    year,
    currency: "usd",
    ytdCents,
    grossGiftCents,
    donorCoveredFeeCents,
    feesAbsorbedCents,
    feeCoveragePercent: giftCount ? Math.round((coverFeesCount / giftCount) * 100) : 0,
    giftCount,
    giverCount: givers.size,
    averageGiftCents: giftCount ? Math.round(ytdCents / giftCount) : 0,
    lastGiftAt,
    monthly
  };
}

export async function handleParishGivingSummary(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  if (new URL(request.url).searchParams.get("view") === "weekly-funds") {
    try {
      const period = fundReportPeriod({ week: true, timezone: parishReportingTimezone(found.registration) });
      return json({ weeklyFunds: await loadFundGiftActivity(env, parishId, period, found.registration) });
    } catch {
      return json({ error: "Weekly fund totals could not be verified. Please retry." }, { status: 503 });
    }
  }

  const emptySummary = {
    ...summarizeCharges([]),
    generatedAt: new Date().toISOString()
  };

  const url = new URL(request.url);
  const forceStripe = url.searchParams.get("source") === "stripe";
  const storedGifts = await loadParishPaidOfferings(env, parishId, 2000);
  if (storedGifts.length && !forceStripe) {
    return json({
      summary: {
        ...summarizeStoredParishGifts(storedGifts),
        dataSource: "stored",
        generatedAt: new Date().toISOString(),
        note: "Showing stored AGAPAY gift records."
      }
    });
  }

  if (!found.registration.stripeAccountId || String(found.registration.stripeAccountId).startsWith("acct_demo_")) {
    return json({
      summary: {
        ...(storedGifts.length ? summarizeStoredParishGifts(storedGifts) : emptySummary),
        dataSource: storedGifts.length ? "stored" : "not_connected",
        generatedAt: new Date().toISOString(),
        note: storedGifts.length
          ? "Showing seeded AGAPAY gift records for this demo parish."
          : "Stripe is not connected yet."
      }
    });
  }

  const result = await listYtdStripeCharges(env, found.registration.stripeAccountId);
  if (!result.ok) {
    if (storedGifts.length) {
      return json({
        summary: {
          ...summarizeStoredParishGifts(storedGifts),
          dataSource: "stored",
          generatedAt: new Date().toISOString(),
          note: "Showing stored AGAPAY gift records because Stripe summary is unavailable."
        }
      });
    }
    return json(
      { error: "Stripe giving summary failed", detail: result.body.error?.message || "Unknown Stripe error" },
      { status: 502 }
    );
  }

  return json({
    summary: {
      ...summarizeCharges(result.body.data || []),
      dataSource: "stripe",
      generatedAt: new Date().toISOString(),
      note: result.body.data?.length >= 500 ? "Showing the first 500 Stripe charges for this year." : ""
    }
  });
}

export async function handleParishStripeVolume(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-stripe-volume", { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) return unauthorized();

  const stripeAccountId = found.registration.stripeAccountId || "";
  if (!stripeAccountId || stripeAccountId.startsWith("acct_demo_")) {
    return json({
      volume: {
        ...(await summarizeStoredStripeVolume(env, parishId)),
        connected: false,
        note: "Connect the parish Stripe account to begin payment-volume tracking."
      }
    });
  }

  try {
    const refresh = await refreshStripeVolume(env, parishId, stripeAccountId);
    const volume = await summarizeStoredStripeVolume(env, parishId, refresh.periodStart);
    return json({
      volume: {
        ...volume,
        connected: true,
        note: volume.scan.complete
          ? "Donation share is an AGAPAY estimate based on classified Stripe charge volume."
          : "Stripe history is still being scanned. Refresh again to continue before relying on the percentage."
      }
    });
  } catch (error) {
    const volume = await summarizeStoredStripeVolume(env, parishId);
    return json({
      error: "Stripe volume refresh failed",
      detail: error?.message || "Stripe request failed",
      volume: { ...volume, connected: true }
    }, { status: 502 });
  }
}

export async function handleParishGivingHistory(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }

  if (new URL(request.url).searchParams.get("format") === "csv") {
    return exportMonthlyGiving(request, env, parishId, found.registration);
  }

  const [gifts, manualAccountingGifts, outsideGifts] = await Promise.all([
    loadParishPaidOfferings(env, parishId, 500),
    loadManualAccountingGivingEntries(env, parishId, 500),
    outsideGiftsForGiving(env, parishId, found.registration)
  ]);
  return json({
    gifts: [...gifts, ...outsideGifts],
    manualAccountingGifts: subtractLinkedOutsideGifts(manualAccountingGifts, outsideGifts),
    generatedAt: new Date().toISOString()
  });
}

export async function handleParishRecurringHealth(request, env, parishId) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const limited = await rateLimit(request, env, "parish-dashboard", { limit: 80, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env)) return missingProductionStoreResponse();

  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: "Parish dashboard record not found" }, { status: 404 });

  const token = getBearerToken(request);
  if (!(await verifyParishDashboardBearer(found.registration, token))) {
    return unauthorized();
  }
  if (!givingFeatureAccess(found.registration, "giverInsights")) {
    return json({ error: "Recurring-gift insights are available with Give +." }, { status: 403 });
  }

  const records = await loadParishRecurringOfferings(env, parishId, 1000);
  return json({
    health: summarizeParishRecurringHealth(records)
  });
}
