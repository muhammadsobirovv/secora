import { Inject, Injectable } from '@nestjs/common';
import type { AuthTokensDto } from '@pentesthub/shared';
import type { User } from '../../../prisma-types.js';
import {
  SESSIONS_REPOSITORY,
  type SessionsRepository,
} from '../domain/repositories/sessions.repository.interface.js';
import {
  REFRESH_TOKENS_REPOSITORY,
  type RefreshTokensRepository,
} from '../domain/repositories/refresh-tokens.repository.interface.js';
import { RbacService } from '../../rbac/rbac.service.js';
import { TokenService } from './token.service.js';
import { DeviceParserService } from './device-parser.service.js';

export interface IssueSessionContext {
  ipAddress: string;
  userAgent: string;
  rememberMe?: boolean;
}

/// Shared by every flow that ends in a live session: login (no MFA),
/// mfa-challenge (post-TOTP), oauth-exchange (post-OAuth). Keeps
/// "create session, resolve roles, sign access token, issue refresh
/// token" in exactly one place.
@Injectable()
export class SessionIssuerService {
  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessionsRepository: SessionsRepository,
    @Inject(REFRESH_TOKENS_REPOSITORY)
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly rbacService: RbacService,
    private readonly tokenService: TokenService,
    private readonly deviceParser: DeviceParserService,
  ) {}

  async issue(user: User, ctx: IssueSessionContext): Promise<AuthTokensDto> {
    const { browser, os } = this.deviceParser.parse(ctx.userAgent);
    const deviceName = browser && os ? `${browser} on ${os}` : 'Unknown device';

    const session = await this.sessionsRepository.create({
      userId: user.id,
      deviceName,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      browser,
      os,
    });

    const roles = await this.rbacService.getRoleNamesForUser(user.id);
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
      sessionId: session.id,
    });

    const rawRefreshToken = this.tokenService.generateOpaqueToken();
    await this.refreshTokensRepository.create({
      userId: user.id,
      sessionId: session.id,
      tokenHash: this.tokenService.hashOpaqueToken(rawRefreshToken),
      expiresAt: this.tokenService.getRefreshTokenExpiry(
        Boolean(ctx.rememberMe),
      ),
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
    };
  }
}
