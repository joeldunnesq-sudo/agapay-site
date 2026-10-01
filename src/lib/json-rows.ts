// JSON parsing preserves existing behavior; returned data has not been validated.
export interface JsonStorageRow {
  readonly data?: string | null;
}

export function parseJsonRow(row: JsonStorageRow | null | undefined): unknown {
  if (!row?.data) return null;
  return JSON.parse(row.data);
}

export function safeParseJsonRow(row: JsonStorageRow | null | undefined): unknown {
  try {
    return parseJsonRow(row);
  } catch {
    return null;
  }
}
