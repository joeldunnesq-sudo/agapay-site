import { PORTABILITY_SCHEMA } from './schema.js';
import { PortabilityError, POLICY_VERSION, quoted, tableScope, scopeParent, classification, schemaMetadata } from './catalog.js';
import { FILE_BINDINGS, PUBLIC_BINDINGS, assertStorageDrained } from './storage.js';
import { suppressionRecord, storageGuardsEnabled } from './suppression.js';
import { strictBackupExpiryEnabled } from '../accounting/backup-retention.js';
import { workerPublicMediaVerified } from './public-media.js';
import { RETENTION_DISCLOSURE_VERSION, retentionDisclosure } from './policy.js';

export const FINANCIAL_TABLES = new Set(`donor_offerings household_pledges manual_income_entries commerce_orders commerce_order_items commerce_weekly_reports giving_statement_jobs giving_statements settlement_profiles settlement_profile_modules stripe_payment_volume_records stripe_payment_volume_scans tax_exemptions tax_exemption_documents tax_exemption_notes tax_exemption_audit_log tax_exemption_stripe_syncs nonprofit_pricing_applications nonprofit_pricing_documents nonprofit_pricing_audit_log legal_acceptances audit_log stewardship_authoritative_financial_snapshots stewardship_financial_snapshot_revisions stewardship_financial_summaries stewardship_restricted_fund_snapshots stewardship_annual_meetings`.split(' '));
FINANCIAL_TABLES.add('accounting_entities');
FINANCIAL_TABLES.add('accounting_databases');
// Historical fund codes support retained giving/accounting records.
FINANCIAL_TABLES.add('giving_funds');

// Release blockers are explicit, and cannot be bypassed by a request payload.
// This prevents a partial adapter from promising parish-wide erasure.
export function closureReadiness(env, manifest) {
  const blockers = [];
  if (env.PARISH_AUTOMATIC_CLOSURE_ENABLED !== 'true') blockers.push({ code: 'closure_release_disabled', message: 'Automatic closure is awaiting its staging and retention release review.' });
  if (env.PARISH_RETENTION_DISCLOSURE_APPROVED !== RETENTION_DISCLOSURE_VERSION) blockers.push({ code: 'retention_disclosure_unapproved', message: 'The parish retention disclosure must be formally approved at its exact published version before automatic closure can be enabled.' });
  if (!strictBackupExpiryEnabled(env)) blockers.push({ code: 'backup_expiry_disabled', message: 'Strict backup expiry must be separately enabled after its release review.' });
  if (env.PARISH_BACKUP_EXPIRY_VERIFIED !== POLICY_VERSION) blockers.push({ code: 'backup_expiry_unverified', message: 'A guaranteed backup expiry and restore-suppression process has not been verified.' });
  if (!storageGuardsEnabled(env) || !env.PARISH_CLOSURE_LEDGER || !env.PARISH_SUPPRESSION_AUTHORITY) blockers.push({ code: 'storage_guards_unavailable', message: 'Storage write guards and the independent closure authority must be configured.' });
  if (!env.PARISH_RETAINED_DATA) blockers.push({ code: 'retention_storage_unavailable', message: 'Private restricted retention storage must be configured.' });
  if (env.AGAPAY_REGISTRATIONS && env.PARISH_LEGACY_INVENTORY_VERIFIED !== POLICY_VERSION) blockers.push({ code: 'legacy_inventory_unverified', message: 'Legacy ownership reconciliation and retirement of old writers must be verified.' });
  if (manifest?.activeLegalHolds?.length) blockers.push({ code: 'active_legal_hold', message: 'An active accounting legal hold prevents automatic closure.' });
  if (manifest?.assets?.some(a => !a.etag || !FILE_BINDINGS.includes(a.binding)) || (manifest?.assets?.length && !manifest.fileInventoryVerified)) blockers.push({ code: 'file_manifest_invalid', message: 'The file manifest must include verified inventory and object versions.' });
  if (manifest?.legacyRecords?.some(r => !/^[a-f0-9]{64}$/.test(r.sourceHash || '') || !['delete','financial','support'].includes(r.disposition))) blockers.push({ code: 'legacy_manifest_invalid', message: 'The legacy manifest requires verified source hashes and retention classification.' });
  if (manifest?.tables?.some(t => t.table.startsWith('accounting/') && t.rowCount) && (!Number.isInteger(manifest.accountingRetentionYears) || manifest.accountingRetentionYears < 7 || manifest.accountingRetentionYears > 100)) blockers.push({ code: 'accounting_retention_invalid', message: 'The configured accounting retention period needs review.' });
  if (manifest && FILE_BINDINGS.some(name => env[name]) && !manifest.fileInventoryVerified) blockers.push({ code: 'file_inventory_unverified', message: 'Complete file ownership and orphan inventory has not been verified.' });
  if ([...PUBLIC_BINDINGS].some(name => env[name]) && !workerPublicMediaVerified(env) && (env.PARISH_PUBLIC_CACHE_POLICY_VERIFIED !== POLICY_VERSION || !env.PARISH_ASSET_CACHE_ZONE_ID || !env.PARISH_ASSET_CACHE_PURGE_TOKEN)) blockers.push({ code: 'cache_disposal_unverified', message: 'Public asset cache disposal and public bucket domains require verification.' });
  return { available: blockers.length === 0, blockers, disclosure: retentionDisclosure(env) };
}

