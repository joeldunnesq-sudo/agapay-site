// src/handlers/parish-commemorations.js
// Shared storage and loading for parish commemoration entries.

import {
  COMMEMORATION_KEY_PREFIX,
  d1,
  d1All,
  d1Run,
  hasProductionStore,
  listKvKeys,
  normalizeEmail,
  parseJsonRow,
} from "../lib/core.js";

export function weekWindow(date = new Date()) {
  const end = new Date(date);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return { start, end };
}

export function splitSubmittedNames(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function commemorationKey(parishId, sourceId) {
  return `${COMMEMORATION_KEY_PREFIX}${parishId}:${sourceId}`;
}

export async function loadCommemorationEntries(env, parishId, startDate, endDate) {
  if (!parishId) return [];

  if (d1(env)) {
    const rows = await d1All(
      env,
      `SELECT data FROM commemorations
       WHERE parish_id = ?1 AND created_at >= ?2 AND created_at <= ?3
       ORDER BY created_at DESC
       LIMIT 1000`,
      parishId,
      startDate ? startDate.toISOString() : "0000-01-01T00:00:00.000Z",
      endDate ? endDate.toISOString() : "9999-12-31T23:59:59.999Z"
    );
    return rows.map(parseJsonRow).filter(Boolean);
  }

  if (!env.AGAPAY_REGISTRATIONS) return [];
  const prefix = commemorationKey(parishId, "");
  const keys = await listKvKeys(env, { prefix, limit: 1000 });
  const entries = [];

  for (const key of keys) {
    const raw = await env.AGAPAY_REGISTRATIONS.get(key.name);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw);
      const created = new Date(entry.createdAt || 0);
      if (startDate && created < startDate) continue;
      if (endDate && created > endDate) continue;
      entries.push(entry);
    } catch {
      // Ignore malformed queue entries rather than blocking the dashboard.
    }
  }

  entries.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return entries;
}

export async function storeCommemorationEntry(env, sourceId, metadata = {}, fallback = {}) {
  if (!hasProductionStore(env)) return null;
  const parishId = metadata.parish_id || fallback.parishId || "";
  const living = splitSubmittedNames(metadata.names_living || fallback.namesLiving || "");
  const departed = splitSubmittedNames(metadata.names_departed || fallback.namesDeparted || "");
  if (!parishId || (!living.length && !departed.length)) return null;

  const entry = {
    id: sourceId || crypto.randomUUID(),
    parishId,
    parishName: metadata.parish_name || fallback.parishName || "",
    sourceId: sourceId || "",
    giftType: metadata.gift_type || fallback.giftType || "commemoration",
    commemorationKind: metadata.commemoration_kind || fallback.commemorationKind || "proskomedia_liturgy",
    frequency: metadata.frequency || fallback.frequency || "once",
    donorEmail: normalizeEmail(fallback.donorEmail || metadata.donor_email || ""),
    donorName: fallback.donorName || metadata.donor_name || "",
    amountCents: Number(fallback.amountCents || 0),
    living,
    departed,
    note: fallback.note || metadata.in_memoriam || metadata.note || "",
    createdAt: fallback.createdAt || new Date().toISOString()
  };

  return saveCommemorationEntry(env, entry);
}

export function commemorationSourceIdFromOffering(offering = {}) {
  return offering.checkoutSessionId
    || offering.stripePaymentIntentId
    || offering.id
    || crypto.randomUUID();
}

export async function ensureCommemorationEntryFromOffering(env, offering = {}, overrides = {}) {
  const giftType = String(overrides.giftType || offering.giftType || "").toLowerCase();
  if (giftType !== "commemoration") return null;

  return storeCommemorationEntry(
    env,
    commemorationSourceIdFromOffering({ ...offering, ...overrides }),
    {
      parish_id: overrides.parishId || offering.parishId || "",
      parish_name: overrides.parishName || offering.parishName || "",
      donor_email: overrides.donorEmail || offering.donorEmail || "",
      donor_name: overrides.donorName || offering.donorName || "",
      gift_type: giftType,
      frequency: overrides.frequency || offering.frequency || "once",
      names_living: overrides.namesLiving || offering.namesLiving || "",
      names_departed: overrides.namesDeparted || offering.namesDeparted || "",
      commemoration_kind: overrides.commemorationKind || offering.commemorationKind || "proskomedia_liturgy"
    },
    {
      parishId: overrides.parishId || offering.parishId || "",
      parishName: overrides.parishName || offering.parishName || "",
      donorEmail: overrides.donorEmail || offering.donorEmail || "",
      donorName: overrides.donorName || offering.donorName || "",
      giftType,
      frequency: overrides.frequency || offering.frequency || "once",
      amountCents: Number(overrides.amountCents ?? offering.amountCents ?? 0),
      namesLiving: overrides.namesLiving || offering.namesLiving || "",
      namesDeparted: overrides.namesDeparted || offering.namesDeparted || "",
      commemorationKind: overrides.commemorationKind || offering.commemorationKind || "proskomedia_liturgy",
      createdAt: overrides.createdAt || offering.createdAt || new Date().toISOString()
    }
  );
}

export async function saveCommemorationEntry(env, entry) {
  if (!hasProductionStore(env) || !entry?.parishId || !entry?.id) return null;
  const record = {
    ...entry,
    donorEmail: normalizeEmail(entry.donorEmail || ""),
    createdAt: entry.createdAt || new Date().toISOString()
  };

  if (d1(env)) {
    await d1Run(
      env,
      `INSERT INTO commemorations (id, parish_id, source_id, donor_email, created_at, data)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(id) DO UPDATE SET
         parish_id = excluded.parish_id,
         source_id = excluded.source_id,
         donor_email = excluded.donor_email,
         created_at = excluded.created_at,
         data = excluded.data`,
      `${record.parishId}:${record.id}`,
      record.parishId,
      record.sourceId || record.id,
      record.donorEmail,
      record.createdAt,
      JSON.stringify(record)
    );
  } else {
    await env.AGAPAY_REGISTRATIONS.put(commemorationKey(record.parishId, record.id), JSON.stringify(record));
  }
  return record;
}
