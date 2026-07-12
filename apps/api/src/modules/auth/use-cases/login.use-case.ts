import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LoginRequestDto, LoginResponseDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import type { EnvConfig } from '../../../config/env.validation.js';
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
import { SessionIssuerService } from '../services/session-issuer.service.js';

export interface LoginInput extends LoginRequestDto {
  ipAddress: string;
  userAgent: string;
}

const MFA_CHALLENGE_TOKEN_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(MFA_REPOSITORY) private readonly mfaRepository: MfaRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokenService: TokenService,
    private readonly sessionIssuer: SessionIssuerService,
    private readonly auditService: AuditService,
    // See prisma.service.ts for why @Inject(ConfigService) is required
    // here.
    @Inject(ConfigService)
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(input: LoginInput): Promise<LoginResponseDto> {
    const user = await this.usersRepository.findByEmail(input.email);

    // Same error for "no such user", "OAuth-only account" (no password to
    // check against), and "wrong password" — never leak which case it was.
    if (!user || !user.passwordHash || user.status === 'DELETED') {
      throw this.invalidCredentials();
    }

    if (user.status === 'SUSPENDED') {
      throw new AppException(
        'ACCOUNT_SUSPENDED',
        'This account has been suspended.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppException(
        'ACCOUNT_LOCKED',
        'Too many failed login attempts. Try again later.',
        HttpStatus.FORBIDDEN,
      );
    }

    const passwordValid = await this.passwordHasher.verify(
      user.passwordHash,
      input.password,
    );
    if (!passwordValid) {
      const updated = await this.usersRepository.recordFailedLogin(user.id);
      await this.auditService.log({
        userId: user.id,
        type: 'LOGIN_FAILURE',
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });

      const maxAttempts = this.configService.get(
        'ACCOUNT_LOCKOUT_MAX_ATTEMPTS',
        { infer: true },
      );
      if (updated.failedLoginCount >= maxAttempts) {
        const lockoutMinutes = this.configService.get(
          'ACCOUNT_LOCKOUT_MINUTES',
          { infer: true },
        );
        await this.usersRepository.lockUntil(
          user.id,
          new Date(Date.now() + lockoutMinutes * 60_000),
        );
        await this.auditService.log({
          userId: user.id,
          type: 'ACCOUNT_LOCKED',
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        });
      }

      throw this.invalidCredentials();
    }

    await this.usersRepository.resetFailedLogin(user.id);

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

    await this.auditService.log({
      userId: user.id,
      type: 'LOGIN_SUCCESS',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return this.sessionIssuer.issue(user, {
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      rememberMe: input.rememberMe,
    });
  }

  private invalidCredentials(): AppException {
    return new AppException(
      'INVALID_CREDENTIALS',
      'Invalid email or password.',
      HttpStatus.UNAUTHORIZED,
    );
  