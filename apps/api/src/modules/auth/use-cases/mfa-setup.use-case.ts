import {
  Inject,
  Injectable,
  NotFoundException,
  HttpStatus,
} from '@nestjs/common';
import type { MfaSetupResponseDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  MFA_REPOSITORY,
  type MfaRepository,
} from '../domain/repositories/mfa.repository.interface.js';
import { TotpService } from '../services/totp.service.js';

@Injectable()
export class MfaSetupUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(MFA_REPOSITORY) private readonly mfaRepository: MfaRepository,
    private readonly totpService: TotpService,
  ) {}

  /// Idempotent — re-calling setup before confirming discards the prior
  /// unconfirmed factor and starts fresh, rather than erroring.
  async execute(userId: string): Promise<MfaSetupResponseDto> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const existingFactor = await this.mfaRepository.findFactorByUserId(userId);
    if (existingFactor?.enabled) {
      throw new AppException(
        'MFA_ALREADY_ENABLED',
        'MFA is already enabled for this account.',
        HttpStatus.CONFLICT,
      );
    }
    if (existingFactor) {
      await this.mfaRepository.deleteFactor(existingFactor.id);
    }

    const secret = this.totpService.generateSecret();
    await this.mfaRepository.createFactor(userId, secret);

    const otpAuthUrl = this.totpService.buildOtpAuthUrl(user.email, secret);
    const qrCodeDataUrl =
      await this.totpService.generateQrCodeDataUrl(otpAuthUrl);

    return { secret, otpAuthUrl, qrCodeDataUrl };
  }
}
