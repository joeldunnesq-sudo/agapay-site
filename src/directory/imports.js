import { d1All, d1First, d1Run, generateSecret, sha256Hex } from '../lib/core.js';
import { DirectoryServiceError } from './foundation.js';
import { assertParishActor, auditStatement, runAtomic } from './shared.js';
import { createDirectoryInvitation, markDirectoryInvitationSent, revokeDirectoryInvitation } from './invitations.js';
import { normalizeImportRows, importNameKey } from '../../public/parish/directory-import-format.js';
import { deliverDirectorySignupInvitation } from './signup-invitation.js';

export function authorizeDirectoryImport(context, sendInvitations = false) {
  const actor = assertParishActor(context, context.parishId, ['directory.manage']);
  if (sendInvitations) assertParishActor(context, context.parishId, ['directory.invitations.manage']);
  return actor;
}

async function importIds(parishId, data) {
  const [person, household] = await Promise.all([
    sha256Hex(`${parishId}:person:${importNameKey(data.name)}`),
    sha256Hex(`${parishId}:household:${importNameKey(data.household)}`)
  ]);
  return { personId: `dir_import_p_${person}`, householdId: `dir_import_h_${household}` };
}

async function existingDirectory(env, parishId) {
  const [people, contacts, households, addresses] = await Promise.all([
    d1All(env, `SELECT p.id, p.preferred_name FROM directory_people p WHERE p.created_by_parish_id = ?1
      OR EXISTS (SELECT 1 FROM directory_parish_affiliations a WHERE a.person_id = p.id AND a.parish_id = ?1)
      OR EXISTS (SELECT 1 FROM directory_household_members m JOIN directory_households h ON h.id = m.household_id WHERE m.person_id = p.id AND h.parish_id = ?1)`, parishId),
    d1All(env, `SELECT normalized_value FROM directory_contact_methods WHERE parish_id = ?1 AND contact_type = 'email'`, parishId),
    d1All(env, 'SELECT id, display_name, active FROM directory_households WHERE parish_id = ?1', parishId),
    d1All(env, "SELECT owner_id, line1, city, region, postal_code, country FROM directory_addresses WHERE parish_id = ?1 AND owner_type = 'household' AND active = 1", parishId)
  ]);
  return {
    people: new Set(people.map((p) => importNameKey(p.preferred_name))),
    personIds: new Set(people.map((p) => p.id)),
    emails: new Set(contacts.map((c) => c.normalized_value.toLowerCase())),
    households, addresses
  };
}

function duplicateReason(row, existing) {
  if (existing.personIds.has(row.personId)) return 'This contact was imported previously. Review the existing record; no changes made.';
  if (row.data.email && existing.emails.has(row.data.email)) return 'Email already exists in this parish. Review the existing record; no changes made.';
  if (existing.people.has(importNameKey(row.data.name))) return 'Name already exists in this parish. Review the possible match; no changes made.';
  if (existing.households.some((h) => importNameKey(h.display_name) === importNameKey(row.data.household) && (h.id !== row.householdId || !h.active))) return 'Household already exists. Add members through household review; no automatic merge.';
  if (existing.households.some((h) => h.id === row.householdId && (!h.active || importNameKey(h.display_name) !== importNameKey(row.data.household)))) return 'This imported household has changed. Review it manually before adding members.';
  if (row.data.address && existing.addresses.some((a) => a.owner_id === row.householdId && addressKey({ address: a.line1, city: a.city, state: a.region, postalCode: a.postal_code, country: a.country }) !== addressKey(row.data))) return 'The household has a different address. Review it manually; no changes made.';
  return '';
}

function addressKey(data) {
  return [data.address, '', data.city, data.state, data.postalCode, data.country || 'US'].map(importNameKey).join('|');
}

export async function previewDirectoryImport(env, { context, rows }) {
  authorizeDirectoryImport(context);
  let normalized;
  try { normalized = normalizeImportRows(rows); }
  catch (error) { throw new DirectoryServiceError('validation_failed', error.message, 422); }
  const existing = await existingDirectory(env, context.parishId);
  const emailCounts = new Map(), nameCounts = new Map();
  const householdAddresses = new Map();
  for (const row of normalized) {
    if (row.data.email) emailCounts.set(row.data.email, (emailCounts.get(row.data.email) || 0) + 1);
    const key = importNameKey(row.data.name);
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
    const household = importNameKey(row.data.household);
    if (row.data.address) {
      if (!householdAddresses.has(household)) householdAddresses.set(household, new Set());
      householdAddresses.get(household).add(addressKey(row.data));
    }
  }
  const preview = [];
  for (const row of normalized) {
    const ids = await importIds(context.parishId, row.data);
    let message = row.errors.join(' ');
    let status = message ? 'invalid' : 'pending';
    if (householdAddresses.get(importNameKey(row.data.household))?.size > 1) {
      message = 'This household has conflicting addresses in the file. Resolve them before importing.';
      status = 'invalid';
    }
    if (!message && ((row.data.email && emailCounts.get(row.data.email) > 1) || nameCounts.get(importNameKey(row.data.name)) > 1)) {
      message = 'Repeated name or shared email in this file. Use one adult per email and resolve possible duplicates first.';
      status = 'skipped';
    }
    if (!message) { message = duplicateReason({ ...row, ...ids }, existing); if (message) status = 'skipped'; }
    preview.push({ rowNumber: row.rowNumber, data: row.data, ...ids, status, message, eligibleForInvitation: row.eligibleForInvitation });
  }
  const hash = await sha256Hex(JSON.stringify(preview));
  return { rows: preview, hash, summary: summarize(preview), emailConfigured: !!String(env.RESEND_API_KEY || '').trim() };
}

