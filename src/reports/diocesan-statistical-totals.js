const FIELDS = ['baptism', 'chrismation', 'wedding', 'funeral', 'catechumensMade', 'people', 'households'];

export function validateStatisticalTotals(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Provide additional annual counts as an object.');
  }
  const totals = {};
  for (const [field, value] of Object.entries(input)) {
    if (!FIELDS.includes(field)) throw new Error('Unknown annual count.');
    if (value === null || value === '') continue;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 1000000) {
      throw new Error('Additional counts must be whole numbers between 0 and 1,000,000.');
    }
    totals[field] = value;
  }
  return totals;
}

export async function saveStatisticalTotals(env, parishId, year, input) {
  const totals = validateStatisticalTotals(input);
  await env.AGAPAY_DB.prepare(
    `
    INSERT INTO parish_diocesan_statistical_totals (parish_id, reporting_year, totals_json)
    VALUES (?, ?, ?)
    ON CONFLICT(parish_id, reporting_year) DO UPDATE SET
      totals_json = excluded.totals_json, updated_at = datetime('now')
  `
  )
    .bind(parishId, year, JSON.stringify(totals))
    .run();
  return totals;
}

export async function applyStatisticalTotals(env, parishId, report) {
  const row = await env.AGAPAY_DB.prepare(
    `
    SELECT totals_json FROM parish_diocesan_statistical_totals
    WHERE parish_id = ? AND reporting_year = ?
  `
  )
    .bind(parishId, report.year)
    .first();
  const manualAdditions = row ? validateStatisticalTotals(JSON.parse(row.totals_json)) : {};
  const automaticTotals = {};
  for (const field of FIELDS) {
    const section = ['baptism', 'chrismation', 'wedding', 'funeral'].includes(field)
      ? report.sacraments
      : report.membership;
    automaticTotals[field] = section[field];
    if (Object.hasOwn(manualAdditions, field)) section[field] += manualAdditions[field];
  }
  report.sacraments.total = ['baptism', 'chrismation', 'wedding', 'funeral'].reduce(
    (total, field) => total + report.sacraments[field],
    0
  );
  return { ...report, automaticTotals, manualAdditions };
}
