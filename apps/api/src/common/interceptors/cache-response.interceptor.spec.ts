import { describe, expect, it, jest } from '@jest/globals';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { firstValueFrom, of } from 'rxjs';
import type { CacheService } from '../providers/cache/cache-service.interface.js';
import { CacheResponseInterceptor } from './cache-response.interceptor.js';

/// Module 14 — API Gateway. First interceptor spec in this codebase
/// (see docs/architecture/ci-cd.md's disclosed test-coverage gaps).
function buildCache(getReturn: unknown = null): jest.Mocked<CacheService> {
  return {
    get: jest.fn(async () => getReturn),
    set: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
    stats: jest.fn(async () => ({ entryCount: null, hitRate: null })),
  } as unknown as jest.Mocked<CacheService>;
}

function buildReflector(ttlSeconds: number | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn(() => ttlSeconds),
  } as unknown as Reflector;
}

function buildContext(method: string, userId: string | undefined, originalUrl = '/knowledge-base/references'): ExecutionContext {
  const request = {
    method,
    originalUrl,
    user: userId ? { id: userId } : undefined,
  } as unknown as Request;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function buildNext(returnValue: unknown): CallHandler {
  return { handle: jest.fn(() => of(returnValue)) } as unknown as CallHandler;
}

describe('CacheResponseInterceptor', () => {
  it('passes through untouched when no @CacheResponse metadata is present', async () => {
    const cache = buildCache();
    const interceptor = new CacheResponseInterceptor(buildReflector(undefined), cache);
    const next = buildNext({ hello: 'world' });
    const result = await firstValueFrom(await interceptor.intercept(buildContext('GET', 'user-1'), next));
    expect(result).toEqual({ hello: 'world' });
    expect(cache.get).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalled();
  });

  it('passes through untouched for non-GET methods even with metadata present', async () => {
    const cache = buildCache();
    const interceptor = new CacheResponseInterceptor(buildReflector(300), cache);
    const next = buildNext({ created: true });
    await firstValueFrom(await interceptor.intercept(buildContext('POST', 'user-1'), next));
    expect(cache.get).not.toHaveBeenCalled();
  });

  it('on a cache miss, calls the handler and writes the result to cache with the configured TTL', async () => {
    const cache = buildCache(null);
    const interceptor = new CacheResponseInterceptor(buildReflector(300), cache);
    const next = buildNext([{ id: 'ref-1' }]);
    const result = await firstValueFrom(await interceptor.intercept(buildContext('GET', 'user-1'), next));
    expect(result).toEqual([{ id: 'ref-1' }]);
    expect(next.handle).toHaveBeenCalled();
    expect(cache.get).toHaveBeenCalledWith('http-cache:user-1:/knowledge-base/references');
    // The cache write is fire-and-forget (`void this.cache.set(...)`) —
    // flush microtasks once so the unawaited promise inside `tap` has a
    // chance to run before asserting on it.
    await Promise.resolve();
    expect(cache.set).toHaveBeenCalledWith('http-cache:user-1:/knowledge-base/references', [{ id: 'ref-1' }], 300);
  });

  it('on a cache hit, replays the cached value and never calls the handler', async () => {
    const cache = buildCache([{ id: 'cached-ref' }]);
    const interceptor = new CacheResponseInterceptor(buildReflector(300), cache);
    const next = buildNext([{ id: 'fresh-ref' }]);
    const result = await firstValueFrom(await interceptor.intercept(buildContext('GET', 'user-1'), next));
    expect(result).toEqual([{ id: 'cached-ref' }]);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('namespaces the cache key by "anon" on a public route with no authenticated user', async () => {
    const cache = buildCache(null);
    const interceptor = new CacheResponseInterceptor(buildReflector(300), cache);
    const next = buildNext({});
    await firstValueFrom(await interceptor.intercept(buildContext('GET', undefined), next));
    expect(cache.get).toHaveBeenCalledWith('http-cache:anon:/knowledge-base/references');
  });
});
