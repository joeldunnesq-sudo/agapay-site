import { PORTABILITY_SCHEMA } from './schema.js';

export class PortabilityError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}

export const POLICY_VERSION = '2026-08-28-active-storage-v2';
export const EXPORT_TTL_MS = 7 * 86400000;
export const MAX_EXPORT_BYTES = 24 * 1024 * 1024;
export const MAX_TABLE_ROWS = 10000;

// Read current metadata on every invocation. A bounded table-valued PRAGMA
// replaces one network round trip per table; this is never a schema cache.
export async function schemaMetadata(db, names, kind = 'table_info') {
  if (!['table_info', 'foreign_key_list'].includes(kind) || names.length > 1000) throw new PortabilityError('schema_inventory_limit', 'The database schema requires operator review.');
  const result = new Map(names.map(name => [name, []]));
  for (let offset = 0; offset < names.length; offset += 50) {
    const group = names.slice(offset, offset + 50);
    const rows = (await db.prepare(`SELECT n.value AS table_name,p.* FROM json_each(?) n JOIN pragma_${kind}(n.value) p ORDER BY n.value,p.${kind === 'table_info' ? 'cid' : 'id'},p.${kind === 'table_info' ? 'cid' : 'seq'}`).bind(JSON.stringify(group)).all()).results;
    if (!Array.isArray(rows)) throw new PortabilityError('storage_unavailable', 'The database schema could not be read.', 503);
    for (const { table_name: tableName, ...row } of rows) {
      if (!result.has(tableName)) throw new PortabilityError('storage_unavailable', 'Unexpected schema metadata.', 503);
      result.get(tableName).push(row);
    }
  }
  if (kind === 'table_info' && [...result.values()].some(rows => !rows.length)) throw new PortabilityError('schema_changed', 'A database table changed during inspection. Retry the export.');
  return result;
}

// These joins are ownership declarations, not inferred foreign-key traversals.
const JOIN_SCOPES = {
  accounting_databases: ['accounting_entity_id', 'accounting_entities', 'id'],
  accounting_lifecycle_events: ['accounting_entity_id', 'accounting_entities', 'id'],
  accounting_provisioning_operations: ['accounting_entity_id', 'accounting_entities', 'id'],
  directory_household_admins: ['household_id', 'directory_households', 'id'],
  directory_household_members: ['household_id', 'directory_households', 'id'],
  directory_import_rows: ['batch_id', 'directory_import_batches', 'id'],
  directory_media_variants: ['media_asset_id', 'directory_media_assets', 'id'],
  koinonia_exchange_photos: ['listing_id', 'koinonia_exchange_listings', 'id'],
  koinonia_ministry_event_attendance: ['event_id', 'koinonia_ministry_events', 'id'],
  koinonia_signup_notification_log: ['entry_id', 'koinonia_signup_entries', 'id'],
  membership_capabilities: ['membership_id', 'parish_memberships', 'id'],
  nonprofit_pricing_documents: ['application_id', 'nonprofit_pricing_applications', 'id'],
  sacrament_baptism_details: ['request_id', 'sacrament_requests', 'id'],
  sacrament_preparation_request_items: ['request_id', 'sacrament_preparation_request_plans', 'request_id'],
  sacrament_preparation_template_items: ['template_id', 'sacrament_preparation_templates', 'id'],
  sacrament_wedding_details: ['request_id', 'sacrament_requests', 'id'],
  stewardship_agenda_items: ['annual_meeting_id', 'stewardship_annual_meetings', 'id'],
  stewardship_financial_summaries: ['annual_meeting_id', 'stewardship_annual_meetings', 'id'],
  stewardship_generated_packets: ['annual_meeting_id', 'stewardship_annual_meetings', 'id'],
  stewardship_nominees: ['annual_meeting_id', 'stewardship_annual_meetings', 'id'],
  stewardship_reports: ['annual_meeting_id', 'stewardship_annual_meetings', 'id'],
  stewardship_resolutions: ['annual_meeting_id', 'stewardship_annual_meetings', 'id'],
  stewardship_restricted_fund_snapshots: ['annual_meeting_id', 'stewardship_annual_meetings', 'id'],
  subscription_early_adopter_slots: ['registration_reference', 'registrations', 'reference'],
  tax_exemption_audit_log: ['registration_reference', 'registrations', 'reference'],
  tax_exemption_documents: ['registration_reference', 'registrations', 'reference'],
  tax_exemption_notes: ['tax_exemption_id', 'tax_exemptions', 'id'],
  tax_exemption_stripe_syncs: ['registration_reference', 'registrations', 'reference'],
};
const INDEPENDENT = new Set(`academic_years account_deletion_requests accounting_schema_versions app_settings consumer_passkey_accounts consumer_passkey_transactions consumer_webauthn_credentials courses directory_person_links donor_custom_news_feeds donor_external_feed_subscriptions donor_news_source_subscriptions donor_podcast_preferences donor_podcast_progress donor_podcast_subscriptions donors grades_and_progress legal_terms_versions platform_users stripe_events`.split(' '));
const SECRET_TABLES = new Set(['parish_email_credentials', 'accounting_staff_sessions', 'directory_import_leases', 'privileged_mfa_profiles', 'privileged_mfa_transactions', 'privileged_webauthn_credentials', 'push_subscriptions']);
export function scopeParent(name) { return JOIN_SCOPES[name] || null; }

