import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import type { LoginResponseDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  OAUTH_EXCHANGE_CODES_REPOSITORY,
  type OAuthExchangeCodesRepository,
} from '../domain/repositories/oauth-exchange-codes.repository.interface.js';
import {
  MFA_REPOSITORY,
  type MfaRepository,
} from '../domain/repositories/mfa.repository.interface.js';
import { TokenService } from '../services/token.service.js';
import { SessionIssuerService } from '../services/session-issuer.service.js';

export interface OAuthExchangeInput {
  code: string;
  ipAddress: string;
  userAgent: string;
}

const MFA_CHALLENGE_TOKEN_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class OAuthExchangeUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(OAUTH_EXCHANGE_CODES_REPOSITORY)
    private readonly oauthExchangeCodesRepository: OAuthExchangeCodesRepository,
    @Inject(MFA_REPOSITORY) private readonly mfaRepository: MfaRepository,
    private readonly tokenService: TokenService,
    private readonly sessionIssuer: SessionIssuerService,
  ) {}

  async execute(input: OAuthExchangeInput): Promise<LoginResponseDto> {
    const exchangeCode =
      await this.oauthExchangeCodesRepository.findValidByHash(
        this.tokenService.hashOpaqueToken(input.code),
      );
    if (!exchangeCode) {
      throw new AppException(
        'INVALID_OR_EXPIRED_TOKEN',
        'This OAuth exchange code is invalid or has expired.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.usersRepository.findById(exchangeCode.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppException(
        'INVALID_OR_EXPIRED_TOKEN',
        'This OAuth exchange code is invalid or has expired.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.oauthExchangeCodesRepository.markUsed(exchangeCode.id);

    // A hybrid account (OAuth + separately-enabled MFA) still needs the
    // MFA challenge — OAuth doesn't bypass it.
    const mfaFactor = await this.mfaRepository.findFactorByUserId(user.id);
    if (mfaFactor?.enabled) {
      const rawChallengeToken = this.tokenService.generateOpaqueToken();
      await this.mfaRepository.createChallengeToken(
        user.id,
        this.tokenService.hashOpaqueToken(rawChallengeToken),
        new Date(Date.now() + MFA_CHALLENGE_TOKEN_TTL_MS),
      );
      return { mfaRequired: true, mfaChallengeToken: rawChallengeToken };
    }

    return this.sessionIssuer.issue(user, {
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }
}
