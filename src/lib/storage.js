// Generated from src/lib/storage.ts by npm run build:server. Do not edit.
function parseJsonRow(row) {
  if (!row?.data) return null;
  return JSON.parse(`${row.data}`);
}
function safeParseJsonRow(row) {
  try {
    return parseJsonRow(row);
  } catch {
    return null;
  }
}
import { d1, d1First, d1All } from './database-reads.js';
import { listKvKeys } from './kv-reads.js';
import { d1Run, d1Batch } from './core.js';
export { d1, d1All, d1Batch, d1First, d1Run, listKvKeys, parseJsonRow, safeParseJsonRow };
