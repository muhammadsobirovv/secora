import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/// Registered globally (APP_GUARD) — every route requires a valid access
/// token unless explicitly marked @Public(). Secure-by-default so a route
/// added without thinking about auth is protected, not open.
///
/// Module 10 addition: `getRequest()` is overridden so this same guard
/// also authenticates GraphQL resolvers (`modules/graphql-api/`) — passport
/// strategies authenticate against a real Express `req`, and a GraphQL
/// `ExecutionContext`'s `switchToHttp()` doesn't expose one the way an HTTP
/// route's does. `GqlExecutionContext.create(context).getContext().req` is
/// the standard NestJS pattern for unwrapping the underlying Express
/// request from inside a GraphQL resolver's context, populated by
/// `@nestjs/apollo`'s default Express context factory (`{ req }`). REST
/// behavior is completely unchanged — this only branches for
/// `context.getType() === 'graphql'`.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  getRequest(context: ExecutionContext) {
    if (context.getType<'graphql'>() === 'graphql') {
      return GqlExecutionContext.create(context).getContext().req;
    }
    return context.switchToHttp().getRequest();
  }
}
