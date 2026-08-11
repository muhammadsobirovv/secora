import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CACHE_SERVICE } from '../providers/tokens.js';
import type { CacheService } from '../providers/cache/cache-service.interface.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';
import { CACHE_RESPONSE_TTL_KEY } from '../decorators/cache-response.decorator.js';

/// Module 14 — API Gateway: applies `@CacheResponse(ttlSeconds)`
/// (see that decorator for when to use it). Applied per-route via
/// `@UseInterceptors(CacheResponseInterceptor)`, not globally — Nest
/// resolves its constructor deps (`Reflector`, `CACHE_SERVICE`) from the
/// global providers module even though it isn't itself registered in any
/// module's `providers` array, the same way `@UseGuards(SomeGuard)`
/// works for guards with injected dependencies elsewhere in this codebase.
///
/// Runs *inside* the global `ResponseInterceptor` (local/method-level
/// interceptors nest inside global ones), so `next.handle()` here yields
/// the controller's raw return value — before it's wrapped into
/// `{ success, data }`. That's deliberate: this interceptor caches and
/// replays the raw value, and lets `ResponseInterceptor` re-wrap it
/// fresh on every request (cached or not), so the wrapper shape never
/// drifts from the live path.
///
/// Only ever caches GET requests, and only ever serves a cached value
/// back to the same caller: the key is namespaced by `request.user.id`
/// when present (falls back to `'anon'` on `@Public()` routes) so one
/// user's cached response can never be replayed to another — this
/// matters even for routes that look tenant-scoped by URL, since the
/// `organizationId`/`workspaceId` path segment alone doesn't prove the
/// caller has access; the handler's own guards decide that per-request,
/// and this interceptor must not skip re-running them by serving a
/// stale cross-user hit.
@Injectable()
export class CacheResponseInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CACHE_SERVICE) private readonly cache: CacheService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const ttlSeconds = this.reflector.getAllAndOverride<number | undefined>(
      CACHE_RESPONSE_TTL_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<Request>();
    if (!ttlSeconds || request.method !== 'GET') {
      return next.handle();
    }

    const userId = (request as AuthenticatedRequest).user?.id ?? 'anon';
    const cacheKey = `http-cache:${userId}:${request.originalUrl}`;

    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached !== null) {
      return of(cached);
    }

    return next.handle().pipe(
      tap((data) => {
        // Fire-and-forget: a cache-write failure (e.g. Redis briefly
        // down) shouldn't fail the request that's already succeeding.
        void this.cache.set(cacheKey, data, ttlSeconds).catch(() => undefined);
      }),
    );
  }
}
