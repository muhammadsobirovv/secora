import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { PluginInstallationDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { toPluginInstallationDto } from '../mappers/to-plugin-dto.mapper.js';

export class ListPluginInstallationsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly workspaceId?: string,
  ) {}
}

@QueryHandler(ListPluginInstallationsQuery)
export class ListPluginInstallationsHandler
  implements IQueryHandler<ListPluginInstallationsQuery, PluginInstallationDto[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListPluginInstallationsQuery): Promise<PluginInstallationDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const installations = await this.prisma.pluginInstallation.findMany({
      where: { organizationId: query.organizationId, workspaceId: query.workspaceId },
      orderBy: { installedAt: 'desc' },
    });
    return installations.map(toPluginInstallationDto);
  }
}
