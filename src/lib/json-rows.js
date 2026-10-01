// Generated from src/lib/json-rows.ts by npm run build:server. Do not edit.
function parseJsonRow(row) {
  if (!row?.data) return null;
  return JSON.parse(row.data);
}
function safeParseJsonRow(row) {
  try {
    return parseJsonRow(row);
  } catch {
    return null;
  }
}
export { parseJsonRow, safeParseJsonRow };
