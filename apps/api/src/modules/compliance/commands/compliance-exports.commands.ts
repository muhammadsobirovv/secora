import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import type { ComplianceExportRequestDto, ComplianceExportScope } from '@pentesthub/shared';
import type { Prisma } from '../../../prisma-types.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { requireEnterpriseRole } from '../../enterprise/enterprise-permissions.util.js';
import { toComplianceExportRequestDto } from '../mappers/to-compliance-dto.mapper.js';

export class CreateComplianceExportRequestCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly scope: ComplianceExportScope,
  ) {}
}

/// Only creates the PENDING row — ComplianceExportProcessorService's
/// minute-tick poller does the actual export generation (building and
/// uploading a real JSON file via StorageService is I/O-heavy enough
/// that it doesn't belong inline in a request/response cycle, same
/// "queue it, let a poller do the work" split used for webhook delivery
/// and report scheduling elsewhere in Module 10).
@CommandHandler(CreateComplianceExportRequestCommand)
export class CreateComplianceExportRequestHandler
  implements ICommandHandler<CreateComplianceExportRequestCommand, ComplianceExportRequestDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateComplianceExportRequestCommand): Promise<ComplianceExportRequestDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const request = await this.prisma.complianceExportRequest.create({
      data: {
        organizationId: command.organizationId,
        requestedBy: command.userId,
        scope: (command.scope ?? {}) as unknown as Prisma.InputJsonValue,
        status: 'PENDING',
      },
    });
    return toComplianceExportRequestDto(request);
  }
}
