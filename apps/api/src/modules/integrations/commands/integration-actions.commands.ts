import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExecuteIntegrationActionRequestDto, ExecuteIntegrationActionResultDto } from '@pentesthub/shared';
import type { Prisma } from '../../../prisma-types.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { decryptCredential } from '../../../common/utils/credential-encryption.util.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { IntegrationAdapterRegistryService } from '../integration-adapter-registry.service.js';
import { IntegrationActionError } from '../integration-adapter.interface.js';

export class ExecuteIntegrationActionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly connectionId: string,
    public readonly data: ExecuteIntegrationActionRequestDto,
  ) {}
}

/// Every provider action funnels through here — one authorization check
/// (must be an active org member; unlike Connect/Disconnect this does
/// NOT require ADMIN, since running an already-configured action, e.g.
/// "post this finding to Slack", is a routine day-to-day operation any
/// member should be able to trigger, not a connection-management one),
/// one decrypt, one adapter dispatch, one sync-log write.
@CommandHandler(ExecuteIntegrationActionCommand)
export class ExecuteIntegrationActionHandler
  implements ICommandHandler<ExecuteIntegrationActionCommand, ExecuteIntegrationActionResultDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly registry: IntegrationAdapterRegistryService,
  ) {}

  async execute(command: ExecuteIntegrationActionCommand): Promise<ExecuteIntegrationActionResultDto> {
    await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);

    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id: command.connectionId, organizationId: command.organizationId },
    });
    if (!connection || !connection.credentials) {
      throw new AppException('INTEGRATION_CONNECTION_NOT_FOUND', 'Integration connection not found.', HttpStatus.NOT_FOUND);
    }

    const adapter = this.registry.get(connection.provider);
    if (!adapter.actions.includes(command.data.action)) {
      throw new AppException(
        'INTEGRATION_ACTION_NOT_SUPPORTED',
        `Provider "${connection.provider}" does not support action "${command.data.action}". Supported: ${adapter.actions.join(', ')}.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const encryptionKey = this.configService.get('CREDENTIAL_ENCRYPTION_KEY', { infer: true });
    const credentials = decryptCredential(connection.credentials, encryptionKey);
    const config = (connection.config as Prisma.JsonObject as Record<string, unknown> | null) ?? null;

    try {
      const data = await adapter.execute(command.data.action, credentials, config, command.data.payload);
      await this.prisma.$transaction([
        this.prisma.integrationSyncLog.create({
          data: { connectionId: connection.id, direction: 'OUTBOUND', status: 'SUCCESS', message: command.data.action },
        }),
        this.prisma.integrationConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date(), status: 'CONNECTED' } }),
      ]);
      return { ok: true, data };
    } catch (error) {
      const message = error instanceof IntegrationActionError || error instanceof Error ? error.message : String(error);
      await this.prisma.$transaction([
        this.prisma.integrationSyncLog.create({
          data: { connectionId: connection.id, direction: 'OUTBOUND', status: 'ERROR', message },
        }),
        this.prisma.integrationConnection.update({ where: { id: connection.id }, data: { status: 'ERROR' } }),
      ]);
      throw new AppException('INTEGRATION_ACTION_FAILED', message, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }
}
