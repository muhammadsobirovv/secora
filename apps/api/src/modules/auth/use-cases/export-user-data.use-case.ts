import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import type { UserDataExportDto } from '@pentesthub/shared';
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
  OAUTH_ACCOUNTS_REPOSITORY,
  type OAuthAccountsRepository,
} from '../domain/repositories/oauth-accounts.repository.interface.js';
import {
  USER_PREFERENCES_REPOSITORY,
  type UserPreferencesRepository,
} from '../../user-preferences/domain/repositories/user-preferences.repository.interface.js';

export interface ExportUserDataInput {
  userId: string;
  ipAddress: string;
  userAgent: string;
}

/// Module 15 — Privacy controls (task #342). The individual "download my
/// data" self-service right — deliberately NOT the same thing as Module
/// 10's ComplianceExportRequest flow (async, admin-triggered, organization-
/// wide scope covering audit/org-membership/workflow/integration data
/// across potentially many accounts). This gathers exactly one account's
/// own footprint across the tables this codebase actually has repository
/// read access to today (account/sessions/linked OAuth accounts/
/// preferences/recent audit events) and returns it synchronously — no
/// storage upload or polling needed since a single account's data is
/// small. See this task's completion metadata for the explicit disclosure
/// of what's NOT included (the ~40+ tenant tables a user's activity may
/// touch — findings, reports, AI conversations, etc. — are workspace-
/// scoped, not account-scoped, and exporting "everything a user has ever
/// touched across every workspace they're a member of" is a materially
/// larger feature intentionally left out of this pass).
@Injectable()
export class ExportUserDataUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessionsRepository: SessionsRepository,
    @Inject(OAUTH_ACCOUNTS_REPOSITORY)
    private readonly oauthAccountsRepository: OAuthAccountsRepository,
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly userPreferencesRepository: UserPreferencesRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: ExportUserDataInput): Promise<UserDataExportDto> {
    const user = await this.usersRepository.findById(input.userId);
    if (!user) {
      throw new AppException('INVALID_CREDENTIALS', 'Account not found.', HttpStatus.NOT_FOUND);
    }

    const [preferences, sessions, oauthAccounts, auditEvents] = await Promise.all([
      this.userPreferencesRepository.findByUserId(input.userId),
      this.sessionsRepository.findActiveByUser(input.userId),
      this.oauthAccountsRepository.findByUser(input.userId),
      this.auditService.listRecentForUser(input.userId, 50),
    ]);

    // The export itself is a security-relevant event worth its own audit
    // trail entry — logged after gathering data, not before, so a failed
    // gather (e.g. account not found above) never produces a misleading
    // "export requested" record for an account that doesn't exist.
    await this.auditService.log({
      userId: input.userId,
      type: 'DATA_EXPORT_REQUESTED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
      },
      preferences: preferences
        ? {
            theme: preferences.theme,
            language: preferences.language,
            timezone: preferences.timezone,
            notificationsEnabled: preferences.notificationsEnabled,
            telemetryOptOut: preferences.telemetryOptOut,
          }
        : null,
      sessions: sessions.map((session) => ({
        id: session.id,
        deviceName: session.deviceName,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt.toISOString(),
        lastActiveAt: session.lastActiveAt.toISOString(),
      })),
      linkedOAuthAccounts: oauthAccounts.map((account) => ({
        provider: account.provider,
        linkedAt: account.createdAt.toISOString(),
      })),
      recentAuditEvents: auditEvents.map((event) => ({
        type: event.type,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }
}
