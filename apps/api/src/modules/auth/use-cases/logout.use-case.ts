import { Inject, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { LogoutRequestDto } from '@pentesthub/shared';
import { AuditService } from '../../audit/audit.service.js';
import {
  SESSIONS_REPOSITORY,
  type SessionsRepository,
} from '../domain/repositories/sessions.repository.interface.js';
import {
  REFRESH_TOKENS_REPOSITORY,
  type RefreshTokensRepository,
} from '../domain/repositories/refresh-tokens.repository.interface.js';
import { TokenService } from '../services/token.service.js';

export interface LogoutInput extends LogoutRequestDto {
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessionsRepository: SessionsRepository,
    @Inject(REFRESH_TOKENS_REPOSITORY)
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {}

  /// Idempotent — logging out with an already-invalid token is a no-op,
  /// not an error, since the end state the client wants is already true.
  // Revoking the refresh tokens and the session must commit together — a
  // partial failure would leave a "revoked" session with still-live
  // tokens (or vice versa).
  @Transactional()
  async execute(input: LogoutInput): Promise<void> {
    const token = await this.refreshTokensRepository.findByHash(
      this.tokenService.hashOpaqueToken(input.refreshToken),
    );
    if (!token) {
      return;
    }

    await this.refreshTokensRepository.revokeAllForSession(token.sessionId);
    await this.sessionsRepository.revoke(token.sessionId);
    await this.auditService.log({
      userId: token.userId,
      type: 'LOGOUT',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }
}
