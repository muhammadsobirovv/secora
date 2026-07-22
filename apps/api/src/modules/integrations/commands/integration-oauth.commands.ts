import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CompleteOAuthConnectionRequestDto,
  IntegrationConnectionDto,
  StartOAuthConnectionRequestDto,
  StartOAuthConnectionResultDto,
} from '@pentesthub/shared';
import type { AuditEventType, Prisma } from '../../../prisma-types.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { encryptCredential } from '../../../common/utils/credential-encryption.util.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { requireEnterpriseRole } from '../../enterprise/enterprise-permissions.util.js';
import { toIntegrationConnectionDto } from '../mappers/to-integration-connection-dto.mapper.js';
import { IntegrationAdapterRegistryService } from '../integration-adapter-registry.service.js';
import { getOAuth2ProviderConfig, getOAuthClientCredentials } from '../oauth2-provider-config.js';
import { buildAuthorizeUrl, createOAuthState, exchangeAuthorizationCode, verifyOAuthState } from '../oauth-exchange.util.js';

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export class StartOAuthConnectionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: StartOAuthConnectionRequestDto,
  ) {}
}

@CommandHandler(StartOAuthConnectionCommand)
export class StartOAuthConnectionHandler
  implements ICommandHandler<StartOAuthConnectionCommand, StartOAuthConnectionResultDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly registry: IntegrationAdapterRegistryService,
  ) {}

  async execute(command: StartOAuthConnectionCommand): Promise<StartOAuthConnectionResultDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    if (!this.registry.isOAuthProvider(command.data.provider)) {
      throw new AppException(
        'INTEGRATION_PROVIDER_NOT_CONFIGURED',
        `Provider "${command.data.provider}" does not support OAuth connect; use a token-based connection instead.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const providerConfig = getOAuth2ProviderConfig(command.data.provider);
    if (!providerConfig) {
      throw new AppException('INTEGRATION_PROVIDER_NOT_CONFIGURED', `No OAuth configuration for "${command.data.provider}".`, HttpStatus.BAD_REQUEST);
    }
    const { clientId } = getOAuthClientCredentials(this.configService, command.data.provider);
    const callbackBase = this.configService.get('INTEGRATION_CALLBACK_BASE_URL', { infer: true });
    if (!clientId || !callbackBase) {
      throw new AppException(
        'INTEGRATION_PROVIDER_NOT_CONFIGURED',
        `The operator has not configured OAuth credentials for "${command.data.provider}" (missing client id or INTEGRATION_CALLBACK_BASE_URL).`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const encryptionKey = this.configService.get('CREDENTIAL_ENCRYPTION_KEY', { infer: true });
    const state = createOAuthState(
      { provider: command.data.provider, organizationId: command.organizationId, workspaceId: command.data.workspaceId ?? null, userId: command.userId },
      encryptionKey,
    );
    const redirectUri = `${callbackBase.replace(/\/$/, '')}/enterprise/organizations/${command.organizationId}/integrations/oauth/callback`;
    const authorizeUrl = buildAuthorizeUrl(providerConfig, { clientId, redirectUri, state });

    return { authorizeUrl, state };
  }
}

// ---------------------------------------------------------------------------
// Complete
// ---------------------------------------------------------------------------

export class CompleteOAuthConnectionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: CompleteOAuthConnectionRequestDto,
  ) {}
}

@CommandHandler(CompleteOAuthConnectionCommand)
export class CompleteOAuthConnectionHandler
  implements ICommandHandler<CompleteOAuthConnectionCommand, IntegrationConnectionDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly registry: IntegrationAdapterRegistryService,
  ) {}

  async execute(command: CompleteOAuthConnectionCommand): Promise<IntegrationConnectionDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const encryptionKey = this.configService.get('CREDENTIAL_ENCRYPTION_KEY', { infer: true });
    const statePayload = verifyOAuthState(command.data.state, encryptionKey);
    if (
      !statePayload ||
      statePayload.provider !== command.data.provider ||
      statePayload.organizationId !== command.organizationId ||
      statePayload.userId !== command.userId
    ) {
      throw new AppException('INTEGRATION_OAUTH_STATE_INVALID', 'Invalid or expired OAuth state.', HttpStatus.BAD_REQUEST);
    }

    const providerConfig = getOAuth2ProviderConfig(command.data.provider);
    if (!providerConfig) {
      throw new AppException('INTEGRATION_PROVIDER_NOT_CONFIGURED', `No OAuth configuration for "${command.data.provider}".`, HttpStatus.BAD_REQUEST);
    }
    const { clientId, clientSecret } = getOAuthClientCredentials(this.configService, command.data.provider);
    const callbackBase = this.configService.get('INTEGRATION_CALLBACK_BASE_URL', { infer: true });
    if (!clientId || !clientSecret || !callbackBase) {
      throw new AppException('INTEGRATION_PROVIDER_NOT_CONFIGURED', `OAuth credentials for "${command.data.provider}" are not configured.`, HttpStatus.SERVICE_UNAVAILABLE);
    }
    const redirectUri = `${callbackBase.replace(/\/$/, '')}/enterprise/organizations/${command.organizationId}/integrations/oauth/callback`;

    let accessToken: string;
    try {
      accessToken = await exchangeAuthorizationCode(providerConfig, { clientId, clientSecret, code: command.data.code, redirectUri });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppException('INTEGRATION_OAUTH_EXCHANGE_FAILED', message, HttpStatus.BAD_GATEWAY);
    }

    const adapter = this.registry.get(command.data.provider);
    const test = await adapter.testConnection(accessToken, null).catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }));

    const encryptedCredentials = encryptCredential(accessToken, encryptionKey);
    const workspaceId = command.data.workspaceId ?? statePayload.workspaceId;
    const existing = await this.prisma.integrationConnection.findFirst({
      where: { organizationId: command.organizationId, workspaceId: workspaceId ?? null, provider: command.data.provider },
    });
    const data = {
      organizationId: command.organizationId,
      workspaceId: workspaceId ?? null,
      provider: command.data.provider,
      credentials: encryptedCredentials,
      status: test.ok ? ('CONNECTED' as const) : ('ERROR' as const),
      connectedBy: command.userId,
    };
    const connection = existing
      ? await this.prisma.integrationConnection.update({ where: { id: existing.id }, data })
      : await this.prisma.integrationConnection.create({ data });

    const type: AuditEventType = 'INTEGRATION_CONNECTED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { organizationId: command.organizationId, provider: command.data.provider, via: 'oauth', ok: test.ok } as unknown as Prisma.InputJsonValue,
      },
    });

    return toIntegrationConnectionDto(connection);
  }
}
