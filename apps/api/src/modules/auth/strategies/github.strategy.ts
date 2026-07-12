import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type StrategyOptions } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { OAuthProfileResult } from './oauth-profile.type.js';
import { StatelessOAuthStateStore } from './oauth-state.store.js';

/// No live GitHub credentials exist in this environment (see decision 8,
/// docs/adr/0001-auth-module.md). Falls back to placeholder option values
/// so the app still boots and the route exists — actually completing the
/// OAuth flow requires real GITHUB_CLIENT_ID/SECRET/CALLBACK_URL.
@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  // See prisma.service.ts for why @Inject(ConfigService) is required here
  // (generic ConfigService<EnvConfig, true> param types lose their
  // design:paramtypes metadata under tsx/esbuild — doubly relevant here
  // since this class also extends a PassportStrategy(...) mixin).
  constructor(
    @Inject(ConfigService) configService: ConfigService<EnvConfig, true>,
  ) {
    const options = {
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
      // CSRF protection on the OAuth flow — see google.strategy.ts for the
      // full rationale; identical stateless state-store pattern here.
      state: true,
      store: new StatelessOAuthStateStore(
        configService.get('JWT_ACCESS_SECRET', { infer: true }),
      ),
    };
    // See google.strategy.ts for the full rationale — @types/passport-
    // github2 declares `state?: string`, but passport-oauth2 accepts
    // `state: true` at runtime to mean "use the configured store"; the
    // community types don't reflect that. Cast is narrowly scoped to
    // this call.
    super(options as unknown as StrategyOptions);
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
    