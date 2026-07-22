import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  CreateReportCustomTemplateRequestDto,
  ReportCustomTemplateDto,
  UpdateReportCustomTemplateRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { Prisma } from '../../../prisma-types.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { toReportCustomTemplateDto } from '../mappers/to-report-custom-template-dto.mapper.js';

/// Report Builder's custom-template CRUD — one of the ~10 simple Module 9
/// entities that injects PrismaService directly rather than going through
/// a domain-repository interface (see docs/adr/0009's disclosed scope
/// trade-off note); workspace resolution still goes through the existing
/// Module 6 `resolveWorkspaceForCaller` (implicit personal workspace),
/// not the newer explicit-`workspaceId` Collaboration pattern, since
/// custom templates live inside the same personal-workspace-scoped
/// BugBountyModule as Programs/Findings/Reports.
export class CreateReportCustomTemplateCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateReportCustomTemplateRequestDto,
  ) {}
}

@CommandHandler(CreateReportCustomTemplateCommand)
export class CreateReportCustomTemplateHandler
  implements ICommandHandler<CreateReportCustomTemplateCommand, ReportCustomTemplateDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    command: CreateReportCustomTemplateCommand,
  ): Promise<ReportCustomTemplateDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      command.userId,
    );
    const template = await this.prisma.reportCustomTemplate.create({
      data: {
        workspaceId: workspace.id,
        name: command.data.name,
        description: command.data.description ?? null,
        sections: command.data.sections as unknown as Prisma.InputJsonValue,
        createdBy: command.userId,
      },
    });
    return toReportCustomTemplateDto(template);
  }
}

export class UpdateReportCustomTemplateCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly templateId: string,
    public readonly data: UpdateReportCustomTemplateRequestDto,
  ) {}
}

@CommandHandler(UpdateReportCustomTemplateCommand)
export class UpdateReportCustomTemplateHandler
  implements ICommandHandler<UpdateReportCustomTemplateCommand, ReportCustomTemplateDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    command: UpdateReportCustomTemplateCommand,
  ): Promise<ReportCustomTemplateDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      command.userId,
    );
    const existing = await this.prisma.reportCustomTemplate.findFirst({
      where: { id: command.templateId, workspaceId: workspace.id, deletedAt: null },
    });
    if (!existing) {
      throw new AppException(
        'REPORT_CUSTOM_TEMPLATE_NOT_FOUND',
        'Custom report template not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const updated = await this.prisma.reportCustomTemplate.update({
      where: { id: command.templateId },
      data: {
        ...(command.data.name !== undefined ? { name: command.data.name } : {}),
        ...(command.data.description !== undefined
          ? { description: command.data.description }
          : {}),
        ...(command.data.sections !== undefined
          ? { sections: command.data.sections as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    return toReportCustomTemplateDto(updated);
  }
}

export class DeleteReportCustomTemplateCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly templateId: string,
  ) {}
}

@CommandHandler(DeleteReportCustomTemplateCommand)
export class DeleteReportCustomTemplateHandler
  implements ICommandHandler<DeleteReportCustomTemplateCommand, void>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: DeleteReportCustomTemplateCommand): Promise<void> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      command.userId,
    );
    const existing = await this.prisma.reportCustomTemplate.findFirst({
      where: { id: command.templateId, workspaceId: workspace.id, deletedAt: null },
    });
    if (!existing) {
      throw new AppException(
        'REPORT_CUSTOM_TEMPLATE_NOT_FOUND',
        'Custom report template not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.reportCustomTemplate.update({
      where: { id: command.templateId },
      data: { deletedAt: new Date() },
    });
  }
}
