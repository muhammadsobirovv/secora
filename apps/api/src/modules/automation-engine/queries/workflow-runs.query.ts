import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { ListWorkflowRunsQueryDto, WorkflowRunDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { toWorkflowRunDto } from '../mappers/to-workflow-dto.mapper.js';

async function getOwnedWorkflow(prisma: PrismaService, organizationId: string, workflowId: string) {
  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, organizationId } });
  if (!workflow) {
    throw new AppException('WORKFLOW_NOT_FOUND', 'Workflow not found.', HttpStatus.NOT_FOUND);
  }
  return workflow;
}

export class ListWorkflowRunsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly workflowId: string,
    public readonly filter: ListWorkflowRunsQueryDto,
  ) {}
}

@QueryHandler(ListWorkflowRunsQuery)
export class ListWorkflowRunsHandler implements IQueryHandler<ListWorkflowRunsQuery, WorkflowRunDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListWorkflowRunsQuery): Promise<WorkflowRunDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const workflow = await getOwnedWorkflow(this.prisma, query.organizationId, query.workflowId);

    const runs = await this.prisma.workflowRun.findMany({
      where: {
        workflowId: workflow.id,
        ...(query.filter.status ? { status: query.filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.filter.limit ?? 50, 200),
    });
    return runs.map((run) => toWorkflowRunDto(run));
  }
}

export class GetWorkflowRunQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly workflowId: string,
    public readonly runId: string,
  ) {}
}

@QueryHandler(GetWorkflowRunQuery)
export class GetWorkflowRunHandler implements IQueryHandler<GetWorkflowRunQuery, WorkflowRunDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetWorkflowRunQuery): Promise<WorkflowRunDto> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const workflow = await getOwnedWorkflow(this.prisma, query.organizationId, query.workflowId);

    const run = await this.prisma.workflowRun.findFirst({
      where: { id: query.runId, workflowId: workflow.id },
      include: { steps: { orderBy: { startedAt: 'asc' } } },
    });
    if (!run) {
      throw new AppException('WORKFLOW_RUN_NOT_FOUND', 'Workflow run not found.', HttpStatus.NOT_FOUND);
    }
    return toWorkflowRunDto(run);
  }
}
