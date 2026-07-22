import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { DataRetentionPolicyDto, UpsertDataRetentionPolicyRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { requireEnterpriseRole } from '../../enterprise/enterprise-permissions.util.js';
import { toDataRetentionPolicyDto } from '../mappers/to-compliance-dto.mapper.js';

export class UpsertDataRetentionPolicyCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: UpsertDataRetentionPolicyRequestDto,
  ) {}
}

/// One policy per (organizationId, resourceType) — upsert rather than
/// separate create/update, since "set the retention window for X" is a
/// natural idempotent operation an admin re-runs as requirements change.
@CommandHandler(UpsertDataRetentionPolicyCommand)
export class UpsertDataRetentionPolicyHandler
  implements ICommandHandler<UpsertDataRetentionPolicyCommand, DataRetentionPolicyDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpsertDataRetentionPolicyCommand): Promise<DataRetentionPolicyDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const policy = await this.prisma.dataRetentionPolicy.upsert({
      where: { organizationId_resourceType: { organizationId: command.organizationId, resourceType: command.data.resourceType } },
      create: {
        organizationId: command.organizationId,
        resourceType: command.data.resourceType,
        retentionDays: command.data.retentionDays,
        autoDelete: command.data.autoDelete ?? false,
      },
      update: {
        retentionDays: command.data.retentionDays,
        autoDelete: command.data.autoDelete,
      },
    });
    return toDataRetentionPolicyDto(policy);
  }
}

export class DeleteDataRetentionPolicyCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly resourceType: string,
  ) {}
}

@CommandHandler(DeleteDataRetentionPolicyCommand)
export class DeleteDataRetentionPolicyHandler implements ICommandHandler<DeleteDataRetentionPolicyCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteDataRetentionPolicyCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const existing = await this.prisma.dataRetentionPolicy.findFirst({
      where: { organizationId: command.organizationId, resourceType: command.resourceType },
    });
    if (!existing) {
      throw new AppException('DATA_RETENTION_POLICY_NOT_FOUND', 'Data retention policy not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.dataRetentionPolicy.delete({ where: { id: existing.id } });
  }
}
