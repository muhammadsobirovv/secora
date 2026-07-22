import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  ApprovalRequestDto,
  ApprovalWorkflowDto,
  CustomRoleDto,
  ListApprovalRequestsQueryDto,
  PermissionGroupDto,
  ResourcePermissionDto,
  TemporaryPermissionDto,
} from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../organization-membership.util.js';
import {
  toApprovalRequestDto,
  toApprovalWorkflowDto,
  toCustomRoleDto,
  toPermissionGroupDto,
  toResourcePermissionDto,
  toTemporaryPermissionDto,
} from '../mappers/to-enterprise-dto.mapper.js';

export class ListCustomRolesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(ListCustomRolesQuery)
export class ListCustomRolesHandler implements IQueryHandler<ListCustomRolesQuery, CustomRoleDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListCustomRolesQuery): Promise<CustomRoleDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const roles = await this.prisma.customRole.findMany({
      where: { organizationId: query.organizationId },
      include: { permissions: true },
      orderBy: { createdAt: 'asc' },
    });
    return roles.map(toCustomRoleDto);
  }
}

export class ListPermissionGroupsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(ListPermissionGroupsQuery)
export class ListPermissionGroupsHandler implements IQueryHandler<ListPermissionGroupsQuery, PermissionGroupDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListPermissionGroupsQuery): Promise<PermissionGroupDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const groups = await this.prisma.permissionGroup.findMany({
      where: { organizationId: query.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return groups.map(toPermissionGroupDto);
  }
}

export class ListResourcePermissionsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(ListResourcePermissionsQuery)
export class ListResourcePermissionsHandler
  implements IQueryHandler<ListResourcePermissionsQuery, ResourcePermissionDto[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListResourcePermissionsQuery): Promise<ResourcePermissionDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const rules = await this.prisma.resourcePermission.findMany({
      where: { organizationId: query.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rules.map(toResourcePermissionDto);
  }
}

export class ListTemporaryPermissionsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(ListTemporaryPermissionsQuery)
export class ListTemporaryPermissionsHandler
  implements IQueryHandler<ListTemporaryPermissionsQuery, TemporaryPermissionDto[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListTemporaryPermissionsQuery): Promise<TemporaryPermissionDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const grants = await this.prisma.temporaryPermission.findMany({
      where: { organizationId: query.organizationId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return grants.map(toTemporaryPermissionDto);
  }
}

export class ListApprovalWorkflowsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(ListApprovalWorkflowsQuery)
export class ListApprovalWorkflowsHandler
  implements IQueryHandler<ListApprovalWorkflowsQuery, ApprovalWorkflowDto[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListApprovalWorkflowsQuery): Promise<ApprovalWorkflowDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const workflows = await this.prisma.approvalWorkflow.findMany({
      where: { organizationId: query.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return workflows.map(toApprovalWorkflowDto);
  }
}

export class ListApprovalRequestsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly filter: ListApprovalRequestsQueryDto,
  ) {}
}

@QueryHandler(ListApprovalRequestsQuery)
export class ListApprovalRequestsHandler
  implements IQueryHandler<ListApprovalRequestsQuery, ApprovalRequestDto[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListApprovalRequestsQuery): Promise<ApprovalRequestDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const requests = await this.prisma.approvalRequest.findMany({
      where: {
        organizationId: query.organizationId,
        status: query.filter.status,
        workflowId: query.filter.workflowId,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return requests.map(toApprovalRequestDto);
  }
}
