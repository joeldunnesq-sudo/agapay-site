import { rawStorageEnv } from '../portability/storage.js';
import { sha256 } from '../portability/archive.js';

// Explicitly reviewed parish-editable configuration. New identity, billing,
// entitlement, or credential fields cannot enter rollback by default.
export const CONFIG_FIELDS =
  'parishName addressLine1 addressLine2 city state postalCode country website taxLegalName taxEin timezone liturgicalCalendar koinoniaCalendarUrl patronalFeast patronalFeastName patronalFeastDate givingStatus recurringGivingEnabled candlesEnabled commemorationsEnabled communicationsEnabled signupsEnabled exchangeEnabled prayerRequestsEnabled sacramentsEnabled sacramentPriests bookstoreEnabled eventsEnabled mealsEnabled funds campaigns feastCampaigns'.split(
    ' '
  );
export function configuration(data) {
  const value = typeof data === 'string' ? JSON.parse(data) : data;
  return Object.fromEntries(CONFIG_FIELDS.map((key) => [key, value[key] ?? null]));
}
export function registrationProjection(row) {
  return { reference: row.reference, parish_id: row.parish_id, data: JSON.stringify(configuration(row.data)) };
}
export function configurationChangedSql() {
  return CONFIG_FIELDS.map((key) => `json_extract(OLD.data,'$.${key}') IS NOT json_extract(NEW.data,'$.${key}')`).join(
    ' OR '
  );
}

export async function syncConfigurationMirrors(env, parishId, mirrors) {
  const db = env.AGAPAY_DB,
    kv = rawStorageEnv(env).AGAPAY_REGISTRATIONS;
  if (!kv || !mirrors?.length) return;
  const records = (
    await db
      .prepare(
        "SELECT reference,data FROM registrations WHERE parish_id=? ORDER BY COALESCE(json_extract(data,'$.updatedAt'),updated_at,received_at) DESC,updated_at DESC,reference DESC"
      )
      .bind(parishId)
      .all()
  ).results;
  if (!records.length) throw new Error('Registration disappeared during recovery');
  for (const key of mirrors) {
    const raw = await kv.get(key);
    if (raw == null) throw new Error('Registration mirror disappeared during recovery');
    const value = JSON.parse(raw);
    if ((value.parishId || value.parish_id) !== parishId) throw new Error('Registration mirror ownership changed');
    const source = records.find((r) => r.reference === key) || records[0];
    const body = JSON.stringify({ ...value, ...configuration(source.data) });
    await kv.put(key, body);
    if ((await sha256((await kv.get(key)) || '')) !== (await sha256(body)))
      throw new Error('Registration mirror is still converging');
    await db
      .prepare(
        "UPDATE parish_portability_legacy_keys SET source_hash=?,state='stored',updated_at=? WHERE object_key=? AND parish_id=?"
      )
      .bind(await sha256(body), Date.now(), key, parishId)
      .run();
  }
}
