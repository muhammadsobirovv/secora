import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transactional } from '@nestjs-cls/transactional';
import { randomUUID } from 'node:crypto';
import type { AuthTokensDto } from '@pentesthub/shared';
import type { EnvConfig } from '../../config/env.validation.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { generateUniqueSlug } from '../../common/utils/slug.js';
import { AuditService } from '../audit/audit.service.js';
import { RbacService } from '../rbac/rbac.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  USER_PREFERENCES_REPOSITORY,
  type UserPreferencesRepository,
} from '../user-preferences/domain/repositories/user-preferences.repository.interface.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../auth/domain/repositories/users.repository.interface.js';
import { SessionIssuerService, type IssueSessionContext } from '../auth/services/session-issuer.service.js';
import { DemoSeedService } from './demo-seed.service.js';

export interface StartDemoSessionInput extends IssueSessionContext {}

/// Module 15 — task #352 (demo mode). Mirrors `RegisterUseCase`'s shape
/// (User + personal Workspace + default UserPreferences, one transaction)
/// with three deliberate differences: (1) the user has no password
/// (`passwordHash: null`, matching the OAuth-account precedent — nothing
/// distinguishes this from an OAuth-only account at the schema level),
/// (2) `emailVerified: true` and no verification email — there's no real
/// inbox behind a synthetic `demo+<uuid>@demo.secora.group` address,
/// (3) the workspace is marked `isDemo` with a `demoExpiresAt`, and gets
/// pre-seeded sample data instead of starting empty. Reuses
/// `SessionIssuerService.issue()` — the same primitive login/mfa-
/// challenge/oauth-exchange already share — so a demo session is a real,
/// fully-functional JWT session with no separate auth code path to keep
/// in sync.
@Injectable()
export class DemoSessionService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly userPreferencesRepository: UserPreferencesRepository,
    private readonly rbacService: RbacService,
    private readonly auditService: AuditService,
    private readonly sessionIssuer: SessionIssuerService,
    private readonly demoSeed: DemoSeedService,
    @Inject(ConfigService) private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Transactional()
  async start(input: StartDemoSessionInput): Promise<AuthTokensDto> {
    if (!this.configService.get('DEMO_MODE_ENABLED', { infer: true })) {
      throw new AppException(
        'DEMO_MODE_DISABLED',
        'Demo mode is not enabled on this deployment.',
        HttpStatus.NOT_FOUND,
      );
    }

    const ttlHours = this.configService.get('DEMO_SESSION_TTL_HOURS', { infer: true });
    const demoId = randomUUID();

    const user = await this.usersRepository.create({
      email: `demo+${demoId}@demo.secora.group`,
      passwordHash: null,
      displayName: 'Demo User',
      emailVerified: true,
    });

    await this.rbacService.assignDefaultRole(user.id);

    const workspace = await this.workspacesRepository.create({
      name: 'Acme Corp Demo Workspace',
      slug: generateUniqueSlug('acme-corp-demo'),
      isDemo: true,
      demoExpiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
    });
    await this.workspacesRepository.addMember(workspace.id, user.id, 'OWNER');

    // Onboarding (task #351) has nothing to teach a demo visitor that this
    // flow doesn't already show them directly — skip it by marking it
    // pre-completed rather than special-casing OnboardingFlow's gate.
    await this.userPreferencesRepository.createDefault(user.id);
    await this.userPreferencesRepository.update(user.id, {
      onboardingCompletedAt: new Date(),
    });

    await this.demoSeed.seed(workspace.id, user.id);

    await this.auditService.log({
      userId: user.id,
      type: 'DEMO_SESSION_STARTED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { workspaceId: workspace.id },
    });

    return this.sessionIssuer.issue(user, input);
  }
}
