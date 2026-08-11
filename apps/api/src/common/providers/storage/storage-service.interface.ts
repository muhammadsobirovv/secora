export interface UploadResult {
  key: string;
  url: string;
}

export interface StorageObjectSummary {
  key: string;
  sizeBytes: number;
  lastModified: string;
}

/// Port. Two bindings exist (`providers.module.ts` selects one via
/// `STORAGE_PROVIDER`): `LocalDiskStorageService` (Community Edition
/// default, zero configuration) and `S3CompatibleStorageService` (AWS
/// S3, MinIO, Cloudflare R2, or any S3-API-compatible endpoint). Module
/// 14 — Object Storage / Backup System added `download`/`list`/`exists`
/// on top of the original Module 1 `upload`/`getUrl`/`delete` trio:
/// `BackupPolicyRunnerService`'s own Module 10 doc comment explicitly
/// disclosed "pruning old backup files isn't implemented (StorageService
/// has no list/delete-by-prefix)" as a known gap — `list()` closes it.
export interface StorageService {
  upload(key: string, data: Buffer, contentType: string): Promise<UploadResult>;
  download(key: string): Promise<Buffer>;
  getUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
  /// Lists every object whose key starts with `prefix`, most-recent
  /// first is NOT guaranteed (callers that need ordering sort
  /// `lastModified` themselves) — kept simple since the only two callers
  /// today (`BackupPolicyRunnerService`'s pruning sweep, the Admin
  /// Console's storage dashboard) both re-sort anyway.
  list(prefix: string): Promise<StorageObjectSummary[]>;
  exists(key: string): Promise<boolean>;
}
