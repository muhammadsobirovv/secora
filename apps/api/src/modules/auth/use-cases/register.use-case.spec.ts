import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { compileTransactionalTestingModule } from '../../../test-utils/transactional-testing-module.js';
import { RegisterUseCase } from './register.use-case.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  EMAIL_VERIFICATION_TOKENS_REPOSITORY,
  type EmailVerificationTokensRepository,
} from '../domain/repositories/email-verification-tokens.repository.interface.js';
import {
  ORGANIZATIONS_REPOSITORY,
  type OrganizationsRepository,
} from '../../organizations/domain/repositories/organizations.repository.interface.js';
import {
  USER_PREFERENCES_REPOSITORY,
  type UserPreferencesRepository,
} from '../../user-preferences/domain/repositories/user-preferences.repository.interface.js';
import { MAIL_SERVICE } from '../../../common/providers/tokens.js';
import type { MailService } from '../../../common/providers/mail/mail-service.interface.js';
import { RbacService } from '../../rbac/rbac.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { PasswordHasherService } from '../services/password-hasher.service.js';
import { TokenService } from '../services/token.service.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { User } from '../../../prisma-types.js';

// RegisterUseCase.execute is @Transactional() — that decorator requires a
// live TransactionHost bound via ClsPluginTransactional, which only exists
// after a real Nest module bootstrap (bare `new RegisterUseCase(...)`
// throws "TransactionHost not initialized"). NoOpTransactionalAdapter is
// the package's own answer for exactly this: a real transaction host that
// doesn't touch a database, so this stays a unit test — every repository
// dependency below is still a plain jest mock.
describe('RegisterUseCase', () => {
  const baseInput = {
    email: 'new@example.com',
    password: 'correcthorsebatterystaple',
    displayName: 'New User',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };

  async function buildUseCase() {
    const usersRepository: jest.Mocked<UsersRepository> = {
      findById: jest.fn(),
      findByEmail: jest
        .fn<UsersRepository['findByEmail']>()
        .mockResolvedValue(null),
      create: jest.fn<UsersRepository['create']>().mockResolvedValue({
        id: 'user-1',
        email: baseInput.email,
        displayName: baseInput.displayName,
        emailVerified: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      } as User),
      updatePasswordHash: jest.fn(),
      setEmailVerified: jest.fn(),
      recordFailedLogin: jest.fn(),
      resetFailedLogin: jest.fn(),
      lockUntil: jest.fn(),
    };
    const emailVerificationTokensRepository: jest.Mocked<EmailVerificationTokensRepository> =
      {
        create: jest
          .fn<EmailVerificationTokensRepository['create']>()
          .mockResolvedValue({} as never),
        findValidByHash: jest.fn(),
        markUsed: jest.fn(),
        invalidateAllForUser: jest.fn(),
      };
    const organizationsRepository: jest.Mocked<OrganizationsRepository> = {
      create: jest
        .fn<OrganizationsRepository['create']>()
        .mockResolvedValue({ id: 'org-1' } as never),
      addMember: jest.fn(),
    };
    const userPreferencesRepository: jest.Mocked<UserPreferencesRepository> = {
      createDefault: jest.fn(),
      findByUserId: jest.fn(),
    };
    const mailService: jest.Mocked<MailService> = { send: jest.fn() };
    const rbacService = {
      assignDefaultRole: jest.fn(),
      getRoleNamesForUser: jest.fn(),
    } as unknown as jest.Mocked<RbacService>;
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;
    const passwordHasher = {
      hash: jest
        .fn<PasswordHasherService['hash']>()
        .mockResolvedValue('hashed'),
      verify: jest.fn(),
    } as unknown as jest.Mocked<PasswordHasherService>;
    const tokenService = {
      generateOpaqueToken: jest.fn().mockReturnValue('raw-token'),
      hashOpaqueToken: jest.fn().mockReturnValue('hashed-token'),
    } as unknown as jest.Mocked<TokenService>;
    const configService = {
      get: jest.fn().mockReturnValue('http://localhost:3001'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;

    const moduleRef = await compileTransactionalTestingModule([
      RegisterUseCase,
      { provide: USERS_REPOSITORY, useValue: usersRepository },
      {
        provide: EMAIL_VERIFICATION_TOKENS_REPOSITORY,
        useValue: emailVerificationTokensRepository,
      },
      { provide: ORGANIZATIONS_REPOSITORY, useValue: organizationsRepository },
      {
        provide: USER_PREFERENCES_REPOSITORY,
        useValue: userPreferencesRepository,
      },
      { provide: MAIL_SERVICE, useValue: mailService },
      { provide: RbacService, useValue: rbacService },
      { provide: AuditService, useValue: auditService },
      { provide: PasswordHasherService, useValue: passwordHasher },
      { provide: TokenService, useValue: tokenService },
      { provide: ConfigService, useValue: configService },
    ]);

    const useCase = moduleRef.get(RegisterUseCase);

    return {
      useCase,
      usersRepository,
      emailVerificationTokensRepository,
      organizationsRepository,
      userPreferencesRepository,
      mailService,
      rbacService,
      auditService,
      passwordHasher,
    };
  }

  it('creates a user, default role, personal org, preferences, and sends a verification email', async () => {
    const deps = await buildUseCase();

    const result = await deps.useCase.execute(baseInput);

    expect(deps.passwordHasher.hash).toHaveBeenCalledWith(baseInput.password);
    expect(deps.usersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: baseInput.email, emailVerified: false }),
    );
    expect(deps.rbacService.assignDefaultRole).toHaveBeenCalledWith('user-1');
    expect(deps.organizationsRepository.create).toHaveBeenCalled();
    expect(deps.organizationsRepository.addMember).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'OWNER',
    );
    expect(deps.userPreferencesRepository.createDefault).toHaveBeenCalledWith(
      'user-1',
    );
    expect(deps.mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: baseInput.email }),
    );
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'REGISTER' }),
    );
    expect(result.user.emailVerified).toBe(false);
    expect(result.user.mfaEnabled).toBe(false);
  });

  it('rejects registration when the email is already taken', async () => {
    const deps = await buildUseCase();
    deps.usersRepository.findByEmail.mockResolvedValue({
      id: 'existing',
    } as User);

    await expect(deps.useCase.execute(baseInput)).rejects.toThrow(AppException);
    expect(deps.usersRepository.create).not.toHaveBeenCalled();
  });
});
