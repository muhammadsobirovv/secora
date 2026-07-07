import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ResendVerificationEmailRequestDto } from '@pentesthub/shared';
import { MAIL_SERVICE } from '../../../common/providers/tokens.js';
import type { MailService } from '../../../common/providers/mail/mail-service.interface.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  EMAIL_VERIFICATION_TOKENS_REPOSITORY,
  type EmailVerificationTokensRepository,
} from '../domain/repositories/email-verification-tokens.repository.interface.js';
import { TokenService } from '../services/token.service.js';

export interface ResendVerificationEmailInput extends ResendVerificationEmailRequestDto {
  ipAddress: string;
  userAgent: string;
}

const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ResendVerificationEmailUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(EMAIL_VERIFICATION_TOKENS_REPOSITORY)
    private readonly emailVerificationTokensRepository: EmailVerificationTokensRepository,
    @Inject(MAIL_SERVICE) private readonly mailService: MailService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  /// Always succeeds from the caller's perspective — same don't-leak
  /// pattern as forgot-password.
  async execute(input: ResendVerificationEmailInput): Promise<void> {
    const user = await this.usersRepository.findByEmail(input.email);
    if (!user || user.emailVerified) {
      return;
    }

    await this.emailVerificationTokensRepository.invalidateAllForUser(user.id);

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
      text: `Verify your email: ${frontendUrl}/auth/verify-email?token=${rawToken}`,
    });

    await this.auditService.log({
      userId: user.id,
      type: 'VERIFICATION_EMAIL_RESENT',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }
}
