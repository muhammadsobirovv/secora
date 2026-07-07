import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import type { AuthTokensDto, MfaChallengeRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  MFA_REPOSITORY,
  type MfaRepository,
} from '../domain/repositories/mfa.repository.interface.js';
import { TokenService } from '../services/token.service.js';
import { TotpService } from '../services/totp.service.js';
import { SessionIssuerService } from '../services/session-issuer.service.js';

export interface MfaChallengeInput extends MfaChallengeRequestDto {
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class MfaChallengeUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(MFA_REPOSITORY) private readonly mfaRepository: MfaRepository,
    private readonly tokenService: TokenService,
    private readonly totpService: TotpService,
    private readonly sessionIssuer: SessionIssuerService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: MfaChallengeInput): Promise<AuthTokensDto> {
    const challengeToken =
      await this.mfaRepository.findValidChallengeTokenByHash(
        this.tokenService.hashOpaqueToken(input.mfaChallengeToken),
      );
    if (!challengeToken) {
      throw new AppException(
        'MFA_CHALLENGE_EXPIRED',
        'This MFA challenge has expired. Please log in again.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.usersRepository.findById(challengeToken.userId);
    const mfaFactor = user
      ? await this.mfaRepository.findFactorByUserId(user.id)
      : null;
    if (!user || !mfaFactor?.enabled) {
      throw new AppException(
        'MFA_NOT_ENABLED',
        'MFA is not enabled for this account.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const isTotpValid = await this.totpService.verifyCode(
      mfaFactor.secret,
      input.code,
    );
    let isBackupCodeValid = false;
    if (!isTotpValid) {
      const backupCode = await this.mfaRepository.findUnusedBackupCodeByHash(
        mfaFactor.id,
        this.tokenService.hashOpaqueToken(input.code),
      );
      if (backupCode) {
        await this.mfaRepository.consumeBackupCode(backupCode.id);
        isBackupCodeValid = true;
      }
    }

    if (!isTotpValid && !isBackupCodeValid) {
      await this.auditService.log({
        userId: user.id,
        type: 'MFA_CHALLENGE_FAILURE',
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      throw new AppException(
        'MFA_CODE_INVALID',
        'Invalid MFA code.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.mfaRepository.consumeChallengeToken(challengeToken.id);
    await this.auditService.log({
      userId: user.id,
      type: 'MFA_CHALLENGE_SUCCESS',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return this.sessionIssuer.issue(user, {
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }
}
