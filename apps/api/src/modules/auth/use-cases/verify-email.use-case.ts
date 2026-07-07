import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import type { VerifyEmailRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
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

export interface VerifyEmailInput extends VerifyEmailRequestDto {
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(EMAIL_VERIFICATION_TOKENS_REPOSITORY)
    private readonly emailVerificationTokensRepository: EmailVerificationTokensRepository,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: VerifyEmailInput): Promise<void> {
    const token = await this.emailVerificationTokensRepository.findValidByHash(
      this.tokenService.hashOpaqueToken(input.token),
    );
    if (!token) {
      throw new AppException(
        'INVALID_OR_EXPIRED_TOKEN',
        'This verification link is invalid or has expired.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.usersRepository.setEmailVerified(token.userId);
    await this.emailVerificationTokensRepository.markUsed(token.id);

    await this.auditService.log({
      userId: token.userId,
      type: 'EMAIL_VERIFIED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }
}
