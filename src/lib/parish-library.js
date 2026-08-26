export async function getParishLibrarySettings(db, parishId) {
  if (!db || !parishId) return { enabled: false, updatedAt: "" };
  const row = await db.prepare("SELECT enabled, updated_at FROM parish_library_settings WHERE parish_id = ?")
    .bind(parishId).first();
  return { enabled: Boolean(row?.enabled), updatedAt: row?.updated_at || "" };
}

export async function setParishLibraryEnabled(db, { parishId, enabled, updatedBy }) {
  await db.prepare(`
    INSERT INTO parish_library_settings (parish_id, enabled, updated_by, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(parish_id) DO UPDATE SET
      enabled = excluded.enabled,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).bind(parishId, enabled ? 1 : 0, updatedBy || null).run();
  return getParishLibrarySettings(db, parishId);
}
