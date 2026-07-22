import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ConnectIntegrationRequestDto,
  IntegrationConnectionDto,
  TestIntegrationConnectionResultDto,
  UpdateIntegrationConnectionRequestDto,
} from '@pentesthub/shared';
import type { AuditEventType, Prisma } from '../../../prisma-types.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { encryptCredential, decryptCredential } from '../../../common/utils/credential-encryption.util.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { requireEnterpriseRole } from '../../enterprise/enterprise-permissions.util.js';
import { toIntegrationConnectionDto } from '../mappers/to-integration-connection-dto.mapper.js';
import { IntegrationAdapterRegistryService } from '../integration-adapter-registry.service.js';

async function writeIntegrationAuditEvent(
  prisma: PrismaService,
  userId: string,
  type: AuditEventType,
  metadata: Record<string, unknown>,
): Promise<void> {
  await prisma.auditEvent.create({
    data: { userId, type, ipAddress: '0.0.0.0', userAgent: 'api', metadata: metadata as unknown as Prisma.InputJsonValue },
  });
}

// ---------------------------------------------------------------------------
// Connect (token/PAT-based)
// ---------------------------------------------------------------------------

export class ConnectIntegrationCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: ConnectIntegrationRequestDto,
  ) {}
}

@CommandHandler(ConnectIntegrationCommand)
export class ConnectIntegrationHandler implements ICommandHandler<ConnectIntegrationCommand, IntegrationConnectionDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly registry: IntegrationAdapterRegistryService,
  ) {}

  async execute(command: ConnectIntegrationCommand): Promise<IntegrationConnectionDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const adapter = this.registry.get(command.data.provider);
    const encryptionKey = this.configService.get('CREDENTIAL_ENCRYPTION_KEY', { infer: true });
    const encryptedCredentials = encryptCredential(command.data.token, encryptionKey);

    // Verify the token actually works before persisting CONNECTED — a bad
    // token still gets stored (so the user can see/fix it in the UI
    // rather than losing the attempt entirely) but with status ERROR.
    const test = await adapter.testConnection(command.data.token, command.data.config ?? null).catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }));

    // Manual find-then-create/update instead of `.upsert()`: the unique
    // index is `[workspaceId, provider]`, and Postgres treats `NULL <>
    // NULL`, so an org-wide connection (`workspaceId: null`) can't rely
    // on `.upsert()` to dedupe — same reasoning as
    // `InstallPluginHandler` in the Plugin Marketplace module.
    const existing = await this.prisma.integrationConnection.findFirst({
      where: {
        organizationId: command.organizationId,
        workspaceId: command.data.workspaceId ?? null,
        provider: command.data.provider,
      },
    });
    const data = {
      organizationId: command.organizationId,
      workspaceId: command.data.workspaceId ?? null,
      provider: command.data.provider,
      displayName: command.data.displayName ?? null,
      credentials: encryptedCredentials,
      config: (command.data.config ?? null) as unknown as Prisma.InputJsonValue,
      status: test.ok ? ('CONNECTED' as const) : ('ERROR' as const),
      connectedBy: command.userId,
    };
    const connection = existing
      ? await this.prisma.integrationConnection.update({ where: { id: existing.id }, data })
      : await this.prisma.integrationConnection.create({ data });

    await writeIntegrationAuditEvent(this.prisma, command.userId, 'INTEGRATION_CONNECTED', {
      organizationId: command.organizationId,
      provider: command.data.provider,
      ok: test.ok,
    });

    return toIntegrationConnectionDto(connection);
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export class UpdateIntegrationConnectionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly connectionId: string,
    public readonly data: UpdateIntegrationConnectionRequestDto,
  ) {}
}

@CommandHandler(UpdateIntegrationConnectionCommand)
export class UpdateIntegrationConnectionHandler
  implements ICommandHandler<UpdateIntegrationConnectionCommand, IntegrationConnectionDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(command: UpdateIntegrationConnectionCommand): Promise<IntegrationConnectionDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const existing = await this.prisma.integrationConnection.findFirst({
      where: { id: command.connectionId, organizationId: command.organizationId },
    });
    if (!existing) {
      throw new AppException('INTEGRATION_CONNECTION_NOT_FOUND', 'Integration connection not found.', HttpStatus.NOT_FOUND);
    }

    let credentials = existing.credentials;
    if (command.data.token !== undefined) {
      const encryptionKey = this.configService.get('CREDENTIAL_ENCRYPTION_KEY', { infer: true });
      credentials = encryptCredential(command.data.token, encryptionKey);
    }

    const updated = await this.prisma.integrationConnection.update({
      where: { id: existing.id },
      data: {
        displayName: command.data.displayName !== undefined ? command.data.displayName : existing.displayName,
        credentials,
        config:
          command.data.config !== undefined
            ? (command.data.config as unknown as Prisma.InputJsonValue)
            : (existing.config as unknown as Prisma.InputJsonValue),
      },
    });
    return toIntegrationConnectionDto(updated);
  }
}

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

export class DisconnectIntegrationCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly connectionId: string,
  ) {}
}

@CommandHandler(DisconnectIntegrationCommand)
export class DisconnectIntegrationHandler implements ICommandHandler<DisconnectIntegrationCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DisconnectIntegrationCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const existing = await this.prisma.integrationConnection.findFirst({
      where: { id: command.connectionId, organizationId: command.organizationId },
    });
    if (!existing) {
      throw new AppException('INTEGRATION_CONNECTION_NOT_FOUND', 'Integration connection not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.integrationConnection.delete({ where: { id: existing.id } });

    await writeIntegrationAuditEvent(this.prisma, command.userId, 'INTEGRATION_DISCONNECTED', {
      organizationId: command.organizationId,
      provider: existing.provider,
    });
  }
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

export class TestIntegrationConnectionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly connectionId: string,
  ) {}
}

@CommandHandler(TestIntegrationConnectionCommand)
export class TestIntegrationConnectionHandler
  implements ICommandHandler<TestIntegrationConnectionCommand, TestIntegrationConnectionResultDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly registry: IntegrationAdapterRegistryService,
  ) {}

  async execute(command: TestIntegrationConnectionCommand): Promise<TestIntegrationConnectionResultDto> {
    await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);

    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id: command.connectionId, organizationId: command.organizationId },
    });
    if (!connection || !connection.credentials) {
      throw new AppException('INTEGRATION_CONNECTION_NOT_FOUND', 'Integration connection not found.', HttpStatus.NOT_FOUND);
    }

    const encryptionKey = this.configService.get('CREDENTIAL_ENCRYPTION_KEY', { infer: true });
    const credentials = decryptCredential(connection.credentials, encryptionKey);
    const adapter = this.registry.get(connection.provider);
    const config = (connection.config as Prisma.JsonObject as Record<string, unknown> | null) ?? null;
    const result = await adapter.testConnection(credentials, config);

    await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { status: result.ok ? 'CONNECTED' : 'ERROR' },
    });

    return result;
  }
}
