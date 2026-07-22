import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { WorkflowDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { toWorkflowDto } from '../mappers/to-workflow-dto.mapper.js';

export class ListWorkflowsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(ListWorkflowsQuery)
export class ListWorkflowsHandler implements IQueryHandler<ListWorkflowsQuery, WorkflowDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListWorkflowsQuery): Promise<WorkflowDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const workflows = await this.prisma.workflow.findMany({
      where: { organizationId: query.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return workflows.map(toWorkflowDto);
  }
}

export class GetWorkflowQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly workflowId: string,
  ) {}
}

@QueryHandler(GetWorkflowQuery)
export class GetWorkflowHandler implements IQueryHandler<GetWorkflowQuery, WorkflowDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetWorkflowQuery): Promise<WorkflowDto> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: query.workflowId, organizationId: query.organizationId },
    });
    if (!workflow) {
      throw new AppException('WORKFLOW_NOT_FOUND', 'Workflow not found.', HttpStatus.NOT_FOUND);
    }
    return toWorkflowDto(workflow);
  }
}
