import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import {
  SESSIONS_REPOSITORY,
  type SessionsRepository,
} from '../domain/repositories/sessions.repository.interface.js';
import {
  REFRESH_TOKENS_REPOSITORY,
  type RefreshTokensRepository,
} from '../domain/repositories/refresh-tokens.repository.interface.js';

export interface RevokeSessionInput {
  sessionId: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class RevokeSessionUseCase {
  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessionsRepository: SessionsRepository,
    @Inject(REFRESH_TOKENS_REPOSITORY)
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: RevokeSessionInput): Promise<void> {
    const session = await this.sessionsRepository.findById(input.sessionId);
    // 404 (not 403) if it belongs to someone else — don't confirm the
    // session ID exists at all.
    if (!session || session.userId !== input.userId) {
      throw new NotFoundException('Session not found.');
    }

    await this.refreshTokensRepository.revokeAllForSession(session.id);
    await this.sessionsRepository.revoke(session.id);

    await this.auditService.log({
      userId: input.userId,
      type: 'SESSION_REVOKED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { revokedSessionId: session.id },
    });
  }
}
