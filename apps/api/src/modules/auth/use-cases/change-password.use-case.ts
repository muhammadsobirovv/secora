import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import type { ChangePasswordDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { AuditService } from '../../audit/audit.service.js';
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
import { PasswordHasherService } from '../services/password-hasher.service.js';

export interface ChangePasswordInput extends ChangePasswordDto {
  userId: string;
  currentSessionId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessionsRepository: SessionsRepository,
    @Inject(REFRESH_TOKENS_REPOSITORY)
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    const user = await this.usersRepository.findById(input.userId);
    if (!user?.passwordHash) {
      throw new AppException(
        'INVALID_CREDENTIALS',
        'Current password is incorrect.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const isCurrentValid = await this.passwordHasher.verify(
      user.passwordHash,
      input.currentPassword,
    );
    if (!isCurrentValid) {
      throw new AppException(
        'INVALID_CREDENTIALS',
        'Current password is incorrect.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    await this.usersRepository.updatePasswordHash(user.id, passwordHash);

    // Keep the current session alive, revoke every other one — the user
    // just proved they're the account owner from this session.
    const activeSessions = await this.sessionsRepository.findActiveByUser(
      user.id,
    );
    for (const session of activeSessions) {
      if (session.id !== input.currentSessionId) {
        await this.refreshTokensRepository.revokeAllForSession(session.id);
      }
    }
    await this.sessionsRepository.revokeAllForUser(
      user.id,
      input.currentSessionId,
    );

    await this.auditService.log({
      userId: user.id,
      type: 'PASSWORD_CHANGED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }
}