// Exact provider-owned names only; unknown application tables still block export.
// workerd/src/workerd/util/sqlite-metadata.h documents the protected metadata table.
export const D1_SYSTEM_TABLES = new Set(['d1_migrations', '_cf_KV', '_cf_METADATA']);
export const SYSTEM_TABLES = new Set([...D1_SYSTEM_TABLES, 'parish_portability_jobs', 'parish_portability_steps', 'parish_portability_leases', 'parish_data_closures', 'parish_portability_objects', 'parish_portability_storage_operations', 'parish_portability_retention', 'parish_portability_inventory_reviews', 'parish_portability_legacy_keys']);

export function quoted(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new PortabilityError('invalid_identifier', 'Invalid storage identifier.');
  return `"${name}"`;
}

export function tableScope(name, alias = 't') {
  const columns = PORTABILITY_SCHEMA[name];
  if (!columns) return null;
  if (name === 'app_settings') return `(${alias}.key = 'parish-feature-requests:' || ?1 OR substr(${alias}.key,1,length('reconciliation-close:' || ?1 || ':')) = 'reconciliation-close:' || ?1 || ':' OR (substr(${alias}.key,1,15)<>'__agapay_learn_' AND CASE WHEN json_valid(${alias}.value) THEN COALESCE(json_extract(${alias}.value,'$.parishId'),json_extract(${alias}.value,'$.parish_id'),json_extract(${alias}.value,'$.organizationId')) END = ?1))`;
  if (columns.includes('parish_id')) return `${alias}.parish_id = ?1`;
  if (['audit_log', 'legal_acceptances'].includes(name)) return `${alias}.organization_id = ?1`;
  if (name.startsWith('privileged_')) return `${alias}.principal_type = 'parish_admin' AND ${alias}.principal_id = ?1`;
  if (name === 'directory_people') return `${alias}.created_by_parish_id = ?1`;
  const join = JOIN_SCOPES[name];
  if (join) return `${alias}.${quoted(join[0])} IN (SELECT p.${quoted(join[2])} FROM ${quoted(join[1])} p WHERE p.parish_id = ?1)`;
  return null;
}

export function classification(name) {
  if (name === 'app_settings') return 'parish';
  if (name.startsWith('learn_') || INDEPENDENT.has(name)) return 'independent';
  if (SECRET_TABLES.has(name)) return 'credentials';
  if (!tableScope(name)) throw new PortabilityError('unclassified_table', `Storage classification is missing for ${name}.`);
  return 'parish';
}

const SECRET_FIELD = /password|secret|token|credential|(^|_)pin(_|$)|session|api.?key|salt|web.?authn|private.?key|recovery.?code|authorization|cookie|database_identifier|provider_id|binding_name|^p256dh$|^auth$/i;
export function sanitizeValue(value, depth = 0) {
  if (depth > 30) throw new PortabilityError('invalid_record', 'A record exceeds the supported nesting depth.');
  if (Array.isArray(value)) return value.map(item => sanitizeValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_FIELD.test(key)).map(([key, child]) => [key, sanitizeValue(child, depth + 1)]));
  }
  return value;
}

export function exportRow(name, row) {
  if (typeof row.key === 'string' && SECRET_FIELD.test(row.key)) return null;
  const clean = {};
  for (const [key, value] of Object.entries(row)) {
    if (SECRET_FIELD.test(key) || key === 'portability_shared') continue;
    if (key === 'data' || key.endsWith('_json') || (name === 'app_settings' && key === 'value')) {
      if (value === null || value === '') { clean[key] = value; continue; }
      try { clean[key] = sanitizeValue(JSON.parse(value)); }
      catch { throw new PortabilityError('invalid_record', `A structured record in ${name} could not be safely exported.`); }
    } else clean[key] = value;
  }
  // A global person may be maintained by a different household/parish today.
  // Parish-specific contacts, privacy and notes are exported from scoped tables.
  if (name === 'directory_people' && row.portability_shared) return Object.fromEntries(['id', 'preferred_name', 'active', 'deceased'].map(key => [key, clean[key]]));
  return clean;
}

export async function inspectStorage(db) {
  if (!db?.prepare) throw new PortabilityError('storage_unavailable', 'The primary database is unavailable.', 503);
  const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results;
  if (!Array.isArray(tables)) throw new PortabilityError('storage_unavailable', 'The database inventory could not be read.', 503);
  const names = tables.filter(t => !SYSTEM_TABLES.has(t.name)).map(t => t.name);
  for (const name of names) if (!PORTABILITY_SCHEMA[name]) throw new PortabilityError('unclassified_table', `The export inventory needs review for ${name}.`);
  const metadata = await schemaMetadata(db, names);
  const result = [];
  for (const { name } of tables) {
    if (SYSTEM_TABLES.has(name)) continue;
    if (!PORTABILITY_SCHEMA[name]) throw new PortabilityError('unclassified_table', `The export inventory needs review for ${name}.`);
    const columns = metadata.get(name);
    if (!Array.isArray(columns)) throw new PortabilityError('storage_unavailable', 'The database schema could not be read.', 503);
    const known = PORTABILITY_SCHEMA[name];
    if (columns.some(column => !known.includes(column.name))) throw new PortabilityError('unclassified_column', `The export inventory needs review for a new ${name} field.`);
    result.push({ name, columns: columns.map(c => c.name), classification: classification(name), scope: tableScope(name) });
  }
  return result;
}

export function csvForRows(rows) {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const cell = value => {
    let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + [columns.map(cell).join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n') + '\r\n';
}
