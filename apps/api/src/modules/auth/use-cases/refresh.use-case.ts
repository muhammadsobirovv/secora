import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthTokensDto, RefreshRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { AuditService } from '../../audit/audit.service.js';
import { RbacService } from '../../rbac/rbac.service.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  SESSIONS_REPOSITORY,
  type SessionsRepository,
} from '../domain/repositories/sessions.repository.interface.js';
import {
  REFRESH_TOKENS_REPOSITORY,
  type RefreshTokensRepository,
} from '../domain/repositories/refresh-tokens.repository.interface.js';
import { TokenService } from '../services/token.service.js';

export interface RefreshInput extends RefreshRequestDto {
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class RefreshUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessionsRepository: SessionsRepository,
    @Inject(REFRESH_TOKENS_REPOSITORY)
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly rbacService: RbacService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: RefreshInput): Promise<AuthTokensDto> {
    const token = await this.refreshTokensRepository.findByHash(
      this.tokenService.hashOpaqueToken(input.refreshToken),
    );
    if (!token || token.expiresAt < new Date()) {
      throw this.invalidToken();
    }

    if (token.revokedAt) {
      if (token.replacedByTokenId) {
        // Reuse of an already-rotated token — likely theft. Nuke the whole
        // session so both the legitimate holder and the attacker are logged
        // out; the legitimate holder just has to log in again.
        await this.refreshTokensRepository.revokeAllForSession(token.sessionId);
        await this.sessionsRepository.revoke(token.sessionId);
        await this.auditService.log({
          userId: token.userId,
          type: 'REFRESH_TOKEN_REUSE_DETECTED',
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        });
      }
      throw this.invalidToken();
    }

    const user = await this.usersRepository.findById(token.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw this.invalidToken();
    }

    // Atomically claim this token for rotation BEFORE creating the new
    // token row — closes the race where two concurrent refresh calls both
    // read the same active token, then both mint a new one from it (see
    // rotateIfActive doc comment). If we lose the race, someone else
    // already rotated (or revoked) it between our findByHash and now:
    // treat that the same as reuse-of-a-rotated-token.
    const newTokenId = randomUUID();
    const rotationWon = await this.refreshTokensRepository.rotateIfActive(
      token.id,
      newTokenId,
    );
    if (!rotationWon) {
      await this.refreshTokensRepository.revokeAllForSession(token.sessionId);
      await this.sessionsRepository.revoke(token.sessionId);
      await this.auditService.log({
        userId: token.userId,
        type: 'REFRESH_TOKEN_REUSE_DETECTED',
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      throw this.invalidToken();
    }

    const rawNewToken = this.tokenService.generateOpaqueToken();
    await this.refreshTokensRepository.create({
      id: newTokenId,
      userId: token.userId,
      sessionId: token.sessionId,
      tokenHash: this.tokenService.hashOpaqueToken(rawNewToken),
      // Rotated tokens always use the standard TTL, not the remember-me
      // variant — the original login's rememberMe choice isn't persisted
      // per-token. Documented as a known simplification in the ADR.
      expiresAt: this.tokenService.getRefreshTokenExpiry(false),
    });
    await this.sessionsRepository.touchLastActive(token.sessionId);

    const roles = await this.rbacService.getRoleNamesForUser(user.id);
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
      sessionId: token.sessionId,
    });

    await this.auditService.log({
      userId: user.id,
      type: 'REFRESH_TOKEN_ROTATED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return {
      accessToken,
      refreshToken: rawNewToken,
      expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
    };
  }

  private invalidToken(): AppException {
    return new AppException(
      'INVALID_OR_EXPIRED_TOKEN',
      'Refresh token is invalid or expired.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
