import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  type Profile,
  type StrategyOptions,
} from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { OAuthProfileResult } from './oauth-profile.type.js';
import { StatelessOAuthStateStore } from './oauth-state.store.js';

/// No live Google credentials exist in this environment (see decision 8,
/// docs/adr/0001-auth-module.md). Falls back to placeholder option values
/// so the app still boots and the route exists — actually completing the
/// OAuth flow requires real GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL.
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  // See prisma.service.ts for why @Inject(ConfigService) is required here
  // (generic ConfigService<EnvConfig, true> param types lose their
  // design:paramtypes metadata under tsx/esbuild — doubly relevant here
  // since this class also extends a PassportStrategy(...) mixin).
  constructor(
    @Inject(ConfigService) configService: ConfigService<EnvConfig, true>,
  ) {
    const options = {
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
      // CSRF protection on the OAuth flow (architecture review §6, HIGH):
      // without a state param, an attacker can craft a callback link that
      // links the attacker's provider account to the victim's session, or
      // otherwise manipulate the callback. `store` is stateless (no
      // server-side session in this app — see oauth-state.store.ts) rather
      // than passport-oauth2's default session-backed state.
      state: true,
      store: new StatelessOAuthStateStore(
        configService.get('JWT_ACCESS_SECRET', { infer: true }),
      ),
    };
    // @types/passport-google-oauth20's StrategyOptions doesn't declare
    // `state`/`store` at all (passport-oauth2 supports both at runtime;
    // the community types for this specific package just don't reflect
    // it — a known gap, see architecture review §3 on these packages'
    // low maintenance activity). The cast is narrowly scoped to this
    // call; every field actually required by StrategyOptions is present
    // above.
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
