import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  API_KEYS_REPOSITORY,
  type ApiKeysRepository,
} from '../../api-keys/domain/repositories/api-keys.repository.interface.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { isIpAllowlisted } from '../../../common/guards/ip-allowlist.util.js';

/// Module 15 — API key management (task #336). One sliding 60s window
/// per `apiKeyId`, kept in process memory — correct for a single-instance
/// Community Edition deployment; a multi-instance HA deployment (Module
/// 14) needs a shared store (Redis, matching `RedisCacheService`) for
/// this to hold across instances instead of per-instance, which is a
/// disclosed follow-up rather than something this pass implements. Not
/// wired through `CacheService`/`ThrottlerStorage` here specifically to
/// avoid this guard depending on `ProvidersModule`'s Redis-vs-memory
/// selection just for a counter this simple.
const rateLimitWindows = new Map<string, { windowStart: number; count: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(apiKeyId: string, limitPerMinute: number): boolean {
  const now = Date.now();
  const existing = rateLimitWindows.get(apiKeyId);
  if (!existing || now - existing.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitWindows.set(apiKeyId, { windowStart: now, count: 1 });
    return true;
  }
  existing.count += 1;
  return existing.count <= limitPerMinute;
}

/// Authenticates a request via the `X-API-Key` header instead of the JWT
/// access token every other route uses (`JwtAuthGuard`, registered
/// globally as `APP_GUARD` in app.module.ts). Deliberately **not** wired
/// into that global guard chain — retrofitting dual JWT-or-API-key auth
/// onto Modules 1-8's existing ~200 routes would be exactly the kind of
/// broad cross-module rewrite the standing "do not rewrite previous
/// modules" instruction guards against. Instead, this guard is meant to
/// be applied explicitly (`@UseGuards(ApiKeyAuthGuard)` + `@Public()` to
/// skip the global JwtAuthGuard) to whichever specific routes a future
/// module decides to expose over the Public API — see
/// docs/adr/0009-bug-bounty-operating-system.md's "Public REST API"
/// section for the full reasoning and the integration follow-up this
/// leaves open.
///
/// On success, populates `request.user` with the same `RequestUser`
/// shape `JwtAuthGuard` does (`roles: []` — API keys don't carry the
/// legacy Role/Permission RBAC roles, only their own `scopes`, exposed
/// separately via `request.apiKeyScopes` for handlers that care) so
/// downstream `@CurrentUser()` consumers work unmodified either way.
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    @Inject(API_KEYS_REPOSITORY) private readonly apiKeysRepository: ApiKeysRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser; apiKeyScopes?: string[]; apiKeyWorkspaceId?: string | null }>();
    const rawKey = request.header('x-api-key');
    if (!rawKey || !rawKey.startsWith('phb_')) {
      throw new AppException('API_KEY_NOT_FOUND', 'Missing or malformed X-API-Key header.', HttpStatus.UNAUTHORIZED);
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.apiKeysRepository.findByHash(keyHash);
    if (!apiKey || apiKey.revokedAt) {
      throw new AppException('API_KEY_NOT_FOUND', 'Invalid or revoked API key.', HttpStatus.UNAUTHORIZED);
    }
    if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
      throw new AppException('API_KEY_NOT_FOUND', 'This API key has expired.', HttpStatus.UNAUTHORIZED);
    }

    // Module 15 — API key management (task #336). Reuses Module 14's
    // `isIpAllowlisted` matcher — an empty `ipAllowlist` (the default)
    // is a no-op, same "opt-in, never enforced by default" posture the
    // deployment-wide `IP_ALLOWLIST` guard already has.
    if (apiKey.ipAllowlist.length > 0 && !isIpAllowlisted(request.ip ?? '', apiKey.ipAllowlist)) {
      throw new AppException(
        'API_KEY_IP_NOT_ALLOWLISTED',
        'This API key is not permitted to be used from your network address.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (apiKey.rateLimitPerMinute != null && !checkRateLimit(apiKey.id, apiKey.rateLimitPerMinute)) {
      throw new AppException(
        'API_KEY_RATE_LIMITED',
        `This API key is limited to ${apiKey.rateLimitPerMinute} requests/minute.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Fire-and-forget — not awaited so a slow write never adds latency to
    // the request the key is authenticating (matches how Session.
    // lastActiveAt is touched elsewhere in this codebase).
    void this.apiKeysRepository.touchLastUsed(apiKey.id);

    request.user = { id: apiKey.userId, email: '', roles: [], sessionId: `apikey:${apiKey.id}` };
    request.apiKeyScopes = apiKey.scopes;
    // Module 13 addition — MCP sessions are workspace-scoped
    // (`McpSession.workspaceId`); a personal (non-workspace) API key has
    // no workspace to scope to, so `McpRpcController` rejects those with
    // a clear error rather than silently defaulting to "no workspace".
    request.apiKeyWorkspaceId = apiKey.workspaceId;
    return true;
  }
}
