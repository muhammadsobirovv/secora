import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import type { ResetPasswordDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  PASSWORD_RESET_TOKENS_REPOSITORY,
  type PasswordResetTokensRepository,
} from '../domain/repositories/password-reset-tokens.repository.interface.js';
import {
  SESSIONS_REPOSITORY,
  type SessionsRepository,
} from '../domain/repositories/sessions.repository.interface.js';
import {
  REFRESH_TOKENS_REPOSITORY,
  type RefreshTokensRepository,
} from '../domain/repositories/refresh-tokens.repository.interface.js';
import { PasswordHasherService } from '../services/password-hasher.service.js';
import { TokenService } from '../services/token.service.js';

export interface ResetPasswordInput extends ResetPasswordDto {
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(PASSWORD_RESET_TOKENS_REPOSITORY)
    private readonly passwordResetTokensRepository: PasswordResetTokensRepository,
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessionsRepository: SessionsRepository,
    @Inject(REFRESH_TOKENS_REPOSITORY)
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    const token = await this.passwordResetTokensRepository.findValidByHash(
      this.tokenService.hashOpaqueToken(input.token),
    );
    if (!token) {
      throw new AppException(
        'INVALID_OR_EXPIRED_TOKEN',
        'This password reset link is invalid or has expired.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    await this.usersRepository.updatePasswordHash(token.userId, passwordHash);
    await this.passwordResetTokensRepository.markUsed(token.id);

    // Force re-login everywhere — a password reset means the old
    // credential (and anything authenticated under it) should no longer
    // be trusted. Query active sessions before revoking them, then revoke
    // each one's refresh tokens.
    const activeSessions = await this.sessionsRepository.findActiveByUser(
      token.userId,
    );
    for (const session of activeSessions) {
      await this.refreshTokensRepository.revokeAllForSession(session.id);
    }
    await this.sessionsRepository.revokeAllForUser(token.userId);

    await this.auditService.log({
      userId: token.userId,
      type: 'PASSWORD_RESET_COMPLETED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }
}
