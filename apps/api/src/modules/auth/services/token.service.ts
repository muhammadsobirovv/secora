import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { EnvConfig } from '../../../config/env.validation.js';
import { parseDurationToSeconds } from '../../../common/utils/duration.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  sessionId: string;
}

/// Access tokens are signed JWTs (short-lived, stateless verification).
/// Refresh/verification/reset/challenge/exchange tokens — and MFA backup
/// codes — are opaque random strings, stored only as a sha256 hash: sha256
/// (not argon2) is appropriate because these are high-entropy crypto-random
/// values, not human-chosen secrets, so a presented value can be looked up
/// by hash directly rather than argon2-verified against every candidate.
/// See PasswordHasherService for the human-chosen-secret case (passwords).
@Injectable()
export class TokenService {
  // See prisma.service.ts for why @Inject(ConfigService) is required here.
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService)
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  generateOpaqueToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.configService.get('JWT_ACCESS_TTL', { infer: true }),
    });
  }

  getAccessTokenTtlSeconds(): number {
    return parseDurationToSeconds(
      this.configService.get('JWT_ACCESS_TTL', { infer: true }),
    );
  }

  getRefreshTokenExpiry(rememberMe: boolean): Date {
    const ttl = rememberMe
      ? this.configService.get('JWT_REFRESH_TTL_REMEMBER_ME', { infer: true })
      : this.configService.get('JWT_REFRESH_TTL', { infer: true });
    return new Date(Date.now() + parseDurationToSeconds(ttl) * 1000);
  }
}
