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
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser; apiKeyScopes?: string[] }>();
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

    // Fire-and-forget — not awaited so a slow write never adds latency to
    // the request the key is authenticating (matches how Session.
    // lastActiveAt is touched elsewhere in this codebase).
    void this.apiKeysRepository.touchLastUsed(apiKey.id);

    request.user = { id: apiKey.userId, email: '', roles: [], sessionId: `apikey:${apiKey.id}` };
    request.apiKeyScopes = apiKey.scopes;
    return true;
  }
}
