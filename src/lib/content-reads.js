export async function markContentRead(db, { parishId, contentType, contentId, donorId }) {
  await db
    .prepare(`
      INSERT OR IGNORE INTO parish_content_reads (
        parish_id,
        content_type,
        content_id,
        donor_id
      ) VALUES (?, ?, ?, ?)
    `)
    .bind(parishId, contentType, contentId, donorId)
    .run();
}

export async function getReadContentIds(db, { parishId, contentType, donorId, contentIds }) {
  if (!contentIds.length) return [];

  const placeholders = contentIds.map(() => "?").join(", ");
  const result = await db
    .prepare(`
      SELECT content_id
      FROM parish_content_reads
      WHERE parish_id = ?
        AND content_type = ?
        AND donor_id = ?
        AND content_id IN (${placeholders})
    `)
    .bind(parishId, contentType, donorId, ...contentIds)
    .all();

  return (result.results || []).map(({ content_id: contentId }) => contentId);
}

export async function getReadReceipts(db, { parishId, contentType, contentId }) {
  const result = await db
    .prepare(`
      SELECT donor_id, read_at
      FROM parish_content_reads
      WHERE parish_id = ?
        AND content_type = ?
        AND content_id = ?
      ORDER BY read_at ASC, donor_id ASC
    `)
    .bind(parishId, contentType, contentId)
    .all();

  return (result.results || []).map(({ donor_id: donorId, read_at: readAt }) => ({
    donorId,
    readAt,
  }));
}
