// Page-owned preparation, recovery and directory import browser contracts.
interface ParishPreparationItem {
  id: string;
  itemType: string;
  title: string;
  description?: string;
  required?: boolean;
}
interface ParishPreparationTemplate {
  sacramentType: string;
  title?: string;
  introduction?: string;
  canonicalNote?: string;
  requirementsNotice?: string;
  version?: number;
  items?: ParishPreparationItem[];
  guides?: { id: string; displayName: string; fileSize?: number }[];
}
declare let sacramentsState: {
  preparationTemplates: ParishPreparationTemplate[];
  preparationDocumentsConfigured?: boolean;
};
declare function sacramentTypeLabel(input: { sacramentType: string }): string;
declare function sacramentsApi(path: string): string;
declare function renderSacramentsPanel(): void;
declare function loadSacramentsPanel(force?: boolean): Promise<void>;
interface ParishRecoveryOperation {
  id: string;
  scope: 'parish' | 'accounting';
  kind: 'backup' | 'restore';
  status: string;
  phase: string;
  canCancel?: boolean;
}
interface ParishRecoveryState {
  error?: string;
  enabled: boolean;
  snapshots: { id: string; createdAt: string; verifiedAt?: string; expiresAt: string; kind: string }[];
  operation: ParishRecoveryOperation;
  disclosure: string;
}
interface ParishRecoveryControls {
  download: HTMLButtonElement;
  backup: HTMLButtonElement;
  restore: HTMLButtonElement;
  resume: HTMLButtonElement;
  rollback: HTMLButtonElement;
  cancel: HTMLButtonElement;
  refresh: HTMLButtonElement;
  latest: HTMLElement;
  disclosure: HTMLElement;
  status: HTMLElement;
}
interface ParishRecoveryApi {
  mount(context: ParishPortabilityContext & { element: HTMLElement; scope?: 'parish' | 'accounting' }): void;
  openAccounting(context: ParishPortabilityContext): void;
}
interface DirectoryImportControls {
  Status: HTMLElement;
  Review: HTMLElement;
  Results: HTMLElement;
  Confirm: HTMLInputElement;
  Pause: HTMLButtonElement;
  Close: HTMLButtonElement;
  File: HTMLInputElement;
  Sheet: HTMLSelectElement;
  Preview: HTMLButtonElement;
  Start: HTMLButtonElement;
  Resume: HTMLButtonElement;
  Retry: HTMLButtonElement;
  Report: HTMLButtonElement;
  Template: HTMLButtonElement;
  Mapping: HTMLElement;
  SheetLabel: HTMLElement;
  Columns: HTMLElement;
  Summary: HTMLElement;
  Rows: HTMLElement;
  Email: HTMLInputElement;
  EmailNote: HTMLElement;
  Progress: HTMLElement;
  ResultRows: HTMLElement;
  History: HTMLElement;
}
interface DirectoryImportConfig {
  api(path: string): string;
  headers(): Record<string, string>;
  onChange?(): unknown;
}
interface DirectoryImportTable {
  headers: string[];
  rows: unknown[][];
}
interface DirectoryWorkbookResult {
  error?: string;
  records: unknown[][];
  sheetNames: string[];
  sheetName: string;
}
interface DirectoryImportFormat {
  IMPORT_MAX_FILE_BYTES: number;
  IMPORT_FIELDS: readonly [string, string, readonly string[]][];
  directoryImportTable(records: unknown[][]): DirectoryImportTable;
  parseDirectoryCsv(text: string): DirectoryImportTable;
  suggestImportMapping(headers: string[]): Record<string, number>;
  mapImportRows(table: DirectoryImportTable, mapping: Record<string, number>): Record<string, string>[];
}
interface DirectoryImportPreview {
  summary: { ready: number; skipped: number; invalid: number; invitations: number };
  rows: {
    rowNumber: number;
    data: { name: string; household: string; email?: string };
    message?: string;
    eligibleForInvitation?: boolean;
  }[];
  hash: string;
  emailConfigured?: boolean;
}
interface DirectoryImportBatch {
  id: string;
  filename: string;
  hasPending: boolean;
  summary: {
    imported: number;
    ready: number;
    skipped: number;
    invalid: number;
    sent: number;
    failed: number;
    uncertain: number;
  };
  rows: { rowNumber: number; name: string; email: string; status: string; emailStatus: string; message?: string }[];
}
interface DirectoryImportResponse {
  message?: string;
  error?: string;
  ok?: boolean;
  preview: DirectoryImportPreview;
  batch: DirectoryImportBatch;
  imports: { id: string; filename: string; createdAt: string; pending?: boolean }[];
}
interface Window {
  DirectoryImport: { open(options: DirectoryImportConfig): Promise<void> };
}
declare module '*parish/directory-import-format.js' {
  const format: DirectoryImportFormat;
  export = format;
}

interface ParishGivingOption {
  raisedCents?: number;
  giftCount?: number;
  status?: string;
  coverPhotoUrl?: string;
  photos?: (string | { url: string; key: string })[];
  endsAt?: string;
  createdAt?: string;
  updates?: { id: string; date: string; body: string }[];
}
interface ParishCampaignResponse {
  error?: string;
  url: string;
  key: string;
  campaigns?: ParishGivingOption[];
}

interface Window {
  SacramentPastoralFollowUp: { load(force?: boolean): Promise<void>; render(): string; reset(): void };
  renderSacramentsPanel(): void;
  setSacramentsDashboardTab(tab: string): void;
}
