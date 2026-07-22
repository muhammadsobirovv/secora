import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { EnterpriseReportDto, ReportScheduleDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { toEnterpriseReportDto, toReportScheduleDto } from '../mappers/to-enterprise-report-dto.mapper.js';

export class ListEnterpriseReportsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(ListEnterpriseReportsQuery)
export class ListEnterpriseReportsHandler implements IQueryHandler<ListEnterpriseReportsQuery, EnterpriseReportDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListEnterpriseReportsQuery): Promise<EnterpriseReportDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const reports = await this.prisma.enterpriseReport.findMany({
      where: { organizationId: query.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return reports.map(toEnterpriseReportDto);
  }
}

export class GetEnterpriseReportQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly reportId: string,
  ) {}
}

@QueryHandler(GetEnterpriseReportQuery)
export class GetEnterpriseReportHandler implements IQueryHandler<GetEnterpriseReportQuery, EnterpriseReportDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetEnterpriseReportQuery): Promise<EnterpriseReportDto> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const report = await this.prisma.enterpriseReport.findFirst({ where: { id: query.reportId, organizationId: query.organizationId } });
    if (!report) {
      throw new AppException('ENTERPRISE_REPORT_NOT_FOUND', 'Report not found.', HttpStatus.NOT_FOUND);
    }
    return toEnterpriseReportDto(report);
  }
}

export class ListReportSchedulesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(ListReportSchedulesQuery)
export class ListReportSchedulesHandler implements IQueryHandler<ListReportSchedulesQuery, ReportScheduleDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListReportSchedulesQuery): Promise<ReportScheduleDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const schedules = await this.prisma.reportSchedule.findMany({ where: { organizationId: query.organizationId }, orderBy: { createdAt: 'desc' } });
    return schedules.map(toReportScheduleDto);
  }
}
