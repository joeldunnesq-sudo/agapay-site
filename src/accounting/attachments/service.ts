export interface AttachmentActor {
  id?: string;
  type?: string;
  capabilities?: readonly string[];
}
export interface AttachmentOptions {
  actor: AttachmentActor;
  entitlementTier?: unknown;
  entityType: string;
  entityId: string;
}
export interface AttachmentInput extends AttachmentOptions {
  displayName: unknown;
  storageKey: string;
  mimeType: string;
  sizeBytes: unknown;
  sha256Hex: string;
}
interface AttachmentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  display_name: string;
  mime_type: string;
  size_bytes: number;
  sha256_hex: string;
  storage_status: string;
  uploaded_by_actor_type: string;
  uploaded_by_actor_id: string;
  created_at: string;
  deleted_at: string | null;
  version: number;
}
import { AccountingDatabaseError, ValidationError } from '../errors.js';

const ENTITY_TABLES = Object.freeze({
  journal_entry: 'accounting_journal_entries',
  bill: 'accounting_bills',
  reconciliation_session: 'accounting_reconciliation_sessions',
});

function capability(actor: AttachmentActor | null | undefined, required: string) {
  if (!actor?.id || !actor.capabilities?.includes(required))
    throw new AccountingDatabaseError('Accounting attachment capability is required.', {
      details: { capability: required },
    });
}
async function first<T = AttachmentRow>(db: D1Database, sql: string, ...params: unknown[]) {
  return db
    .prepare(sql)
    .bind(...params)
    .first<T>();
}
async function all(db: D1Database, sql: string, ...params: unknown[]) {
  return (
    (
      await db
        .prepare(sql)
        .bind(...params)
        .all<AttachmentRow>()
    ).results || []
  );
}
async function run(db: D1Database, sql: string, ...params: unknown[]) {
  return db
    .prepare(sql)
    .bind(...params)
    .run();
}
function text(value: unknown) {
  return String(value ?? '').trim();
}
function dto(row: AttachmentRow | null) {
  return (
    row &&
    Object.freeze({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      displayName: row.display_name,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      sha256Hex: row.sha256_hex,
      storageStatus: row.storage_status,
      uploadedByActorType: row.uploaded_by_actor_type,
      uploadedByActorId: row.uploaded_by_actor_id,
      createdAt: row.created_at,
      deletedAt: row.deleted_at || '',
      version: Number(row.version),
    })
  );
}
async function validateEntity(db: D1Database, entityType: string, entityId: string) {
  const table = ENTITY_TABLES[entityType as keyof typeof ENTITY_TABLES];
  if (!table) throw new ValidationError('Attachment entity type is invalid.');
  if (!text(entityId) || !(await first(db, `SELECT id FROM ${table} WHERE id=?`, entityId)))
    throw new ValidationError("The attachment's accounting record was not found.");
}

export async function listAttachments(
  db: D1Database,
  { actor, entitlementTier, entityType, entityId }: AttachmentOptions
) {
  capability(actor, 'accounting.attachments.view');
  void entitlementTier;
  await validateEntity(db, entityType, entityId);
  return Object.freeze(
    (
      await all(
        db,
        'SELECT * FROM accounting_attachments WHERE entity_type=? AND entity_id=? AND deleted_at IS NULL ORDER BY created_at DESC',
        entityType,
        entityId
      )
    ).map(dto)
  );
}

export async function recordAttachment(
  db: D1Database,
  {
    actor,
    entitlementTier,
    entityType,
    entityId,
    displayName,
    storageKey,
    mimeType,
    sizeBytes,
    sha256Hex,
  }: AttachmentInput
) {
  capability(actor, 'accounting.attachments.manage');
  void entitlementTier;
  await validateEntity(db, entityType, entityId);
  if (
    !text(displayName) ||
    !text(storageKey) ||
    !text(mimeType) ||
    !text(sha256Hex) ||
    !Number.isInteger(Number(sizeBytes)) ||
    Number(sizeBytes) <= 0 ||
    Number(sizeBytes) > 10485760
  )
    throw new ValidationError('Attachment metadata is invalid.');
  const attachmentId = `attachment_${crypto.randomUUID()}`;
  await run(
    db,
    `INSERT INTO accounting_attachments(id,entity_type,entity_id,display_name,storage_key,mime_type,size_bytes,sha256_hex,uploaded_by_actor_type,uploaded_by_actor_id)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
    attachmentId,
    entityType,
    entityId,
    text(displayName),
    storageKey,
    mimeType,
    Number(sizeBytes),
    sha256Hex,
    actor.type || 'platform_user',
    actor.id
  );
  return dto(await first(db, 'SELECT * FROM accounting_attachments WHERE id=?', attachmentId));
}

export async function deleteAttachment(
  db: D1Database,
  {
    actor,
    entitlementTier,
    attachmentId,
    expectedVersion,
  }: { actor: AttachmentActor; entitlementTier?: unknown; attachmentId: string; expectedVersion: unknown }
) {
  capability(actor, 'accounting.attachments.manage');
  void entitlementTier;
  const current = await first(
    db,
    'SELECT * FROM accounting_attachments WHERE id=? AND deleted_at IS NULL',
    attachmentId
  );
  if (!current || Number(current.version) !== Number(expectedVersion))
    throw new AccountingDatabaseError('Attachment changed. Reload and try again.', { details: { conflict: true } });
  const result = await run(
    db,
    "UPDATE accounting_attachments SET storage_status='deleted',deleted_at=datetime('now'),version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL",
    attachmentId,
    Number(expectedVersion)
  );
  if (!result.meta?.changes)
    throw new AccountingDatabaseError('Attachment changed. Reload and try again.', { details: { conflict: true } });
  return dto(await first(db, 'SELECT * FROM accounting_attachments WHERE id=?', attachmentId));
}