function summarize(rows) {
  const count = (status) => rows.filter((r) => r.status === status).length;
  return { total: rows.length, ready: count('pending'), imported: count('imported'), skipped: count('skipped'), invalid: count('invalid'),
    invitations: rows.filter((r) => r.status === 'pending' && r.eligibleForInvitation).length,
    sent: rows.filter((r) => r.email_status === 'sent').length, failed: rows.filter((r) => r.email_status === 'failed').length,
    uncertain: rows.filter((r) => ['sending', 'unknown'].includes(r.email_status)).length };
}

export async function startDirectoryImport(env, { context, rows, previewHash, filename, sendInvitations, confirmed, requestKey }) {
  const actor = authorizeDirectoryImport(context, sendInvitations === true);
  if (confirmed !== true || typeof sendInvitations !== 'boolean') throw new DirectoryServiceError('confirmation_required', 'Confirm the reviewed import and invitation choice.', 422);
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestKey || '')) throw new DirectoryServiceError('validation_failed', 'A valid import request key is required.', 422);
  const prior = await d1First(env, 'SELECT id FROM directory_import_batches WHERE parish_id = ?1 AND request_key = ?2', context.parishId, requestKey);
  if (prior) return getDirectoryImport(env, { context, id: prior.id });
  if (sendInvitations && !String(env.RESEND_API_KEY || '').trim()) throw new DirectoryServiceError('email_unavailable', 'Email delivery is not configured. Choose import without invitations or contact AGAPAY support.', 503);
  const preview = await previewDirectoryImport(env, { context, rows });
  if (preview.hash !== previewHash) throw new DirectoryServiceError('preview_changed', 'Directory records or file contents changed. Preview again before importing.', 409);
  if (!preview.summary.ready) throw new DirectoryServiceError('nothing_to_import', 'There are no new valid contacts to import.', 422);
  const id = generateSecret('dir_import');
  const now = Date.now();
  const storedRows = preview.rows.map((r) => ({ ...r, emailStatus: sendInvitations && r.status === 'pending' ? (r.eligibleForInvitation ? 'pending' : 'ineligible') : 'not_requested' }));
  await runAtomic(env, [
    { sql: 'INSERT INTO directory_import_batches (id, parish_id, created_by, filename, send_invitations, request_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params: [id, context.parishId, actor.userId, String(filename || 'Directory import').replace(/[\u0000-\u001f]/g, '').slice(0, 160), sendInvitations ? 1 : 0, requestKey, now, now] },
    { sql: `INSERT INTO directory_import_rows (batch_id, row_number, data_json, status, message, email_status)
        SELECT ?1, json_extract(value, '$.rowNumber'), json_extract(value, '$.data'), json_extract(value, '$.status'), json_extract(value, '$.message'), json_extract(value, '$.emailStatus') FROM json_each(?2)`, params: [id, JSON.stringify(storedRows)] },
    auditStatement({ action: 'directory.import.confirmed', actor, parishId: context.parishId, targetType: 'directory_import', targetId: id, metadata: { rows: preview.summary.ready, sendInvitations } })
  ]);
  return getDirectoryImport(env, { context, id });
}

export async function getDirectoryImport(env, { context, id }) {
  authorizeDirectoryImport(context);
  const batch = await d1First(env, 'SELECT * FROM directory_import_batches WHERE id = ?1 AND parish_id = ?2', id, context.parishId);
  if (!batch) throw new DirectoryServiceError('not_found', 'Import not found for this parish.', 404);
  const rows = await d1All(env, 'SELECT * FROM directory_import_rows WHERE batch_id = ?1 ORDER BY row_number', id);
  return { id: batch.id, filename: batch.filename, sendInvitations: !!batch.send_invitations, createdAt: batch.created_at, summary: summarize(rows),
    hasPending: rows.some((r) => r.status === 'pending' || r.email_status === 'pending'),
    rows: rows.map((r) => ({ rowNumber: r.row_number, name: JSON.parse(r.data_json).name, email: JSON.parse(r.data_json).email, status: r.status, message: r.message, emailStatus: r.email_status, personId: r.person_id })) };
}

