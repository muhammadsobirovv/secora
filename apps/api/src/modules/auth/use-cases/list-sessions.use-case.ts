import { Inject, Injectable } from '@nestjs/common';
import type { SessionSummaryDto } from '@pentesthub/shared';
import {
  SESSIONS_REPOSITORY,
  type SessionsRepository,
} from '../domain/repositories/sessions.repository.interface.js';

@Injectable()
export class ListSessionsUseCase {
  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessionsRepository: SessionsRepository,
  ) {}

  async execute(
    userId: string,
    currentSessionId: string,
  ): Promise<SessionSummaryDto[]> {
    const sessions = await this.sessionsRepository.findActiveByUser(userId);
    return sessions.map((session) => ({
      id: session.id,
      deviceName: session.deviceName,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
      current: session.id === currentSessionId,
    }));
  }
}
