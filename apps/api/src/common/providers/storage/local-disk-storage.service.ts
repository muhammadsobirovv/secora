import { Injectable } from '@nestjs/common';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  StorageService,
  UploadResult,
} from './storage-service.interface.js';

const STORAGE_DIR = join(process.cwd(), '.storage');

/// No cloud storage credentials are configured in this environment. Writes
/// under apps/api/.storage/ — a real S3/GCS-backed implementation later is
/// a new class + one DI binding in providers.module.ts.
@Injectable()
export class LocalDiskStorageService implements StorageService {
  async upload(
    key: string,
    data: Buffer,
    _contentType: string,
  ): Promise<UploadResult> {
    const filePath = join(STORAGE_DIR, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return { key, url: `file://${filePath}` };
  }

  getUrl(key: string): Promise<string> {
    return Promise.resolve(`file://${join(STORAGE_DIR, key)}`);
  }

  async delete(key: string): Promise<void> {
    await rm(join(STORAGE_DIR, key), { force: true });
  }
}
