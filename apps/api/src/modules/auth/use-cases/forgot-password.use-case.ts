import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RequestPasswordResetDto } from '@pentesthub/shared';
import { MAIL_SERVICE } from '../../../common/providers/tokens.js';
import type { MailService } from '../../../common/providers/mail/mail-service.interface.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  PASSWORD_RESET_TOKENS_REPOSITORY,
  type PasswordResetTokensRepository,
} from '../domain/repositories/password-reset-tokens.repository.interface.js';
import { TokenService } from '../services/token.service.js';

export interface ForgotPasswordInput extends RequestPasswordResetDto {
  ipAddress: string;
  userAgent: string;
}

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(PASSWORD_RESET_TOKENS_REPOSITORY)
    private readonly passwordResetTokensRepository: PasswordResetTokensRepository,
    @Inject(MAIL_SERVICE) private readonly mailService: MailService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  /// Always succeeds from the caller's perspective — never reveals whether
  /// the email exists. Only does real work if it does.
  async execute(input: ForgotPasswordInput): Promise<void> {
    const user = await this.usersRepository.findByEmail(input.email);
    if (!user) {
      return;
    }

    const rawToken = this.tokenService.generateOpaqueToken();
    await this.passwordResetTokensRepository.create(
      user.id,
      this.tokenService.hashOpaqueToken(rawToken),
      new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
    );

    const frontendUrl = this.configService.get('FRONTEND_URL', { infer: true });
    await this.mailService.send({
      to: user.email,
      subject: 'Reset your PentestHub AI password',
      text: `Reset your password: ${frontendUrl}/auth/reset-password?token=${rawToken}`,
    });

    await this.auditService.log({
      userId: user.id,
      type: 'PASSWORD_RESET_REQUESTED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }
}
