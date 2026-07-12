import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import type { AccessTokenPayload } from '../services/token.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    // Explicit @Inject(ConfigService) here (not just relying on the
    // constructor's type annotation) because this class extends a
    // dynamically-created mixin (PassportStrategy(...)): TypeScript's
    // emitted design:paramtypes metadata for a mixin subclass constructor
    // isn't reliable once ANY other parameter in the same constructor uses
    // @Inject — Nest then can't resolve the un-decorated parameter at
    // runtime ("argument at index [0] is available" / undefined
    // dependency). Decorating every parameter sidesteps the reflection gap
    // entirely instead of depending on it.
    @Inject(ConfigService) configService: ConfigService<EnvConfig, true>,
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  /// Re-checks user.status on every request (one indexed PK lookup) — a
  /// suspension/lock takes effect within the access-token TTL window
  /// instead of waiting for it to expire (see decision 7,
  /// docs/adr/0001-auth-module.md).
  async validate(payload: AccessTokenPayload): Promise<RequestUser> {
    const user = await this.usersRepository.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      roles: payload.roles,
      sessionId: payload.sessionId,
    };
  }
}
