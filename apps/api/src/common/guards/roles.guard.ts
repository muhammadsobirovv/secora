import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';

/// Registered globally (APP_GUARD), runs after JwtAuthGuard. A no-op unless
/// a route carries @Roles(...) — RBAC foundation only, see decision 8 in
/// docs/adr/0001-auth-module.md: no route uses this yet.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return requiredRoles.some((role) => request.user?.roles?.includes(role));
  }
}
