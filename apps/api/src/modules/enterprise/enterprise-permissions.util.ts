import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception.js';
import type { EnterpriseRole } from '../../prisma-types.js';

/// The ten-level enterprise role total order (Module 10 spec). Mirrors
/// `collaboration/permissions.util.ts`'s `ROLE_RANK` pattern exactly, one
/// rank per rung — SUPER_ADMIN is a platform-wide rank above ORG_OWNER
/// (a super admin can act across every tenant; reserved for the platform
/// operator, not handed out by an org itself).
const ROLE_RANK: Record<EnterpriseRole, number> = {
  SUPER_ADMIN: 10,
  ORG_OWNER: 9,
  ADMIN: 8,
  SECURITY_MANAGER: 7,
  TEAM_LEAD: 6,
  PENTESTER: 5,
  BUG_HUNTER: 4,
  DEVELOPER: 3,
  VIEWER: 2,
  GUEST: 1,
};

export function enterpriseRoleAtLeast(role: EnterpriseRole, minimum: EnterpriseRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/// Throws INSUFFICIENT_ENTERPRISE_ROLE (403) if `role` doesn't meet
/// `minimum`. Used by every enterprise command handler that isn't open to
/// every organization member (e.g. only ADMIN+ manages departments/teams/
/// custom roles; only ORG_OWNER+ can change organization settings).
export function requireEnterpriseRole(role: EnterpriseRole, minimum: EnterpriseRole): void {
  if (!enterpriseRoleAtLeast(role, minimum)) {
    throw new AppException(
      'INSUFFICIENT_ENTERPRISE_ROLE',
      `This action requires the ${minimum} role or higher; you have ${role}.`,
      HttpStatus.FORBIDDEN,
    );
  }
}

/// A member can only grant/invite a role at or below their own rank — same
/// rule Module 9's `requireCanGrantRole` enforces for workspace roles,
/// applied here to the organization-wide role ladder.
export function requireCanGrantEnterpriseRole(
  actingRole: EnterpriseRole,
  targetRole: EnterpriseRole,
): void {
  if (ROLE_RANK[targetRole] > ROLE_RANK[actingRole]) {
    throw new AppException(
      'INSUFFICIENT_ENTERPRISE_ROLE',
      `Cannot grant a role (${targetRole}) higher than your own (${actingRole}).`,
      HttpStatus.FORBIDDEN,
    );
  }
}

export function enterpriseRoleRank(role: EnterpriseRole): number {
  return ROLE_RANK[role];
}