export async function listDirectoryImports(env, { context }) {
  authorizeDirectoryImport(context);
  return d1All(env, `SELECT b.id, b.filename, b.created_at AS createdAt,
    (SELECT COUNT(*) FROM directory_import_rows r WHERE r.batch_id = b.id AND (r.status = 'pending' OR r.email_status = 'pending')) AS pending
    FROM directory_import_batches b WHERE b.parish_id = ?1 ORDER BY b.created_at DESC LIMIT 10`, context.parishId);
}

async function createImportedContact(env, { context, batchId, row, existing }) {
  const data = JSON.parse(row.data_json);
  const { personId, householdId } = await importIds(context.parishId, data);
  const duplicate = duplicateReason({ data, personId, householdId }, existing);
  if (duplicate) {
    await d1Run(env, "UPDATE directory_import_rows SET status = 'skipped', message = ?1, email_status = 'not_requested' WHERE batch_id = ?2 AND row_number = ?3", duplicate, batchId, row.row_number);
    return null;
  }
  const now = Date.now(), parishId = context.parishId;
  const statements = [
    { sql: `INSERT INTO directory_people (id, created_by_parish_id, preferred_name, active, deceased, created_at, updated_at) VALUES (?, ?, ?, 1, 0, ?, ?)`, params: [personId, parishId, data.name, now, now] },
    { sql: `INSERT INTO directory_households (id, parish_id, display_name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING`, params: [householdId, parishId, data.household, now, now] },
    { sql: `INSERT INTO directory_household_members (id, household_id, person_id, relationship, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`, params: [generateSecret('dir_hm'), householdId, personId, data.relationship, now, now] },
    { sql: `INSERT INTO directory_parish_affiliations (id, person_id, parish_id, status, active, created_at, updated_at) VALUES (?, ?, ?, 'member', 1, ?, ?)`, params: [generateSecret('dir_aff'), personId, parishId, now, now] },
    { sql: `INSERT INTO directory_person_privacy_flags (id, parish_id, person_id, is_child, protected_person, active, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 1, ?, ?)`, params: [generateSecret('dir_priv'), parishId, personId, data.relationship === 'child' ? 1 : 0, now, now] }
  ];
  for (const type of ['person', 'household']) statements.push({
    sql: `INSERT INTO directory_publication_profiles (id, parish_id, owner_type, owner_id, status, approval_status, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', 'not_submitted', 1, ?, ?) ON CONFLICT(parish_id, owner_type, owner_id) DO NOTHING`,
    params: [generateSecret('dir_pub'), parishId, type, type === 'person' ? personId : householdId, now, now]
  });
  for (const [type, value] of [['email', data.email], ['phone', data.phone]]) if (value) statements.push({
    sql: `INSERT INTO directory_contact_methods (id, parish_id, owner_type, owner_id, contact_type, label, value, normalized_value, is_primary, verified, visibility, active, created_at, updated_at) VALUES (?, ?, 'person', ?, ?, ?, ?, ?, 1, 0, 'private', 1, ?, ?)`,
    params: [generateSecret('dir_contact'), parishId, personId, type, type === 'email' ? 'personal' : 'home', value, type === 'email' ? value : value.replace(/\D/g, ''), now, now]
  });
  if (data.address) statements.push({
    sql: `INSERT INTO directory_addresses (id, parish_id, owner_type, owner_id, address_type, line1, city, region, postal_code, country, normalized_value, is_primary, visibility, active, created_at, updated_at) VALUES (?, ?, 'household', ?, 'residential', ?, ?, ?, ?, ?, ?, 1, 'private', 1, ?, ?) ON CONFLICT(id) DO NOTHING`,
    params: [`${householdId}_address`, parishId, householdId, data.address, data.city, data.state, data.postalCode, data.country, addressKey(data), now, now]
  });
  statements.push(
    { sql: `UPDATE directory_import_rows SET status = 'imported', person_id = ?1, household_id = ?2 WHERE batch_id = ?3 AND row_number = ?4 AND status = 'pending'`, params: [personId, householdId, batchId, row.row_number] },
    auditStatement({ action: 'directory.import.contact_created', actor: context, parishId, targetType: 'directory_person', targetId: personId, householdId, metadata: { batchId, rowNumber: row.row_number } })
  );
  await runAtomic(env, statements);
  existing.people.add(importNameKey(data.name));
  existing.personIds.add(personId);
  if (data.email) existing.emails.add(data.email);
  return { ...row, person_id: personId, household_id: householdId, status: 'imported' };
}

