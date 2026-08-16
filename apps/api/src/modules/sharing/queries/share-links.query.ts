import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ShareLinkDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import { toShareLinkDto } from '../mappers/to-share-link-dto.mapper.js';

/// `workspaceId` is an optional *filter*, not an authorization decision:
/// when supplied, membership is verified before it's used in the query
/// (same pattern Comments/Assignments/etc. use for their path param).
/// When omitted, the query is scoped to every workspace the caller is
/// actually a member of — never "all share links" unscoped — resolved
/// via `WorkspaceMember`, so a caller can only ever see links for
/// workspaces they belong to either way.
export class ListShareLinksQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId?: string,
  ) {}
}

@QueryHandler(ListShareLinksQuery)
export class ListShareLinksHandler implements IQueryHandler<ListShareLinksQuery, ShareLinkDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListShareLinksQuery): Promise<ShareLinkDto[]> {
    let workspaceIds: string[];
    if (query.workspaceId) {
      await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);
      workspaceIds = [query.workspaceId];
    } else {
      const memberships = await this.prisma.workspaceMember.findMany({
        where: { userId: query.userId },
        select: { workspaceId: true },
      });
      workspaceIds = memberships.map((m) => m.workspaceId);
    }
    if (workspaceIds.length === 0) return [];

    const shareLinks = await this.prisma.shareLink.findMany({
      where: { workspaceId: { in: workspaceIds } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    // rawToken is null here deliberately — list responses never re-expose
    // the bearer token, only a masked prefix (see the mapper's doc
    // comment). The full token was only ever returned once, at creation.
    return shareLinks.map((s) => toShareLinkDto(s, null));
  }
}
