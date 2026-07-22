import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import type { BackupPolicyDto, UpsertBackupPolicyRequestDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { requireEnterpriseRole } from '../../enterprise/enterprise-permissions.util.js';
import { toBackupPolicyDto } from '../mappers/to-compliance-dto.mapper.js';

export class UpsertBackupPolicyCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: UpsertBackupPolicyRequestDto,
  ) {}
}

/// One BackupPolicy per organization (schema's `@@unique([organizationId])`)
/// — upsert, same reasoning as retention policies.
@CommandHandler(UpsertBackupPolicyCommand)
export class UpsertBackupPolicyHandler implements ICommandHandler<UpsertBackupPolicyCommand, BackupPolicyDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpsertBackupPolicyCommand): Promise<BackupPolicyDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const policy = await this.prisma.backupPolicy.upsert({
      where: { organizationId: command.organizationId },
      create: {
        organizationId: command.organizationId,
        frequency: command.data.frequency,
        retentionCount: command.data.retentionCount ?? 7,
      },
      update: {
        frequency: command.data.frequency,
        retentionCount: command.data.retentionCount,
      },
    });
    return toBackupPolicyDto(policy);
  }
}
