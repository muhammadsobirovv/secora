import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception.js';
import type { WorkspaceMemberRole } from '../../prisma-types.js';

/// The permission matrix (Module 9 spec: "Permission Matrix") — a simple
/// total order rather than a per-action ACL table, matching the Prisma
/// `WorkspaceMemberRole` enum's doc comment. OWNER and ADMIN are
/// Module 1's original roles (unchanged rank/meaning); MANAGER/TRIAGER/
/// REVIEWER are Module 9 additions slotted in between ADMIN and MEMBER.
const ROLE_RANK: Record<WorkspaceMemberRole, number> = {
  OWNER: 6,
  ADMIN: 5,
  MANAGER: 4,
  TRIAGER: 3,
  REVIEWER: 2,
  MEMBER: 1,
};

export function roleAtLeast(role: WorkspaceMemberRole, minimum: WorkspaceMemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/// Throws INSUFFICIENT_WORKSPACE_ROLE (403) if `role` doesn't meet
/// `minimum`. Used by Collaboration/Automation/Notification-channel/
/// Public-API command handlers for actions that shouldn't be available
/// to every workspace member (e.g. only MANAGER+ can create a Scheduled
/// Job; only ADMIN+ can invite members at ADMIN role or above).
export function requireRole(role: WorkspaceMemberRole, minimum: WorkspaceMemberRole): void {
  if (!roleAtLeast(role, minimum)) {
    throw new AppException(
      'INSUFFICIENT_WORKSPACE_ROLE',
      `This action requires the ${minimum} role or higher; you have ${role}.`,
      HttpStatus.FORBIDDEN,
    );
  }
}

/// A member can only grant/invite a role at or below their own rank —
/// prevents a TRIAGER from inviting someone in as ADMIN, for instance.
export function requireCanGrantRole(
  actingRole: WorkspaceMemberRole,
  targetRole: WorkspaceMemberRole,
): void {
  if (ROLE_RANK[targetRole] > ROLE_RANK[actingRole]) {
    throw new AppException(
      'INSUFFICIENT_WORKSPACE_ROLE',
      `Cannot grant a role (${targetRole}) higher than your own (${actingRole}).`,
      HttpStatus.FORBIDDEN,
    );
  }
}
