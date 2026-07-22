import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { BackupPolicyDto, ComplianceExportRequestDto, DataRetentionPolicyDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import {
  toBackupPolicyDto,
  toComplianceExportRequestDto,
  toDataRetentionPolicyDto,
} from '../mappers/to-compliance-dto.mapper.js';

export class ListDataRetentionPoliciesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(ListDataRetentionPoliciesQuery)
export class ListDataRetentionPoliciesHandler
  implements IQueryHandler<ListDataRetentionPoliciesQuery, DataRetentionPolicyDto[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListDataRetentionPoliciesQuery): Promise<DataRetentionPolicyDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const policies = await this.prisma.dataRetentionPolicy.findMany({
      where: { organizationId: query.organizationId },
      orderBy: { resourceType: 'asc' },
    });
    return policies.map(toDataRetentionPolicyDto);
  }
}

export class GetBackupPolicyQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(GetBackupPolicyQuery)
export class GetBackupPolicyHandler implements IQueryHandler<GetBackupPolicyQuery, BackupPolicyDto | null> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetBackupPolicyQuery): Promise<BackupPolicyDto | null> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const policy = await this.prisma.backupPolicy.findUnique({ where: { organizationId: query.organizationId } });
    return policy ? toBackupPolicyDto(policy) : null;
  }
}

export class ListComplianceExportRequestsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(ListComplianceExportRequestsQuery)
export class ListComplianceExportRequestsHandler
  implements IQueryHandler<ListComplianceExportRequestsQuery, ComplianceExportRequestDto[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListComplianceExportRequestsQuery): Promise<ComplianceExportRequestDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const requests = await this.prisma.complianceExportRequest.findMany({
      where: { organizationId: query.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return requests.map(toComplianceExportRequestDto);
  }
}

export class GetComplianceExportRequestQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly requestId: string,
  ) {}
}

@QueryHandler(GetComplianceExportRequestQuery)
export class GetComplianceExportRequestHandler
  implements IQueryHandler<GetComplianceExportRequestQuery, ComplianceExportRequestDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetComplianceExportRequestQuery): Promise<ComplianceExportRequestDto> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const request = await this.prisma.complianceExportRequest.findFirst({
      where: { id: query.requestId, organizationId: query.organizationId },
    });
    if (!request) {
      throw new AppException('COMPLIANCE_EXPORT_NOT_FOUND', 'Compliance export request not found.', HttpStatus.NOT_FOUND);
    }
    return toComplianceExportRequestDto(request);
  }
}
