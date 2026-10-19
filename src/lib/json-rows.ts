import { parseJsonRow as parseStoredRow, safeParseJsonRow as safeParseStoredRow } from './storage.js';
export interface JsonStorageRow {
  readonly data?: string | null;
}
export const parseJsonRow: (row: JsonStorageRow | null | undefined) => unknown = parseStoredRow;
export const safeParseJsonRow: (row: JsonStorageRow | null | undefined) => unknown = safeParseStoredRow;
