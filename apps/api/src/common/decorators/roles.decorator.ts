import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/// RBAC foundation — no route uses this yet (see docs/adr/0001-auth-module.md),
/// but RolesGuard is wired globally and will enforce it the moment a future
/// module adds `@Roles("ADMIN")` to a route.
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
