import { describe, expect, it, jest } from '@jest/globals';
import { compileTransactionalTestingModule } from '../../../test-utils/transactional-testing-module.js';
import { OAuthLoginUseCase } from './oauth-login.use-case.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  OAUTH_ACCOUNTS_REPOSITORY,
  type OAuthAccountsRepository,
} from '../domain/repositories/oauth-accounts.repository.interface.js';
import {
  OAUTH_EXCHANGE_CODES_REPOSITORY,
  type OAuthExchangeCodesRepository,
} from '../domain/repositories/oauth-exchange-codes.repository.interface.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  USER_PREFERENCES_REPOSITORY,
  type UserPreferencesRepository,
} from '../../user-preferences/domain/repositories/user-preferences.repository.interface.js';
import { RbacService } from '../../rbac/rbac.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { TokenService } from '../services/token.service.js';
import type { OAuthAccount, User } from '../../../prisma-types.js';

describe('OAuthLoginUseCase', () => {
  const baseInput = {
    provider: 'GOOGLE' as const,
    providerUserId: 'google-123',
    email: 'user@example.com',
    displayName: 'OAuth User',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };

  async function buildUseCase(overrides?: {
    existingAccount?: OAuthAccount | null;
    existingUser?: User | null;
  }) {
    const usersRepository: jest.Mocked<UsersRepository> = {
      findById: jest.fn(),
      findByEmail: jest
        .fn<UsersRepository['findByEmail']>()
        .mockResolvedValue(
          overrides?.existingUser === undefined ? null : overrides.existingUser,
        ),
      create: jest
        .fn<UsersRepository['create']>()
        .mockResolvedValue({ id: 'new-user' } as User),
      updatePasswordHash: jest.fn(),
      setEmailVerified: jest.fn(),
      recordFailedLogin: jest.fn(),
      resetFailedLogin: jest.fn(),
      lockUntil: jest.fn(),
    };
    const oauthAccountsRepository: jest.Mocked<OAuthAccountsRepository> = {
      findByProviderAccount: jest
        .fn<OAuthAccountsRepository['findByProviderAccount']>()
        .mockResolvedValue(
          overrides?.existingAccount === undefined
            ? null
            : overrides.existingAccount,
        ),
      create: jest.fn(),
      findByUser: jest.fn(),
    };
    const oauthExchangeCodesRepository: jest.Mocked<OAuthExchangeCodesRepository> =
      {
        create: jest.fn(),
        findValidByHash: jest.fn(),
        markUsed: jest.fn(),
      };
    const workspacesRepository: jest.Mocked<WorkspacesRepository> = {
      create: jest
        .fn<WorkspacesRepository['create']>()
        .mockResolvedValue({ id: 'org-1' } as never),
      addMember: jest.fn(),
      findById: jest.fn(),
      findPersonalWorkspaceForUser: jest.fn(),
      update: jest.fn(),
      listMembers: jest.fn(),
      isMember: jest.fn(),
    };
    const userPreferencesRepository: jest.Mocked<UserPreferencesRepository> = {
      createDefault: jest.fn(),
      findByUserId: jest.fn(),
      update: jest.fn(),
    };
    const rbacService = {
      assignDefaultRole: jest.fn(),
      getRoleNamesForUser: jest.fn(),
    } as unknown as jest.Mocked<RbacService>;
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;
    const tokenService = {
      generateOpaqueToken: jest.fn().mockReturnValue('raw-code'),
      hashOpaqueToken: jest.fn().mockReturnValue('hashed'),
    } as unknown as jest.Mocked<TokenService>;

    const moduleRef = await compileTransactionalTestingModule([
      OAuthLoginUseCase,
      { provide: USERS_REPOSITORY, useValue: usersRepository },
      { provide: OAUTH_ACCOUNTS_REPOSITORY, useValue: oauthAccountsRepository },
      {
        provide: OAUTH_EXCHANGE_CODES_REPOSITORY,
        useValue: oauthExchangeCodesRepository,
      },
      { provide: WORKSPACES_REPOSITORY, useValue: workspacesRepository },
      {
        provide: USER_PREFERENCES_REPOSITORY,
        useValue: userPreferencesRepository,
      },
      { provide: RbacService, useValue: rbacService },
      { provide: AuditService, useValue: auditService },
      { provide: TokenService, useValue: tokenService },
    ]);

    return {
      useCase: moduleRef.get(OAuthLoginUseCase),
      usersRepository,
      oauthAccountsRepository,
      oauthExchangeCodesRepository,
      workspacesRepository,
      auditService,
    };
  }

  it('logs in via an already-linked OAuth account without creating anything new', async () => {
    const deps = await buildUseCase({
      existingAccount: { userId: 'existing-user' } as OAuthAccount,
    });

    const result = await deps.useCase.execute(baseInput);

    expect(deps.usersRepository.create).not.toHaveBeenCalled();
    expect(deps.oauthAccountsRepository.create).not.toHaveBeenCalled();
    expect(deps.oauthExchangeCodesRepository.create).toHaveBeenCalledWith(
      'existing-user',
      'hashed',
      expect.any(Date),
    );
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'existing-user', type: 'OAUTH_LOGIN' }),
    );
    expect(result).toEqual({ exchangeCode: 'raw-code' });
  });

  it('links to an existing password account with the same email', async () => {
    const deps = await buildUseCase({
      existingUser: { id: 'password-user' } as User,
    });

    await deps.useCase.execute(baseInput);

    expect(deps.usersRepository.create).not.toHaveBeenCalled();
    expect(deps.oauthAccountsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'password-user', provider: 'GOOGLE' }),
    );
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'password-user',
        type: 'OAUTH_LINKED',
      }),
    );
  });

  it('creates a brand-new user, role, org, and preferences when nothing matches', async () => {
    const deps = await buildUseCase();

    await deps.useCase.execute(baseInput);

    expect(deps.usersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: baseInput.email,
        passwordHash: null,
        emailVerified: true,
      }),
    );
    expect(deps.workspacesRepository.create).toHaveBeenCalled();
    expect(deps.oauthAccountsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'new-user' }),
    );
  });
});
