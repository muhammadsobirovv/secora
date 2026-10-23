import { HttpStatus } from '@nestjs/common';
import type { ShareResourceType } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

export interface SharedResourcePreview {
  workspaceId: string;
  title: string;
}

/// Every ShareLink write/read path resolves the resource's *true* owning
/// workspace from the resource itself — never from a client-supplied
/// workspaceId — exactly like `collaboration-entity-resolver.util.ts`
/// does for Watchers/Reactions. `title` is returned alongside so the
/// public resolve endpoint can show "You've been shared: <title>"
/// without needing to expose the raw resource id, workspaceId, or any
/// other internal identifier to an unauthenticated caller (see
/// `PublicShareController` — the resolved payload deliberately omits
/// `workspaceId`).
///
/// EVIDENCE/PROJECT/DASHBOARD resolve through `Project.workspaceId`
/// (Evidence has no workspaceId column of its own — see schema.prisma);
/// DASHBOARD's `resourceId` is a projectId (there's no standalone
/// Dashboard entity — "sharing a dashboard" means sharing the read-only
/// project analytics view for that project).
export async function resolveShareResource(
  prisma: PrismaService,
  resourceType: ShareResourceType,
  resourceId: string,
): Promise<SharedResourcePreview> {
  switch (resourceType) {
    case 'REPORT': {
      const row = await prisma.bugReport.findUnique({
        where: { id: resourceId },
        select: { workspaceId: true, title: true },
      });
      if (!row) throw resourceNotFound();
      return { workspaceId: row.workspaceId, title: row.title };
    }
    case 'FINDING': {
      const row = await prisma.bugBountyFinding.findUnique({
        where: { id: resourceId },
        select: { workspaceId: true, title: true, deletedAt: true },
      });
      if (!row || row.deletedAt) throw resourceNotFound();
      return { workspaceId: row.workspaceId, title: row.title };
    }
    case 'EVIDENCE': {
      const row = await prisma.evidence.findUnique({
        where: { id: resourceId },
        select: { title: true, deletedAt: true, project: { select: { workspaceId: true } } },
      });
      if (!row || row.deletedAt) throw resourceNotFound();
      return { workspaceId: row.project.workspaceId, title: row.title };
    }
    case 'DASHBOARD':
    case 'PROJECT': {
      const row = await prisma.project.findUnique({
        where: { id: resourceId },
        select: { workspaceId: true, name: true, deletedAt: true },
      });
      if (!row || row.deletedAt) throw resourceNotFound();
      return { workspaceId: row.workspaceId, title: row.name };
    }
    case 'VULN_SCAN_REPORT': {
      const row = await prisma.vulnScanJob.findUnique({
        where: { id: resourceId },
        select: { workspaceId: true, target: { select: { value: true } } },
      });
      if (!row) throw resourceNotFound();
      return { workspaceId: row.workspaceId, title: `Security report: ${row.target.value}` };
    }
    default: {
      const exhaustive: never = resourceType;
      throw resourceNotFound(exhaustive);
    }
  }
}

function resourceNotFound(_unused?: never): AppException {
  return new AppException('SHARE_RESOURCE_NOT_FOUND', 'The resource you tried to share was not found.', HttpStatus.NOT_FOUND);
}
