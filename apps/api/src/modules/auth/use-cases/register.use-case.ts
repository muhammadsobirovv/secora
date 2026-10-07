import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type {
  RegisterRequestDto,
  RegisterResponseDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { Prisma, type User } from '../../../prisma-types.js';
import { MAIL_SERVICE } from '../../../common/providers/tokens.js';
import type { MailService } from '../../../common/providers/mail/mail-service.interface.js';
import { generateUniqueSlug } from '../../../common/utils/slug.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AuditService } from '../../audit/audit.service.js';
import { RbacService } from '../../rbac/rbac.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
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
import { LEGAL_VERSION } from '@pentesthub/shared';
import { LegalService } from '../../legal/legal.service.js';

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
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly userPreferencesRepository: UserPreferencesRepository,
    @Inject(MAIL_SERVICE) private readonly mailService: MailService,
    // Explicit token, same reason as the ConfigService @Inject below:
    // under this project's tsx/esbuild toolchain, implicit class-type
    // constructor injection for RbacService specifically resolves to
    // `undefined` at runtime (first surfaced the first time this app was
    // actually booted end-to-end) — plain @Inject(RbacService) sidesteps
    // whatever metadata-emission edge case causes it.
    @Inject(RbacService) private readonly rbacService: RbacService,
    private readonly auditService: AuditService,
    // Explicit token for the same tsx/esbuild metadata reason as RbacService.
    @Inject(LegalService) private readonly legalService: LegalService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokenService: TokenService,
    // See prisma.service.ts for why @Inject(ConfigService) is required
    // here (generic ConfigService<EnvConfig, true> param types lose their
    // design:paramtypes metadata under tsx/esbuild).
    @Inject(ConfigService)
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  /// Runs the User + default-role + personal-Workspace + default-
  /// UserPreferences writes in one transaction (via nestjs-cls) so a
  /// failure partway through never leaves an orphaned account.
  @Transactional()
  async execute(input: RegisterInput): Promise<RegisterResponseDto> {
    // Server-side enforcement of the signup checkbox: no account is created
    // unless the client sends the current legal version as accepted.
    if (input.acceptedLegalVersion !== LEGAL_VERSION) {
      throw new AppException(
        'LEGAL_ACCEPTANCE_REQUIRED',
        'You must accept the current Terms of Service, Acceptable Use Policy and Privacy Policy to create an account.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.usersRepository.findByEmail(input.email);
    if (existing) {
      throw new AppException(
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists.',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    // The findByEmail check above is TOCTOU-vulnerable: two concurrent
    // registrations for the same email can both pass it before either
    // commits. The unique constraint on User.email is the real guard —
    // catch its violation here and map it to the same 409 the pre-check
    // returns, instead of letting a raw P2002 surface as a 500.
    let user: User;
    try {
      user = await this.usersRepository.create({
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        emailVerified: false,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'EMAIL_ALREADY_REGISTERED',
          'An account with this email already exists.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }

    await this.rbacService.assignDefaultRole(user.id);

    // Same transaction as the account itself: an account never exists
    // without its acceptance record.
    await this.legalService.recordAcceptance({
      userId: user.id,
      version: input.acceptedLegalVersion,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    const workspace = await this.workspacesRepository.create({
      name: `${input.displayName}'s Workspace`,
      slug: generateUniqueSlug(input.displayName),
    });
    await this.workspacesRepository.addMember(workspace.id, user.id, 'OWNER');

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
      metadata: { workspaceId: workspace.id },
    });

    return {
      user: toAuthenticatedUserDto(user, false),
      message:
        'Registration successful. Please check your email to verify your account.',
    };
  }
}
