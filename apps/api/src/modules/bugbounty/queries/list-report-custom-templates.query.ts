import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { ReportCustomTemplateDto } from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { toReportCustomTemplateDto } from '../mappers/to-report-custom-template-dto.mapper.js';

export class ListReportCustomTemplatesQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ListReportCustomTemplatesQuery)
export class ListReportCustomTemplatesHandler
  implements IQueryHandler<ListReportCustomTemplatesQuery, ReportCustomTemplateDto[]>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    query: ListReportCustomTemplatesQuery,
  ): Promise<ReportCustomTemplateDto[]> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );
    const templates = await this.prisma.reportCustomTemplate.findMany({
      where: { workspaceId: workspace.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return templates.map(toReportCustomTemplateDto);
  }
}
