import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type {
  MfaConfirmRequestDto,
  MfaConfirmResponseDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  MFA_REPOSITORY,
  type MfaRepository,
} from '../domain/repositories/mfa.repository.interface.js';
import { TokenService } from '../services/token.service.js';
import { TotpService } from '../services/totp.service.js';

export interface MfaConfirmInput extends MfaConfirmRequestDto {
  userId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class MfaConfirmUseCase {
  constructor(
    @Inject(MFA_REPOSITORY) private readonly mfaRepository: MfaRepository,
    private readonly tokenService: TokenService,
    private readonly totpService: TotpService,
    private readonly auditService: AuditService,
  ) {}

  // Confirming the factor and replacing backup codes must commit
  // together — a partial failure would leave MFA "enabled" with stale or
  // missing backup codes.
  @Transactional()
  async execute(input: MfaConfirmInput): Promise<MfaConfirmResponseDto> {
    const factor = await this.mfaRepository.findFactorByUserId(input.userId);
    if (!factor) {
      throw new AppException(
        'MFA_NOT_ENABLED',
        'No MFA setup in progress. Call setup first.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (factor.enabled) {
      throw new AppException(
        'MFA_ALREADY_ENABLED',
        'MFA is already enabled for this account.',
        HttpStatus.CONFLICT,
      );
    }

    const isValid = await this.totpService.verifyCode(
      factor.secret,
      input.code,
    );
    if (!isValid) {
      throw new AppException(
        'MFA_CODE_INVALID',
        'Invalid MFA code.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.mfaRepository.confirmFactor(factor.id);

    const backupCodes = this.totpService.generateBackupCodes();
    await this.mfaRepository.replaceBackupCodes(
      factor.id,
      backupCodes.map((code) => this.tokenService.hashOpaqueToken(code)),
    );

    await this.auditService.log({
      userId: input.userId,
      type: 'MFA_ENABLED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    // Shown once — only the hashes are persisted.
    return { backupCodes };
  }
}
