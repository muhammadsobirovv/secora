import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { RequestUser } from '../types/authenticated-request.js';

/// GraphQL-resolver analogue of `@CurrentUser()` (current-user.decorator.ts).
/// Kept as a separate decorator rather than modifying the existing one:
/// `@CurrentUser()` is used by ~150+ REST controller methods across every
/// prior module and calls `ctx.switchToHttp().getRequest()`, which throws
/// on a GraphQL execution context — a new, additive decorator avoids any
/// risk of touching that established surface. `GqlExecutionContext.create`
/// unwraps the underlying Express `req` (populated by the same global
/// `JwtAuthGuard` every REST route uses — see that guard's `getRequest()`
/// override for the matching GraphQL-context handling).
export const CurrentGqlUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const gqlContext = GqlExecutionContext.create(context);
    return gqlContext.getContext().req.user;
  },
);
