import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { CacheService } from './cache-service.interface.js';

interface DiskCacheEntry {
  value: unknown;
  expiresAt: number;
}

/// Filesystem-backed cache (`CACHE_PROVIDER=disk`) — one JSON file per
/// key (filename = SHA-256 of the key, since cache keys can contain
/// characters that aren't safe filenames) under `CACHE_DISK_DIR`.
/// Trades the speed of `MemoryCacheService` for surviving a process
/// restart — useful for a memory-constrained single box that still
/// wants a warm cache after a redeploy, without taking on Redis as an
/// operational dependency.
@Injectable()
export class DiskCacheService implements CacheService {
  private readonly dir: string;
  private readonly defaultTtlSeconds: number;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    this.dir = join(process.cwd(), this.configService.get('CACHE_DISK_DIR', { infer: true }));
    this.defaultTtlSeconds = this.configService.get('CACHE_DEFAULT_TTL_SECONDS', { infer: true });
  }

  private pathFor(key: string): string {
    const hash = createHash('sha256').update(key).digest('hex');
    return join(this.dir, `${hash}.json`);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = await readFile(this.pathFor(key), 'utf-8');
      const entry = JSON.parse(raw) as DiskCacheEntry;
      if (entry.expiresAt < Date.now()) {
        await this.delete(key);
        return null;
      }
      return entry.value as T;
    } catch {
      return null;
    }
  }

  async set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const entry: DiskCacheEntry = { value, expiresAt: Date.now() + (ttlSeconds ?? this.defaultTtlSeconds) * 1000 };
    await writeFile(this.pathFor(key), JSON.stringify(entry));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async stats(): Promise<{ entryCount: number | null; hitRate: number | null }> {
    try {
      const files = await readdir(this.dir);
      return { entryCount: files.filter((f) => f.endsWith('.json')).length, hitRate: null };
    } catch {
      return { entryCount: 0, hitRate: null };
    }
  }
}
