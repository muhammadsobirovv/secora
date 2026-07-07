import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { OAuthProfileResult } from './oauth-profile.type.js';

/// No live Google credentials exist in this environment (see decision 8,
/// docs/adr/0001-auth-module.md). Falls back to placeholder option values
/// so the app still boots and the route exists — actually completing the
/// OAuth flow requires real GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL.
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService<EnvConfig, true>) {
    super({
      clientID:
        configService.get('GOOGLE_CLIENT_ID', { infer: true }) ??
        'not-configured',
      clientSecret:
        configService.get('GOOGLE_CLIENT_SECRET', { infer: true }) ??
        'not-configured',
      callbackURL:
        configService.get('GOOGLE_CALLBACK_URL', { infer: true }) ??
        'http://localhost/oauth/not-configured',
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ): OAuthProfileResult {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new UnauthorizedException(
        'Google account has no accessible email.',
      );
    }
    return {
      provider: 'GOOGLE',
      providerUserId: profile.id,
      email,
      displayName: profile.displayName || email,
      accessToken,
      refreshToken,
    };
  }
}
