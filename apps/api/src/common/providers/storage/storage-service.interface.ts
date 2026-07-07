export interface UploadResult {
  key: string;
  url: string;
}

/// Port. Nothing consumes this yet this sprint (see
/// docs/adr/0001-auth-module.md) — LocalDiskStorageService is registered
/// and ready for a future upload endpoint (avatars, evidence/screenshots).
export interface StorageService {
  upload(key: string, data: Buffer, contentType: string): Promise<UploadResult>;
  getUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}
