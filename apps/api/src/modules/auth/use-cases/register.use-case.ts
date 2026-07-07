import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type {
  RegisterRequestDto,
  RegisterResponseDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { MAIL_SERVICE } from '../../../common/providers/tokens.js';
import type { MailService } from '../../../common/providers/mail/mail-service.interface.js';
import { generateUniqueSlug } from '../../../common/utils/slug.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AuditService } from '../../audit/audit.service.js';
import { RbacService } from '../../rbac/rbac.service.js';
import {
  ORGANIZATIONS_REPOSITORY,
  type OrganizationsRepository,
} from '../../organizations/domain/repositories/organizations.repository.interface.js';
import {
  USER_PREFERENCES_REPOSITORY,
  type UserPreferencesRepository,
} from '../../user-preferences/domain/repositories/user-preferences.repository.interface.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  EMAIL_VERIFICATION_TOKENS_REPOSITORY,
  type EmailVerificationTokensRepository,
} from '../domain/repositories/email-verification-tokens.repository.interface.js';
import { PasswordHasherService } from '../services/password-hasher.service.js';
import { TokenService } from '../services/token.service.js';
import { toAuthenticatedUserDto } from '../mappers/to-authenticated-user-dto.mapper.js';

export interface RegisterInput extends RegisterRequestDto {
  ipAddress: string;
  userAgent: string;
}

const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RegisterUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(EMAIL_VERIFICATION_TOKENS_REPOSITORY)
    private readonly emailVerificationTokensRepository: EmailVerificationTokensRepository,
    @Inject(ORGANIZATIONS_REPOSITORY)
    private readonly organizationsRepository: OrganizationsRepository,
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly userPreferencesRepository: UserPreferencesRepository,
    @Inject(MAIL_SERVICE) private readonly mailService: MailService,
    private readonly rbacService: RbacService,
    private readonly auditService: AuditService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  /// Runs the User + default-role + personal-Organization + default-
  /// UserPreferences writes in one transaction (via nestjs-cls) so a
  /// failure partway through never leaves an orphaned account.
  @Transactional()
  async execute(input: RegisterInput): Promise<RegisterResponseDto> {
    const existing = await this.usersRepository.findByEmail(input.email);
    if (existing) {
      throw new AppException(
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists.',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.usersRepository.create({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      emailVerified: false,
    });

    await this.rbacService.assignDefaultRole(user.id);

    const organization = await this.organizationsRepository.create({
      name: `${input.displayName}'s Workspace`,
      slug: generateUniqueSlug(input.displayName),
    });
    await this.organizationsRepository.addMember(
      organization.id,
      user.id,
      'OWNER',
    );

    await this.userPreferencesRepository.createDefault(user.id);

    const rawToken = this.tokenService.generateOpaqueToken();
    await this.emailVerificationTokensRepository.create(
      user.id,
      this.tokenService.hashOpaqueToken(rawToken),
      new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
    );
    const frontendUrl = this.configService.get('FRONTEND_URL', { infer: true });
    await this.mailService.send({
      to: user.email,
      subject: 'Verify your PentestHub AI account',
      text: `Welcome to PentestHub AI. Verify your email: ${frontendUrl}/auth/verify-email?token=${rawToken}`,
    });

    await this.auditService.log({
      userId: user.id,
      type: 'REGISTER',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { organizationId: organization.id },
    });

    return {
      user: toAuthenticatedUserDto(user, false),
      message:
        'Registration successful. Please check your email to verify your account.',
    };
  }
}
