import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../exceptions/app.exception.js';
import type { StorageObjectSummary, StorageService, UploadResult } from './storage-service.interface.js';

/// Module 14 — Object Storage abstraction. Works against AWS S3, MinIO
/// (self-hosted, still free — the Community Edition can opt into this
/// path without any paid dependency), and Cloudflare R2/any other
/// S3-API-compatible endpoint via `STORAGE_S3_ENDPOINT`. Selected via
/// `STORAGE_PROVIDER=s3` in `providers.module.ts`.
///
/// Sandbox disclosure: `@aws-sdk/client-s3` is a *declared* dependency
/// (package.json) written against its real, stable public API from
/// training-time knowledge — this sandbox has no network access to
/// `pnpm install` it or a real S3/MinIO endpoint to exercise it against,
/// so this class (unlike `LocalDiskStorageService`, which was
/// exercised indirectly by every other module's file-upload flow) has
/// not been executed. Same disclosed-but-real posture Module 10 already
/// established for `@opentelemetry/*`.
@Injectable()
export class S3CompatibleStorageService implements StorageService {
  private readonly logger = new Logger(S3CompatibleStorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string | null;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    const endpoint = this.configService.get('STORAGE_S3_ENDPOINT', { infer: true });
    const bucket = this.configService.get('STORAGE_S3_BUCKET', { infer: true });
    if (!bucket) {
      throw new AppException(
        'STORAGE_PROVIDER_NOT_CONFIGURED',
        'STORAGE_PROVIDER=s3 requires STORAGE_S3_BUCKET (and, for MinIO/R2, STORAGE_S3_ENDPOINT) to be set.',
        500,
      );
    }
    this.bucket = bucket;
    this.publicBaseUrl = this.configService.get('STORAGE_S3_PUBLIC_BASE_URL', { infer: true }) ?? null;
    const accessKeyId = this.configService.get('STORAGE_S3_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = this.configService.get('STORAGE_S3_SECRET_ACCESS_KEY', { infer: true });
    this.client = new S3Client({
      region: this.configService.get('STORAGE_S3_REGION', { infer: true }),
      endpoint,
      forcePathStyle: this.configService.get('STORAGE_S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
    this.logger.log(`S3-compatible storage configured: bucket=${this.bucket} endpoint=${endpoint ?? 'aws-default'}`);
  }

  async upload(key: string, data: Buffer, contentType: string): Promise<UploadResult> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }),
    );
    return { key, url: await this.getUrl(key) };
  }

  async download(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Uint8Array[] = [];
    // `Body` is a web/Node ReadableStream depending on runtime — the SDK
    // types it as a union; async-iterating works for both in Node 18+.
    const body = result.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  getUrl(key: string): Promise<string> {
    if (this.publicBaseUrl) {
      return Promise.resolve(`${this.publicBaseUrl.replace(/\/$/, '')}/${key}`);
    }
    return Promise.resolve(`s3://${this.bucket}/${key}`);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<StorageObjectSummary[]> {
    const results: StorageObjectSummary[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: continuationToken }),
      );
      for (const object of page.Contents ?? []) {
        if (!object.Key) continue;
        results.push({
          key: object.Key,
          sizeBytes: object.Size ?? 0,
          lastModified: (object.LastModified ?? new Date()).toISOString(),
        });
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return results;
  }
}
