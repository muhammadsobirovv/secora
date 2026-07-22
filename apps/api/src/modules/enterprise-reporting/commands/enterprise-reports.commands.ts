import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type {
  CreateReportScheduleRequestDto,
  EnterpriseReportDto,
  GenerateEnterpriseReportRequestDto,
  ReportScheduleDto,
  UpdateReportScheduleRequestDto,
} from '@pentesthub/shared';
import type { Prisma } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { requireEnterpriseRole } from '../../enterprise/enterprise-permissions.util.js';
import { computeNextRunAt } from '../../automation/scheduled-job-cron.util.js';
import { ReportContentBuilderService } from '../report-content-builder.service.js';
import { toEnterpriseReportDto, toReportScheduleDto } from '../mappers/to-enterprise-report-dto.mapper.js';

// ---------------------------------------------------------------------------
// Generate report (on demand)
// ---------------------------------------------------------------------------

export class GenerateEnterpriseReportCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: GenerateEnterpriseReportRequestDto,
  ) {}
}

@CommandHandler(GenerateEnterpriseReportCommand)
export class GenerateEnterpriseReportHandler implements ICommandHandler<GenerateEnterpriseReportCommand, EnterpriseReportDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentBuilder: ReportContentBuilderService,
  ) {}

  async execute(command: GenerateEnterpriseReportCommand): Promise<EnterpriseReportDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'TEAM_LEAD');

    const periodStart = command.data.periodStart ? new Date(command.data.periodStart) : null;
    const periodEnd = command.data.periodEnd ? new Date(command.data.periodEnd) : null;

    const content = await this.contentBuilder.build({
      organizationId: command.organizationId,
      workspaceId: command.data.workspaceId ?? null,
      periodStart,
      periodEnd,
    });

    const report = await this.prisma.enterpriseReport.create({
      data: {
        organizationId: command.organizationId,
        workspaceId: command.data.workspaceId ?? null,
        type: command.data.type,
        title: command.data.title,
        periodStart,
        periodEnd,
        contentJson: content as unknown as Prisma.InputJsonValue,
        generatedBy: command.userId,
        generatedByAi: false,
      },
    });

    return toEnterpriseReportDto(report);
  }
}

// ---------------------------------------------------------------------------
// Report schedules
// ---------------------------------------------------------------------------

export class CreateReportScheduleCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: CreateReportScheduleRequestDto,
  ) {}
}

@CommandHandler(CreateReportScheduleCommand)
export class CreateReportScheduleHandler implements ICommandHandler<CreateReportScheduleCommand, ReportScheduleDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateReportScheduleCommand): Promise<ReportScheduleDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    let nextRunAt: Date;
    try {
      nextRunAt = computeNextRunAt(command.data.cronExpression);
    } catch (error) {
      throw new AppException(
        'WORKFLOW_DEFINITION_INVALID',
        `Invalid cron expression: ${error instanceof Error ? error.message : String(error)}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const schedule = await this.prisma.reportSchedule.create({
      data: {
        organizationId: command.organizationId,
        workspaceId: command.data.workspaceId ?? null,
        type: command.data.type,
        cronExpression: command.data.cronExpression,
        recipients: command.data.recipients,
        nextRunAt,
      },
    });
    return toReportScheduleDto(schedule);
  }
}

export class UpdateReportScheduleCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly scheduleId: string,
    public readonly data: UpdateReportScheduleRequestDto,
  ) {}
}

@CommandHandler(UpdateReportScheduleCommand)
export class UpdateReportScheduleHandler implements ICommandHandler<UpdateReportScheduleCommand, ReportScheduleDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateReportScheduleCommand): Promise<ReportScheduleDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const existing = await this.prisma.reportSchedule.findFirst({ where: { id: command.scheduleId, organizationId: command.organizationId } });
    if (!existing) {
      throw new AppException('REPORT_SCHEDULE_NOT_FOUND', 'Report schedule not found.', HttpStatus.NOT_FOUND);
    }

    let nextRunAt = existing.nextRunAt;
    if (command.data.cronExpression) {
      try {
        nextRunAt = computeNextRunAt(command.data.cronExpression);
      } catch (error) {
        throw new AppException(
          'WORKFLOW_DEFINITION_INVALID',
          `Invalid cron expression: ${error instanceof Error ? error.message : String(error)}`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const updated = await this.prisma.reportSchedule.update({
      where: { id: existing.id },
      data: {
        cronExpression: command.data.cronExpression ?? existing.cronExpression,
        recipients: command.data.recipients ?? existing.recipients,
        active: command.data.active ?? existing.active,
        nextRunAt,
      },
    });
    return toReportScheduleDto(updated);
  }
}

export class DeleteReportScheduleCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly scheduleId: string,
  ) {}
}

@CommandHandler(DeleteReportScheduleCommand)
export class DeleteReportScheduleHandler implements ICommandHandler<DeleteReportScheduleCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteReportScheduleCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const existing = await this.prisma.reportSchedule.findFirst({ where: { id: command.scheduleId, organizationId: command.organizationId } });
    if (!existing) {
      throw new AppException('REPORT_SCHEDULE_NOT_FOUND', 'Report schedule not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.reportSchedule.delete({ where: { id: existing.id } });
  }
}
