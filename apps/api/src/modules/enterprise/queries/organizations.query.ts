import { HttpStatus } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  DepartmentDto,
  ListOrganizationMembersQueryDto,
  OrganizationDto,
  OrganizationMemberDto,
  OrganizationSettingsDto,
  ResourceQuotaDto,
  TeamDto,
  TenantUsageDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../organization-membership.util.js';
import {
  toDepartmentDto,
  toOrganizationDto,
  toOrganizationMemberDto,
  toOrganizationSettingsDto,
  toResourceQuotaDto,
  toTeamDto,
} from '../mappers/to-enterprise-dto.mapper.js';

export class GetOrganizationQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(GetOrganizationQuery)
export class GetOrganizationHandler implements IQueryHandler<GetOrganizationQuery, OrganizationDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetOrganizationQuery): Promise<OrganizationDto> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const organization = await this.prisma.organization.findUnique({ where: { id: query.organizationId } });
    if (!organization) {
      throw new AppException('ORGANIZATION_NOT_FOUND', 'Organization not found.', HttpStatus.NOT_FOUND);
    }
    return toOrganizationDto(organization);
  }
}

export class ListMyOrganizationsQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ListMyOrganizationsQuery)
export class ListMyOrganizationsHandler implements IQueryHandler<ListMyOrganizationsQuery, OrganizationDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListMyOrganizationsQuery): Promise<OrganizationDto[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: query.userId, status: 'ACTIVE' },
      include: { organization: true },
      orderBy: { joinedAt: 'desc' },
    });
    return memberships.map((m) => toOrganizationDto(m.organization));
  }
}

export class GetOrganizationSettingsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(GetOrganizationSettingsQuery)
export class GetOrganizationSettingsHandler
  implements IQueryHandler<GetOrganizationSettingsQuery, OrganizationSettingsDto | null>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetOrganizationSettingsQuery): Promise<OrganizationSettingsDto | null> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId: query.organizationId },
    });
    return settings ? toOrganizationSettingsDto(settings) : null;
  }
}

export class GetResourceQuotaQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(GetResourceQuotaQuery)
export class GetResourceQuotaHandler implements IQueryHandler<GetResourceQuotaQuery, ResourceQuotaDto | null> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetResourceQuotaQuery): Promise<ResourceQuotaDto | null> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const quota = await this.prisma.resourceQuota.findUnique({ where: { organizationId: query.organizationId } });
    return quota ? toResourceQuotaDto(quota) : null;
  }
}

/// Module 14 — Tenant Management. See `TenantUsageDto`'s doc comment
/// (`@pentesthub/shared`) for why four of the eight fields are `null`
/// rather than computed — `workspaces`/`members`/`teams` are the only
/// ones with an existing, cheap, accurate `count()` available.
export class GetTenantUsageQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(GetTenantUsageQuery)
export class GetTenantUsageHandler implements IQueryHandler<GetTenantUsageQuery, TenantUsageDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetTenantUsageQuery): Promise<TenantUsageDto> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);

    const [workspaces, members, teams, quota] = await Promise.all([
      this.prisma.workspace.count({ where: { organizationId: query.organizationId } }),
      this.prisma.organizationMember.count({ where: { organizationId: query.organizationId } }),
      this.prisma.team.count({ where: { organizationId: query.organizationId } }),
      this.prisma.resourceQuota.findUnique({ where: { organizationId: query.organizationId } }),
    ]);

    return {
      organizationId: query.organizationId,
      workspaces,
      members,
      teams,
      storageMb: null,
      scansThisMonth: null,
      aiTokensThisMonth: null,
      apiKeysPerMember: null,
      webhooksPerWorkspace: null,
      quota: quota ? toResourceQuotaDto(quota) : null,
    };
  }
}

export class ListOrganizationMembersQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly filter: ListOrganizationMembersQueryDto,
  ) {}
}

@QueryHandler(ListOrganizationMembersQuery)
export class ListOrganizationMembersHandler
  implements IQueryHandler<ListOrganizationMembersQuery, OrganizationMemberDto[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListOrganizationMembersQuery): Promise<OrganizationMemberDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const members = await this.prisma.organizationMember.findMany({
      where: {
        organizationId: query.organizationId,
        role: query.filter.role,
        departmentId: query.filter.departmentId,
        status: query.filter.status,
      },
      orderBy: { joinedAt: 'asc' },
    });
    return members.map(toOrganizationMemberDto);
  }
}

export class ListDepartmentsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(ListDepartmentsQuery)
export class ListDepartmentsHandler implements IQueryHandler<ListDepartmentsQuery, DepartmentDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListDepartmentsQuery): Promise<DepartmentDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const departments = await this.prisma.department.findMany({
      where: { organizationId: query.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return departments.map(toDepartmentDto);
  }
}

export class ListTeamsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(ListTeamsQuery)
export class ListTeamsHandler implements IQueryHandler<ListTeamsQuery, TeamDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListTeamsQuery): Promise<TeamDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const teams = await this.prisma.team.findMany({
      where: { organizationId: query.organizationId },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return teams.map((t) => toTeamDto(t, t._count.members));
  }
}
