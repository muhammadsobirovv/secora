import { Injectable } from '@nestjs/common';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { StorageObjectSummary, StorageService, UploadResult } from './storage-service.interface.js';

const STORAGE_DIR = join(process.cwd(), '.storage');

/// Community Edition default — zero configuration, backed by a plain
/// directory (a Docker volume in the reference `docker-compose.yml`). A
/// real S3/MinIO/R2-backed alternative is `S3CompatibleStorageService`,
/// selected via `STORAGE_PROVIDER=s3` in `providers.module.ts`.
@Injectable()
export class LocalDiskStorageService implements StorageService {
  async upload(key: string, data: Buffer, _contentType: string): Promise<UploadResult> {
    const filePath = join(STORAGE_DIR, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return { key, url: `file://${filePath}` };
  }

  async download(key: string): Promise<Buffer> {
    return readFile(join(STORAGE_DIR, key));
  }

  getUrl(key: string): Promise<string> {
    return Promise.resolve(`file://${join(STORAGE_DIR, key)}`);
  }

  async delete(key: string): Promise<void> {
    await rm(join(STORAGE_DIR, key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(join(STORAGE_DIR, key));
      return true;
    } catch {
      return false;
    }
  }

  /// Recursively walks `STORAGE_DIR/prefix` (a directory or a
  /// directory-prefix of files) — `prefix` is treated as a path prefix,
  /// mirroring how S3's `ListObjectsV2` prefix matching behaves, so the
  /// same caller code works unmodified against either provider.
  async list(prefix: string): Promise<StorageObjectSummary[]> {
    const root = join(STORAGE_DIR, prefix);
    const results: StorageObjectSummary[] = [];

    async function walk(dir: string): Promise<void> {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const info = await stat(fullPath);
          results.push({
            // Normalize to forward slashes so a key produced on Windows
            // (`path.relative` uses the OS separator) matches the same
            // format S3-style keys always use.
            key: relative(STORAGE_DIR, fullPath).replace(/\\/g, '/'),
            sizeBytes: info.size,
            lastModified: info.mtime.toISOString(),
          });
        }
      }
    }

    await walk(root);
    return results;
  }
}