async function sendImportedInvitation(env, { context, row, batchId, parishName }) {
  const data = JSON.parse(row.data_json);
  // Reserve before external I/O. A crash here must never silently resend email.
  await d1Run(env, "UPDATE directory_import_rows SET email_status = 'sending' WHERE batch_id = ?1 AND row_number = ?2", batchId, row.row_number);
  let created;
  try {
    if (row.invitation_id) await revokeDirectoryInvitation(env, { actor: context, parishId: context.parishId, invitationId: row.invitation_id });
    created = await createDirectoryInvitation(env, { actor: context, parishId: context.parishId, invitationType: 'person_claim', intendedPersonId: row.person_id, intendedAuthority: 'link_person', recipientEmail: data.email, recipientLabel: data.name, correlationId: batchId });
    await d1Run(env, 'UPDATE directory_import_rows SET invitation_id = ?1 WHERE batch_id = ?2 AND row_number = ?3', created.invitation.id, batchId, row.row_number);
    const delivery = await deliverDirectorySignupInvitation(env, { email: data.email, name: data.name, parishName, rawToken: created.rawToken, invitationId: created.invitation.id });
    // Pace bulk invitations instead of bursting requests at the shared provider.
    // Other application traffic can still cause a rejection, which stays visible.
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (delivery.status === 'sent') {
      await markDirectoryInvitationSent(env, { actor: context, parishId: context.parishId, invitationId: created.invitation.id, correlationId: batchId });
      await d1Run(env, "UPDATE directory_import_rows SET email_status = 'sent', message = '' WHERE batch_id = ?1 AND row_number = ?2", batchId, row.row_number);
    } else {
      const status = delivery.status === 'error' ? 'unknown' : 'failed';
      await d1Run(env, 'UPDATE directory_import_rows SET email_status = ?1, message = ?2 WHERE batch_id = ?3 AND row_number = ?4', status,
        status === 'unknown' ? 'Delivery could not be confirmed. Review the invitation before resending.' : 'Invitation was not accepted by the email provider. The directory record was imported.', batchId, row.row_number);
    }
  } catch {
    // Do not leak provider details, addresses, tokens, or database messages.
    await d1Run(env, "UPDATE directory_import_rows SET email_status = 'unknown', message = 'Invitation needs staff review before resending.' WHERE batch_id = ?1 AND row_number = ?2", batchId, row.row_number);
  }
}

export async function processDirectoryImport(env, { context, id, retryFailed = false, parishName = 'Your parish' }) {
  const batch = await getDirectoryImport(env, { context, id });
  authorizeDirectoryImport(context, batch.sendInvitations);
  const token = generateSecret('dir_lease'), now = Date.now();
  const lease = await d1First(env, `INSERT INTO directory_import_leases (parish_id, token, expires_at) VALUES (?1, ?2, ?3)
    ON CONFLICT(parish_id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at WHERE directory_import_leases.expires_at < ?4 RETURNING token`, context.parishId, token, now + 120000, now);
  if (!lease) throw new DirectoryServiceError('import_busy', 'Another import is processing for this parish. Try again shortly.', 409);
  try {
    // Includes older batches abandoned during an external email request.
    await d1Run(env, `UPDATE directory_import_rows SET email_status = 'unknown', message = 'Delivery interrupted. Review the invitation before resending.'
      WHERE email_status = 'sending' AND batch_id IN (SELECT id FROM directory_import_batches WHERE parish_id = ?1)`, context.parishId);
    if (retryFailed === true) {
      await runAtomic(env, [
        { sql: "UPDATE directory_import_rows SET email_status = 'pending', message = '' WHERE batch_id = ?1 AND status = 'imported' AND email_status = 'failed'", params: [id] },
        auditStatement({ action: 'directory.import.retry_requested', actor: context, parishId: context.parishId, targetType: 'directory_import', targetId: id })
      ]);
    }
    const pending = await d1All(env, "SELECT * FROM directory_import_rows WHERE batch_id = ?1 AND (status = 'pending' OR (status = 'imported' AND email_status = 'pending')) ORDER BY row_number LIMIT 5", id);
    const existing = await existingDirectory(env, context.parishId);
    for (let row of pending) {
      if (Date.now() > now + 60000) break; // never start another row near lease expiry
      if (row.status === 'pending') row = await createImportedContact(env, { context, batchId: id, row, existing });
      if (row?.email_status === 'pending') await sendImportedInvitation(env, { context, row, batchId: id, parishName });
    }
    await d1Run(env, 'UPDATE directory_import_batches SET updated_at = ?1 WHERE id = ?2', Date.now(), id);
    return getDirectoryImport(env, { context, id });
  } finally {
    await d1Run(env, 'DELETE FROM directory_import_leases WHERE parish_id = ?1 AND token = ?2', context.parishId, token);
  }
}
