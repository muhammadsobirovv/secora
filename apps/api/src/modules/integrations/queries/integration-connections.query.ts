import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { IntegrationConnectionDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { toIntegrationConnectionDto } from '../mappers/to-integration-connection-dto.mapper.js';

export class ListIntegrationConnectionsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly workspaceId?: string,
  ) {}
}

@QueryHandler(ListIntegrationConnectionsQuery)
export class ListIntegrationConnectionsHandler implements IQueryHandler<ListIntegrationConnectionsQuery, IntegrationConnectionDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListIntegrationConnectionsQuery): Promise<IntegrationConnectionDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const rows = await this.prisma.integrationConnection.findMany({
      where: {
        organizationId: query.organizationId,
        ...(query.workspaceId !== undefined ? { workspaceId: query.workspaceId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toIntegrationConnectionDto);
  }
}
