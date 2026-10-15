/** Configuration read by existing portability/recovery gates; no runtime defaults are supplied. */
export type PortabilityConfiguration = Partial<Env> & {
  PARISH_RETENTION_DISCLOSURE_APPROVED?: string;
  PARISH_RESTORE_QUARANTINE?: string;
  PARISH_LEGACY_INVENTORY_VERIFIED?: string;
  PARISH_BACKUP_EXPIRY_VERIFIED?: string;
  PARISH_PUBLIC_CACHE_POLICY_VERIFIED?: string;
  PARISH_ASSET_CACHE_ZONE_ID?: string;
  PARISH_ASSET_CACHE_PURGE_TOKEN?: string;
};

/** Only the SQL methods used by these services; also implemented by the existing remote D1 facade. */
export interface PortabilityStatement {
  bind(...values: unknown[]): PortabilityStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success?: boolean; meta?: { changes?: number } }>;
}
export interface PortabilityDatabase {
  prepare(sql: string): PortabilityStatement;
  batch(statements: PortabilityStatement[]): Promise<unknown>;
}
export type PortabilityEnvironment = PortabilityConfiguration;
export interface PortabilityJob {
  id: string;
  parish_id: string;
  mode: string;
  policy_version: string;
  confirmed_at: number | null;
  archive_sha256: string;
  manifest_json: string | null;
}
export interface SqlTableColumn {
  name: string;
  pk: number;
  [field: string]: unknown;
}
export interface SqlForeignKey {
  table: string;
  from: string;
  to: string;
  [field: string]: unknown;
}
export type SqlMetadata = SqlTableColumn | SqlForeignKey;
export interface StorageTable {
  name: string;
  columns: string[];
  classification: string;
  scope: string | null;
}
export interface ObjectOwner {
  parish_id: string;
  disposition: string;
  state: string;
  etag: string;
}
export interface LegacyRecord {
  parishId: string;
  kind: string;
  disposition: string;
  data: unknown;
}
export interface LegacyInventoryRecord extends LegacyRecord {
  key: string;
  sourceHash: string;
}
export interface ExportAsset {
  binding: string;
  key: string;
  sources?: string[];
  archivePath?: string;
  etag?: string;
  disposition?: string;
}
export interface ClosureManifest {
  activeLegalHolds?: readonly unknown[];
  assets?: readonly ExportAsset[];
  fileInventoryVerified?: boolean;
  legacyRecords?: readonly Pick<LegacyInventoryRecord, 'key' | 'kind' | 'disposition' | 'sourceHash'>[];
  tables?: readonly { table: string; rowCount: number }[];
  accountingRetentionYears?: number;
}
export interface SuppressionRecord {
  parishId: string;
  jobId: string;
  policyVersion: string;
  confirmedAt: number;
  archiveSha256: string;
  accountingRetentionYears: number;
}
export interface RecoveryOperation {
  id: string;
  parish_id: string;
  scope: string;
  target_id: string | null;
  safety_id: string;
  created_at: number;
  guard_hash: string | null;
}
export interface RecoverySnapshot {
  id: string;
  scope: string;
  kind: string;
  created_at: number;
  verified_at: number | null;
  expires_at: number;
  status: string;
  manifest_json: string;
  manifest_sha256: string;
}
export interface RecoveryTable {
  name: string;
  columns: string[];
  scope: string | null;
  pk: string[];
  rows: Record<string, unknown>[];
}
export interface DatabaseSnapshot {
  schema: string;
  tables: RecoveryTable[];
}
export interface RecoveryFiles {
  files: {
    binding: string;
    key: string;
    body: string;
    hash: string;
    disposition: string;
    httpMetadata: R2HTTPMetadata;
    customMetadata: Record<string, string>;
  }[];
  legacy: { key: string; body: string; disposition: string; kind: string; hash: string }[];
  mirrors?: string[];
}

export interface PortabilityJobRow extends PortabilityJob {
  status: string;
  confirmation_stage: string | null;
  requested_by: string;
  created_at: number;
  expires_at: number;
  completed_at: number | null;
  archive_bytes: number | null;
  archive_key: string | null;
  error_code: string | null;
  manifest_sha256: string | null;
}
export interface RecoveryOperationRow extends RecoveryOperation {
  kind: string;
  status: string;
  phase: string;
  rollback: number;
  actor_hash: string;
  error_code: string | null;
}