export async function parishClosureState(env, parishId) {
  // With the feature disabled, no new read is added to existing hot paths.
  if (storageGuardsEnabled(env)) {
    const record = await suppressionRecord(env, parishId);
    if (record) return { state: 'closed', job_id: record.jobId };
  }
  if ((env.PARISH_PORTABILITY_ENABLED !== 'true' && !storageGuardsEnabled(env)) || !env.AGAPAY_DB) return null;
  return env.AGAPAY_DB.prepare('SELECT state, job_id FROM parish_data_closures WHERE parish_id=?').bind(parishId).first();
}

export function barrierStatements(names = Object.keys(PORTABILITY_SCHEMA)) {
  const statements = [];
  for (const name of names) {
    if (name.startsWith('parish_portability_') || name === 'parish_data_closures' || !tableScope(name)) continue;
    for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
      const refs = event === 'UPDATE' ? ['OLD', 'NEW'] : [event === 'INSERT' ? 'NEW' : 'OLD'];
      let scope = refs.map(ref => {
        let value = tableScope(name, ref).replaceAll('?1', 'c.parish_id');
        if (name === 'directory_people') value += ` AND NOT EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id=${ref}.id) AND NOT EXISTS(SELECT 1 FROM directory_parish_affiliations a WHERE a.person_id=${ref}.id AND a.parish_id<>c.parish_id) AND NOT EXISTS(SELECT 1 FROM directory_household_members m JOIN directory_households h ON h.id=m.household_id WHERE m.person_id=${ref}.id AND h.parish_id<>c.parish_id)`;
        return '(' + value + ')';
      }).join(' OR ');
      const parent = scopeParent(name);
      if (parent && event !== 'DELETE') scope = `(${scope}) OR NOT EXISTS(SELECT 1 FROM ${quoted(parent[1])} p WHERE p.${quoted(parent[2])}=NEW.${quoted(parent[0])})`;
      // Deletion jobs may delete eligible records, never retained records.
      let states = event === 'DELETE' && !FINANCIAL_TABLES.has(name) ? "c.state IN ('preparing','closed')" : '1=1';
      if (name === 'registrations' && event === 'UPDATE') states = `NOT (c.state='deleting' AND NEW.reference=OLD.reference AND NEW.parish_id=OLD.parish_id AND NEW.status='closed' AND NEW.parish_name IS NULL AND NEW.community_type IS NULL AND NEW.stripe_account_id IS OLD.stripe_account_id AND NEW.stripe_subscription_id IS OLD.stripe_subscription_id AND NEW.received_at IS OLD.received_at AND NEW.data=json_object('parishId',OLD.parish_id,'status','closed'))`;
      statements.push(`CREATE TRIGGER IF NOT EXISTS ${quoted('portability_' + name + '_' + event.toLowerCase())} BEFORE ${event} ON ${quoted(name)} WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (${states}) AND (${scope})) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;`);
    }
  }
  return statements;
}

