import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { OAuthProfileResult } from './oauth-profile.type.js';

/// No live GitHub credentials exist in this environment (see decision 8,
/// docs/adr/0001-auth-module.md). Falls back to placeholder option values
/// so the app still boots and the route exists — actually completing the
/// OAuth flow requires real GITHUB_CLIENT_ID/SECRET/CALLBACK_URL.
@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(configService: ConfigService<EnvConfig, true>) {
    super({
      clientID:
        configService.get('GITHUB_CLIENT_ID', { infer: true }) ??
        'not-configured',
      clientSecret:
        configService.get('GITHUB_CLIENT_SECRET', { infer: true }) ??
        'not-configured',
      callbackURL:
        configService.get('GITHUB_CALLBACK_URL', { infer: true }) ??
        'http://localhost/oauth/not-configured',
      scope: ['user:email'],
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
        'GitHub account has no accessible email. Make sure a public/verified email is set.',
      );
    }
    return {
      provider: 'GITHUB',
      providerUserId: profile.id,
      email,
      displayName: profile.displayName || profile.username || email,
      accessToken,
      refreshToken,
    };
  }
}
