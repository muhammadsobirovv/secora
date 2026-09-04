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
// Module 18 — task #513 (file/storage security audit), disclosed known
// gaps in the retrieval path (not fixed this phase — each needs either a
// new cross-cutting endpoint consumed by web/mobile/desktop/SDKs, or a
// new dependency this sandbox can't install/verify, so blindly hand-
// rolling either risked shipping an unverified implementation rather
// than a real fix — same judgment call as this module's other disclosed-
// not-fixed items):
//   1. `getUrl()` has no authenticated/expiring retrieval story.
//      `S3CompatibleStorageService.getUrl()` returns either a public,
//      non-expiring `STORAGE_S3_PUBLIC_BASE_URL` URL (requires the bucket
//      to be public-read — anyone with the URL has permanent access) or
//      an `s3://` URI a browser can't fetch at all;
//      `LocalDiskStorageService.getUrl()` returns a `file://` URI, also
//      not browser-fetchable. There is currently no authenticated
//      `GET /attachments/:id/content`-style endpoint anywhere in
//      apps/api that re-checks workspace ownership and streams
//      `download()`'s bytes back — `AttachmentDto.url` is the *only*
//      retrieval path today, and it's exactly the two problems above.
//      A correct fix needs: (a) that new streaming endpoint, backed by
//      `download()` (already exists below) with a hard `Content-
//      Disposition: attachment` (mitigates stored-XSS from point 2), and
//      (b) for the S3 provider, `@aws-sdk/s3-request-presigner`
//      (currently not a dependency) to generate short-lived signed URLs
//      instead of requiring a public bucket.
//   2. `upload()`'s `contentType` parameter is never validated against
//      the file's actual bytes (magic-number sniffing) anywhere it's
//      called from — every caller trusts the client-supplied MIME type
//      verbatim. Combined with gap 1 ever being closed by serving content
//      inline instead of forcing a download, a file declared
//      `image/png` but actually containing an HTML/SVG payload would be
//      stored and could be served with an attacker-chosen `Content-Type`.
//      Until an authenticated retrieval endpoint exists, this is latent
//      rather than actively exploitable (nothing serves stored bytes back
//      to a browser today) — tracked together with gap 1 since the fix
//      for one is also where the other's mitigation (forced download)
//      belongs.
// Tracked as a concrete follow-up in docs/operations/ (Phase 29).
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