export async function verifyBarriers(db, inventory) {
  const actual = new Map((await db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'portability_%'").all()).results.map(row => [row.name, row.sql]));
  const normalize = text => text.replace(/IF NOT EXISTS\s+/gi, '').replace(/\s+/g, '').replace(/;$/, '').toLowerCase();
  for (const sql of barrierStatements(inventory.map(t => t.name))) {
    const name = sql.match(/EXISTS "([^"]+)"/)[1];
    if (!actual.has(name) || normalize(actual.get(name)) !== normalize(sql)) throw new PortabilityError('write_barrier_missing', 'The parish write barriers must be installed and verified before closure.');
  }
}

export async function planCentralPurge(env, job, inventory) {
  const db = env.AGAPAY_DB;
  await assertStorageDrained(env, job.parish_id);
  await verifyBarriers(db, inventory);
  if (inventory.some(t => t.name === 'directory_import_leases') && await db.prepare('SELECT 1 AS found FROM directory_import_leases WHERE parish_id=? AND expires_at>? LIMIT 1').bind(job.parish_id, Date.now()).first()) throw new PortabilityError('import_in_progress', 'Wait for the current directory import and invitation delivery to finish before closing.');
  // Preserve retention dependencies instead of following CASCADE into them.
  const retained = new Set(inventory.filter(t => FINANCIAL_TABLES.has(t.name)).map(t => t.name));
  const foreignKeys = await schemaMetadata(db, inventory.filter(item => item.scope).map(item => item.name), 'foreign_key_list');
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of retained) {
      const scope = tableScope(name);
      if (!scope || !await db.prepare(`SELECT 1 AS found FROM ${quoted(name)} t WHERE ${scope} LIMIT 1`).bind(job.parish_id).first()) continue;
      for (const fk of foreignKeys.get(name) || []) if (!retained.has(fk.table)) { retained.add(fk.table); changed = true; }
    }
  }
  // Registration contains credentials and settings, so this initial purge adapter
  // does not silently retain its entire JSON blob under a financial exception.
  const deleting = inventory.filter(t => t.scope && !retained.has(t.name) && classification(t.name) !== 'independent');
  const ordered = [], visiting = new Set(), visited = new Set();
  function visit(table) {
    if (visited.has(table.name)) return;
    if (visiting.has(table.name)) throw new PortabilityError('deletion_dependency_cycle', 'The parish deletion graph requires review.');
    visiting.add(table.name);
    for (const child of deleting) if ((foreignKeys.get(child.name) || []).some(fk => fk.table === table.name && child.name !== table.name)) visit(child);
    visiting.delete(table.name); visited.add(table.name); ordered.push(table);
  }
  deleting.forEach(visit);
  // Validate all cross-parish child references before the first DELETE.
  for (const parent of deleting) for (const [childName, keys] of foreignKeys) for (const fk of keys) {
    if (fk.table !== parent.name) continue;
    const child = inventory.find(t => t.name === childName);
    let parentScope = tableScope(parent.name, 'p');
    if (parent.name === 'directory_people') parentScope += ` AND NOT EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id=p.id) AND NOT EXISTS(SELECT 1 FROM directory_parish_affiliations a WHERE a.person_id=p.id AND a.parish_id<>?1) AND NOT EXISTS(SELECT 1 FROM directory_household_members m JOIN directory_households h ON h.id=m.household_id WHERE m.person_id=p.id AND h.parish_id<>?1)`;
    const outside = await db.prepare(`SELECT 1 AS found FROM ${quoted(childName)} t JOIN ${quoted(parent.name)} p ON t.${quoted(fk.from)}=p.${quoted(fk.to)} WHERE (${parentScope}) AND COALESCE((${child.scope}),0)=0 LIMIT 1`).bind(job.parish_id).first();
    if (outside) throw new PortabilityError('cross_parish_reference', 'A record is referenced by another parish. Closure needs ownership review.');
  }
  const statements = [];
  if (retained.has('registrations')) statements.push(db.prepare("UPDATE registrations SET status='closed',parish_name=NULL,community_type=NULL,data=json_object('parishId',parish_id,'status','closed'),updated_at=? WHERE parish_id=?").bind(new Date().toISOString(),job.parish_id));
  for (const table of ordered) {
    let where = tableScope(table.name, quoted(table.name));
    if (table.name === 'directory_people') where += ` AND NOT EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id=directory_people.id) AND NOT EXISTS(SELECT 1 FROM directory_parish_affiliations a WHERE a.person_id=directory_people.id AND a.parish_id<>?1) AND NOT EXISTS(SELECT 1 FROM directory_household_members m JOIN directory_households h ON h.id=m.household_id WHERE m.person_id=directory_people.id AND h.parish_id<>?1)`;
    statements.push(db.prepare(`DELETE FROM ${quoted(table.name)} WHERE ${where}`).bind(job.parish_id));
  }
  const now = Date.now();
  const result = { deletedTables: ordered.map(t => t.name), retainedTables: inventory.filter(t => retained.has(t.name)).map(t => t.name) };
  statements.push(db.prepare("INSERT OR REPLACE INTO parish_portability_steps(job_id,step_key,status,result_json,updated_at) VALUES(?,'central_purge','completed',?,?)").bind(job.id, JSON.stringify(result), now));
  statements.push(db.prepare("UPDATE parish_data_closures SET state='closed',updated_at=? WHERE parish_id=? AND job_id=? AND state='deleting'").bind(now, job.parish_id, job.id));
  return { statements, result };
}

export async function purgeCentralRecords(env, job, inventory) {
  const status = await env.AGAPAY_DB.prepare('SELECT state FROM parish_data_closures WHERE parish_id=? AND job_id=?').bind(job.parish_id, job.id).first();
  if (status?.state !== 'deleting') throw new PortabilityError('closure_not_authorized', 'Deletion has not been authorized.');
  const plan = await planCentralPurge(env, job, inventory);
  // One atomic D1 transaction: failure rolls back all deletes and the terminal state.
  await env.AGAPAY_DB.batch(plan.statements);
  return plan.result;
}
