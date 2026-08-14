import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { DeleteAccountRequestDto } from '@pentesthub/shared';
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

export interface DeleteAccountInput extends DeleteAccountRequestDto {
  userId: string;
  ipAddress: string;
  userAgent: string;
}

/// Module 15 — Privacy controls (task #342): the "right to erasure" half
/// of the pair alongside export-user-data.use-case.ts. Re-proves account
/// ownership via currentPassword (same reasoning as ChangePasswordUseCase/
/// MfaDisableUseCase — a live access token alone must not be sufficient to
/// trigger an irreversible action), then: revokes every session and
/// refresh token for the account (unlike ChangePasswordUseCase, there is
/// no "current session" to keep alive — the account is going away), and
/// flips User.status to 'DELETED' — the terminal status value
/// login.use-case.ts/refresh.use-case.ts/oauth-exchange.use-case.ts
/// already check for and reject, so this alone is sufficient to lock the
/// account out immediately without any change to those use-cases.
///
/// Honest scope note: this is a soft status flip, not a GDPR-complete hard
/// erasure. It does not delete or anonymize the User row, does not touch
/// any workspace-scoped data (findings, reports, AI conversations, etc. —
/// see ExportUserDataUseCase's doc comment for the same boundary), and
/// does not remove the user from workspaces/organizations they belong to.
/// A full "purge everything" pipeline is materially larger scope (it would
/// need to reconcile ownership transfer/orphaning across every module this
/// project has built) and is intentionally not what this task claims to
/// deliver — see this task's completion metadata for the explicit
/// disclosure.
@Injectable()
export class DeleteAccountUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessionsRepository: SessionsRepository,
    @Inject(REFRESH_TOKENS_REPOSITORY)
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly auditService: AuditService,
  ) {}

  @Transactional()
  async execute(input: DeleteAccountInput): Promise<void> {
    const user = await this.usersRepository.findById(input.userId);
    if (!user?.passwordHash) {
      throw new AppException(
        'INVALID_CREDENTIALS',
        'Current password is incorrect.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const passwordValid = await this.passwordHasher.verify(
      user.passwordHash,
      input.currentPassword,
    );
    if (!passwordValid) {
      throw new AppException(
        'INVALID_CREDENTIALS',
        'Current password is incorrect.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const activeSessions = await this.sessionsRepository.findActiveByUser(user.id);
    for (const session of activeSessions) {
      await this.refreshTokensRepository.revokeAllForSession(session.id);
    }
    await this.sessionsRepository.revokeAllForUser(user.id);

    await this.usersRepository.markDeleted(user.id);

    await this.auditService.log({
      userId: user.id,
      type: 'ACCOUNT_DELETION_REQUESTED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }
}
