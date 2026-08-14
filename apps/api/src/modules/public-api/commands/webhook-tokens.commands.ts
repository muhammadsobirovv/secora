import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import type { CreateWebhookTokenRequestDto, UpdateWebhookTokenRequestDto, WebhookTokenDto } from '@pentesthub/shared';
import type { AuditEventType } from '../../../prisma-types.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  encryptCredential,
  decryptCredential,
} from '../../../common/utils/credential-encryption.util.js';
import { assertSafeWebhookUrl } from '../../../common/utils/ssrf-guard.util.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import { requireRole } from '../../collaboration/permissions.util.js';
import { toWebhookTokenDto } from '../mappers/to-webhook-token-dto.mapper.js';

export class CreateWebhookTokenCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly data: CreateWebhookTokenRequestDto,
  ) {}
}

@CommandHandler(CreateWebhookTokenCommand)
export class CreateWebhookTokenHandler implements ICommandHandler<CreateWebhookTokenCommand, WebhookTokenDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(command: CreateWebhookTokenCommand): Promise<WebhookTokenDto> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    requireRole(role, 'MANAGER');

    // Module 15 — task #344 security hardening: reject webhook URLs that
    // resolve to loopback/private/link-local/internal addresses before
    // ever storing them. Re-checked again at actual delivery time in
    // WebhookDeliveryQueueService (DNS can change after creation).
    await assertSafeWebhookUrl(command.data.url);

    // HMAC signing secret — sent to the receiving endpoint only indirectly
    // (as an `X-PentestHub-Signature` header computed from it, never in
    // the payload itself), same never-store-plaintext-secrets-if-avoidable
    // posture as the rest of this codebase, though here the secret must
    // remain retrievable (unlike a password) since it's needed on every
    // delivery — stored via the same AES-256-GCM encryption service as
    // AiProviderCredential.encryptedApiKey (see
    // common/utils/credential-encryption.util.ts), keyed off
    // CREDENTIAL_ENCRYPTION_KEY, rather than plaintext.
    const rawSecret = randomBytes(32).toString('hex');
    const encryptionKey = this.configService.get('CREDENTIAL_ENCRYPTION_KEY', {
      infer: true,
    });
    const secret = encryptCredential(rawSecret, encryptionKey);

    const webhook = await this.prisma.webhookToken.create({
      data: {
        workspaceId: command.workspaceId,
        name: command.data.name,
        url: command.data.url,
        secret,
        events: command.data.events,
        createdBy: command.userId,
      },
    });

    const type: AuditEventType = 'WEBHOOK_TOKEN_CREATED';
    await this.prisma.auditEvent.create({
      data: { userId: command.userId, type, ipAddress: '0.0.0.0', userAgent: 'api', metadata: { webhookTokenId: webhook.id } },
    });

    return toWebhookTokenDto(webhook);
  }
}

export class UpdateWebhookTokenCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly webhookId: string,
    public readonly data: UpdateWebhookTokenRequestDto,
  ) {}
}

@CommandHandler(UpdateWebhookTokenCommand)
export class UpdateWebhookTokenHandler implements ICommandHandler<UpdateWebhookTokenCommand, WebhookTokenDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateWebhookTokenCommand): Promise<WebhookTokenDto> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    requireRole(role, 'MANAGER');

    const existing = await this.prisma.webhookToken.findFirst({
      where: { id: command.webhookId, workspaceId: command.workspaceId },
    });
    if (!existing) {
      throw new AppException('WEBHOOK_TOKEN_NOT_FOUND', 'Webhook not found.', HttpStatus.NOT_FOUND);
    }

    const updated = await this.prisma.webhookToken.update({
      where: { id: existing.id },
      data: { name: command.data.name, events: command.data.events, enabled: command.data.enabled },
    });
    return toWebhookTokenDto(updated);
  }
}

export class DeleteWebhookTokenCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly webhookId: string,
  ) {}
}

@CommandHandler(DeleteWebhookTokenCommand)
export class DeleteWebhookTokenHandler implements ICommandHandler<DeleteWebhookTokenCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteWebhookTokenCommand): Promise<void> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    requireRole(role, 'MANAGER');

    const existing = await this.prisma.webhookToken.findFirst({
      where: { id: command.webhookId, workspaceId: command.workspaceId },
    });
    if (!existing) {
      throw new AppException('WEBHOOK_TOKEN_NOT_FOUND', 'Webhook not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.webhookToken.update({ where: { id: existing.id }, data: { revokedAt: new Date(), enabled: false } });

    const type: AuditEventType = 'WEBHOOK_TOKEN_REVOKED';
    await this.prisma.auditEvent.create({
      data: { userId: command.userId, type, ipAddress: '0.0.0.0', userAgent: 'api', metadata: { webhookTokenId: existing.id } },
    });
  }
}

/// Sends a small `{"event":"test","message":"..."}` payload to the
/// configured URL, HMAC-signed the same way a real delivery would be —
/// lets a user confirm their receiving endpoint is reachable and their
/// signature verification is wired correctly before relying on it.
export class TestWebhookTokenCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly webhookId: string,
  ) {}
}

@CommandHandler(TestWebhookTokenCommand)
export class TestWebhookTokenHandler
  implements ICommandHandler<TestWebhookTokenCommand, { delivered: boolean; statusCode: number | null; error: string | null }>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(
    command: TestWebhookTokenCommand,
  ): Promise<{ delivered: boolean; statusCode: number | null; error: string | null }> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);

    const webhook = await this.prisma.webhookToken.findFirst({
      where: { id: command.webhookId, workspaceId: command.workspaceId },
    });
    if (!webhook) {
      throw new AppException('WEBHOOK_TOKEN_NOT_FOUND', 'Webhook not found.', HttpStatus.NOT_FOUND);
    }

    const encryptionKey = this.configService.get('CREDENTIAL_ENCRYPTION_KEY', {
      infer: true,
    });
    const rawSecret = decryptCredential(webhook.secret, encryptionKey);

    const body = JSON.stringify({ event: 'test', message: 'PentestHub AI webhook test delivery', sentAt: new Date().toISOString() });
    const signature = createHmac('sha256', rawSecret).update(body).digest('hex');

    // Module 15 — task #344: re-check at send time, not just at creation
    // time — a hostname that resolved safely when the webhook was created
    // can be re-pointed at an internal address later (DNS rebinding).
    try {
      await assertSafeWebhookUrl(webhook.url);
    } catch (error) {
      return {
        delivered: false,
        statusCode: null,
        error: error instanceof AppException ? error.message : 'Webhook URL failed the safety check.',
      };
    }

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PentestHub-Signature': signature },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      await this.prisma.webhookToken.update({ where: { id: webhook.id }, data: { lastTriggeredAt: new Date() } });
      return { delivered: response.ok, statusCode: response.status, error: response.ok ? null : `HTTP ${response.status}` };
    } catch (error) {
      return { delivered: false, statusCode: null, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
