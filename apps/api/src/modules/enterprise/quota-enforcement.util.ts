import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

/// Checks a single `ResourceQuota` field against a caller-supplied current
/// count and throws `QUOTA_EXCEEDED` (403) if the new total would exceed
/// it. `null`/missing quota means unlimited — free-tier defaults are
/// intentionally not seeded here; an organization with no `ResourceQuota`
/// row is treated as unrestricted until an operator sets one, so this
/// never silently blocks a newly created organization.
export async function checkQuota(
  prisma: PrismaService,
  organizationId: string,
  field: 'maxWorkspaces' | 'maxMembers' | 'maxTeams' | 'maxStorageMb' | 'maxScansPerMonth' | 'maxAiTokensPerMonth' | 'maxApiKeysPerMember' | 'maxWebhooksPerWorkspace',
  currentCount: number,
): Promise<void> {
  const quota = await prisma.resourceQuota.findUnique({ where: { organizationId } });
  const limit = quota?.[field];
  if (limit == null) {
    return;
  }
  if (currentCount >= limit) {
    throw new AppException(
      'QUOTA_EXCEEDED',
      `Organization quota exceeded for ${field} (limit: ${limit}).`,
      HttpStatus.FORBIDDEN,
    );
  }
}
