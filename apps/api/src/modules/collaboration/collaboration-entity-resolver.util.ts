import { HttpStatus } from '@nestjs/common';
import type { CollaborationEntityType } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

/// Watcher/Reaction rows carry no `workspaceId` of their own (see
/// schema.prisma's `Watcher`/`Reaction` models) — they point at a
/// `CollaborationEntityType` + `entityId` pair, and the *entity itself*
/// is the single source of truth for which workspace it belongs to.
/// Every write/read path in watchers.commands.ts / reactions.commands.ts
/// / watchers.query.ts / reactions.query.ts calls this resolver first
/// and then checks the caller's membership in the *resolved* workspace —
/// never a workspaceId supplied by the client — so a caller cannot watch
/// or react to another tenant's finding/report/comment/session by
/// guessing its id. A missing/soft-deleted entity throws the same
/// generic 404 whether the id doesn't exist or belongs to a workspace
/// the caller isn't in, so probing ids can't distinguish the two
/// (enumeration-safe, matching the resolveXForCaller convention used
/// throughout Modules 1-15).
export async function resolveCollaborationEntityWorkspace(
  prisma: PrismaService,
  entityType: CollaborationEntityType,
  entityId: string,
): Promise<string> {
  switch (entityType) {
    case 'BUGBOUNTY_FINDING': {
      const row = await prisma.bugBountyFinding.findUnique({
        where: { id: entityId },
        select: { workspaceId: true, deletedAt: true },
      });
      if (!row || row.deletedAt) throw entityNotFound();
      return row.workspaceId;
    }
    case 'BUG_REPORT': {
      const row = await prisma.bugReport.findUnique({
        where: { id: entityId },
        select: { workspaceId: true },
      });
      if (!row) throw entityNotFound();
      return row.workspaceId;
    }
    case 'COMMENT': {
      const row = await prisma.comment.findUnique({
        where: { id: entityId },
        select: { workspaceId: true, deletedAt: true },
      });
      if (!row || row.deletedAt) throw entityNotFound();
      return row.workspaceId;
    }
    case 'RESEARCH_SESSION': {
      const row = await prisma.researchSession.findUnique({
        where: { id: entityId },
        select: { workspaceId: true },
      });
      if (!row) throw entityNotFound();
      return row.workspaceId;
    }
    // Module 17 -- Incident Management (task #470): incidents reuse this
    // same Watcher/Reaction/Comment collaboration layer -- see
    // CollaborationEntityType's doc comment in packages/shared.
    case 'INCIDENT': {
      const row = await prisma.incident.findUnique({
        where: { id: entityId },
        select: { workspaceId: true },
      });
      if (!row) throw entityNotFound();
      return row.workspaceId;
    }
    default: {
      const exhaustive: never = entityType;
      throw entityNotFound(exhaustive);
    }
  }
}

function entityNotFound(_unused?: never): AppException {
  return new AppException('COLLABORATION_ENTITY_NOT_FOUND', 'The target entity was not found.', HttpStatus.NOT_FOUND);
}
