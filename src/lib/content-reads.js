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
