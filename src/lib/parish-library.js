export const ST_FIACRE_LIBRARY_DEMO_PARISH_ID = "st-fiacre";

export const ST_FIACRE_LIBRARY_DEMO_RESOURCES = Object.freeze([
  {
    id: "demo_library_st_fiacre_liturgical_texts",
    title: "Orthodox Liturgical Texts & Resources",
    description: "A curated index of public service texts and liturgical resources from St. Jonah Orthodox Church.",
    category: "prayer_worship",
    url: "https://saintjonah.org/services/",
    pinned: true,
  },
  {
    id: "demo_library_st_fiacre_reader_horologion",
    title: "Reader Service Horologion",
    description: "Public reader-service texts for prayer when a priest is not present, provided by St. Jonah Orthodox Church.",
    category: "prayer_worship",
    url: "https://www.saintjonah.org/services/horologion.htm",
    pinned: true,
  },
  {
    id: "demo_library_st_fiacre_annual_cycles",
    title: "Annual Liturgical Cycles: Parish Preparation",
    description: "A practical guide to preparing parish life for major feasts and fasting seasons, from St. Jonah Orthodox Church.",
    category: "parish_life",
    url: "https://saintjonah.org/annual-liturgical-cycles-and-what-needs-to-be-done-to-prepare-for-them/",
    pinned: true,
  },
  {
    id: "demo_library_st_fiacre_communion",
    title: "Who Can Receive Holy Communion?",
    description: "An introduction to Orthodox preparation for and participation in Holy Communion from St. Jonah Orthodox Church.",
    category: "faith_formation",
    url: "https://saintjonah.org/who-can-receive-communion/",
    pinned: false,
  },
  {
    id: "demo_library_st_fiacre_building_library",
    title: "Building a Liturgical Library",
    description: "Practical guidance for assembling useful Orthodox prayer and service books, from St. Jonah Orthodox Church.",
    category: "faith_formation",
    url: "https://saintjonah.org/building-a-liturgical-library/",
    pinned: false,
  },
  {
    id: "demo_library_st_fiacre_membership",
    title: "Becoming a Parish Member",
    description: "An example of how St. Jonah Orthodox Church explains parish membership and participation to newcomers.",
    category: "newcomers",
    url: "https://saintjonah.org/how-to-become-a-member-of-this-parish/",
    pinned: false,
  },
  {
    id: "demo_library_st_fiacre_mission_parish",
    title: "Starting a Mission and Building a Parish",
    description: "Reflections and practical guidance for forming and strengthening an Orthodox mission, from St. Jonah Orthodox Church.",
    category: "ministries",
    url: "https://saintjonah.org/starting-a-mission-and-building-a-parish/",
    pinned: false,
  },
]);

export async function ensureStFiacreParishLibraryDemo(db, parishId) {
  if (!db || String(parishId || "").trim().toLowerCase() !== ST_FIACRE_LIBRARY_DEMO_PARISH_ID) return false;
  const existing = await db.prepare(`
    SELECT id FROM parish_library_resources
    WHERE parish_id = ? AND id LIKE 'demo_library_st_fiacre_%'
    LIMIT 1
  `).bind(ST_FIACRE_LIBRARY_DEMO_PARISH_ID).first();
  if (existing) return false;

  const seededAt = "2026-08-27T12:00:00.000Z";
  const seededBy = "system:st-fiacre-library-demo";
  await db.prepare(`
    INSERT INTO parish_library_settings (parish_id, enabled, updated_by, updated_at)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(parish_id) DO UPDATE SET
      enabled = 1,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).bind(ST_FIACRE_LIBRARY_DEMO_PARISH_ID, seededBy, seededAt).run();

  for (const [index, resource] of ST_FIACRE_LIBRARY_DEMO_RESOURCES.entries()) {
    const publishedAt = new Date(Date.parse(seededAt) - (index * 60_000)).toISOString();
    await db.prepare(`
      INSERT OR IGNORE INTO parish_library_resources
        (id, parish_id, title, description, category, resource_type, external_url, status,
         pinned, published_at, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'link', ?, 'published', ?, ?, ?, ?, ?)
    `).bind(
      resource.id,
      ST_FIACRE_LIBRARY_DEMO_PARISH_ID,
      resource.title,
      resource.description,
      resource.category,
      resource.url,
      resource.pinned ? 1 : 0,
      publishedAt,
      seededBy,
      publishedAt,
      publishedAt,
    ).run();
  }
  return true;
}

export async function getParishLibrarySettings(db, parishId) {
  if (!db || !parishId) return { enabled: false, updatedAt: "" };
  await ensureStFiacreParishLibraryDemo(db, parishId);
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
