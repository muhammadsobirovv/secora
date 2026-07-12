import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import type { MfaDisableRequestDto } from '@pentesthub/shared';
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
import { PasswordHasherService } from '../services/password-hasher.service.js';
import { TokenService } from '../services/token.service.js';
import { TotpService } from '../services/totp.service.js';

export interface MfaDisableInput extends MfaDisableRequestDto {
  userId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class MfaDisableUseCase {
  constructor(
    @Inject(MFA_REPOSITORY) private readonly mfaRepository: MfaRepository,
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokenService: TokenService,
    private readonly totpService: TotpService,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: MfaDisableInput): Promise<void> {
    // Re-prove account ownership before permanently disabling MFA — see
    // MfaDisableRequestDto.currentPassword doc comment.
    const user = await this.usersRepository.findById(input.userId);
    const passwordValid =
      user?.passwordHash &&
      (await this.passwordHasher.verify(
        user.passwordHash,
        input.currentPassword,
      ));
    if (!passwordValid) {
      throw new AppException(
        'INVALID_CREDENTIALS',
        'Current password is incorrect.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const factor = await this.mfaRepository.findFactorByUserId(input.userId);
    if (!factor?.enabled) {
      throw new AppException(
        'MFA_NOT_ENABLED',
        'MFA is not enabled for this account.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const isTotpValid = await this.totpService.verifyCode(
      factor.secret,
      input.code,
    );
    let isBackupCodeValid = false;
    if (!isTotpValid) {
      const backupCode = await this.mfaRepository.findUnusedBackupCodeByHash(
        factor.id,
        this.tokenService.hashOpaqueToken(input.code),
      );
      isBackupCodeValid = Boolean(backupCode);
    }

    if (!isTotpValid && !isBackupCodeValid) {
      throw new AppException(
        'MFA_CODE_INVALID',
        'Invalid MFA code.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Delete rather than disable — re-setup always starts from a fresh
    // secret instead of silently re-enabling a possibly-compromised one.
    await this.mfaRepository.deleteFactor(factor.id);

    await this.auditService.log({
      userId: input.userId,
      type: 'MFA_DISABLED',
      ipAddress: input.ipAddress,
      userAgent: input.