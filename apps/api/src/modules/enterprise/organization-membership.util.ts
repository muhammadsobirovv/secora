import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { EnterpriseRole } from '../../prisma-types.js';

/// Resolves the caller's membership in a specific Organization — every
/// enterprise endpoint is organization-explicit (the client passes
/// `organizationId` in the URL), the same workspace-explicit pattern
/// Module 9's `resolveWorkspaceMembership` established for Collaboration,
/// applied one level up the new tenant hierarchy. Enumeration-safe: a
/// non-member gets the same 403 whether the organization exists or not.
export async function resolveOrganizationMembership(
  prisma: PrismaService,
  userId: string,
  organizationId: string,
): Promise<{ id: string; role: EnterpriseRole; departmentId: string | null }> {
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!member || member.status !== 'ACTIVE') {
    throw new AppException(
      'ORGANIZATION_MEMBERSHIP_NOT_FOUND',
      'You are not an active member of this organization.',
      HttpStatus.FORBIDDEN,
    );
  }
  return { id: member.id, role: member.role, departmentId: member.departmentId };
}
