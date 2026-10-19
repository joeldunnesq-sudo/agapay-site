// D1 row contracts follow the existing NOT NULL TEXT columns. They describe query
// results; they do not validate arbitrary JSON or change database constraints.
export interface ContentReadScope {
  parishId: string;
  contentType: string;
  contentId: string;
}
export interface MarkContentReadInput extends ContentReadScope {
  donorId: string;
}
export interface ContentReadQuery {
  parishId: string;
  contentType: string;
  donorId: string;
  contentIds: readonly string[];
}
export interface ReadReceipt {
  donorId: string;
  readAt: string;
}
interface ContentIdRow {
  content_id: string;
}
interface ReadReceiptRow {
  donor_id: string;
  read_at: string;
}
export type ContentReadsDatabase = Pick<D1Database, 'prepare'>;

export async function markContentRead(
  db: ContentReadsDatabase,
  { parishId, contentType, contentId, donorId }: MarkContentReadInput
): Promise<void> {
  await db
    .prepare(
      `
      INSERT OR IGNORE INTO parish_content_reads (
        parish_id,
        content_type,
        content_id,
        donor_id
      ) VALUES (?, ?, ?, ?)
    `
    )
    .bind(parishId, contentType, contentId, donorId)
    .run();
}

export async function getReadContentIds(
  db: ContentReadsDatabase,
  { parishId, contentType, donorId, contentIds }: ContentReadQuery
): Promise<string[]> {
  if (!contentIds.length) return [];

  const placeholders = contentIds.map(() => '?').join(', ');
  const result = await db
    .prepare(
      `
      SELECT content_id
      FROM parish_content_reads
      WHERE parish_id = ?
        AND content_type = ?
        AND donor_id = ?
        AND content_id IN (${placeholders})
    `
    )
    .bind(parishId, contentType, donorId, ...contentIds)
    .all<ContentIdRow>();

  return (result.results || []).map(({ content_id: contentId }) => contentId);
}

export async function getReadReceipts(
  db: ContentReadsDatabase,
  { parishId, contentType, contentId }: ContentReadScope
): Promise<ReadReceipt[]> {
  const result = await db
    .prepare(
      `
      SELECT donor_id, read_at
      FROM parish_content_reads
      WHERE parish_id = ?
        AND content_type = ?
        AND content_id = ?
      ORDER BY read_at ASC, donor_id ASC
    `
    )
    .bind(parishId, contentType, contentId)
    .all<ReadReceiptRow>();

  return (result.results || []).map(({ donor_id: donorId, read_at: readAt }) => ({
    donorId,
    readAt,
  }));
}

export async function deleteContentReads(
  db: ContentReadsDatabase,
  { parishId, contentType, contentId }: ContentReadScope
): Promise<void> {
  await db
    .prepare(
      `
      DELETE FROM parish_content_reads
      WHERE parish_id = ? AND content_type = ? AND content_id = ?
    `
    )
    .bind(parishId, contentType, contentId)
    .run();
}
