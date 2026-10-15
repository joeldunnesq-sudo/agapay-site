/** Only the two existing exports consumed by server imports are declared; the shared browser implementation remains JavaScript. */
declare module '*public/parish/directory-import-format.js' {
  export interface DirectoryImportData {
    name: string;
    household: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    relationship: string;
  }
  export interface NormalizedDirectoryImportRow {
    rowNumber: number;
    data: DirectoryImportData;
    errors: string[];
    eligibleForInvitation: boolean;
  }
  export function normalizeImportRows(rows: unknown): NormalizedDirectoryImportRow[];
  export function importNameKey(value: unknown): string;
}
