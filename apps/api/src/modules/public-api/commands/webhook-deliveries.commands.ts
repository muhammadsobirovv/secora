import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { WebhookDeliveryDto } from '@pentesthub/shared';
import type { AuditEventType, Prisma } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import { requireRole } from '../../collaboration/permissions.util.js';
import { toWebhookDeliveryDto } from '../mappers/to-webhook-delivery-dto.mapper.js';

/// Re-queues a FAILED/DEAD_LETTER delivery as a fresh PENDING row
/// (attempt reset to 0, immediate `nextAttemptAt`) rather than mutating
/// the original delivery in place — preserves the original attempt's
/// failure history for audit/debugging while letting
/// WebhookDeliveryQueueService's next tick pick the new row up exactly
/// like any other pending delivery.
export class RedeliverWebhookDeliveryCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly webhookId: string,
    public readonly deliveryId: string,
  ) {}
}

@CommandHandler(RedeliverWebhookDeliveryCommand)
export class RedeliverWebhookDeliveryHandler
  implements ICommandHandler<RedeliverWebhookDeliveryCommand, WebhookDeliveryDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RedeliverWebhookDeliveryCommand): Promise<WebhookDeliveryDto> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    requireRole(role, 'MANAGER');

    const webhook = await this.prisma.webhookToken.findFirst({
      where: { id: command.webhookId, workspaceId: command.workspaceId },
    });
    if (!webhook) {
      throw new AppException('WEBHOOK_TOKEN_NOT_FOUND', 'Webhook not found.', HttpStatus.NOT_FOUND);
    }

    const original = await this.prisma.webhookDelivery.findFirst({
      where: { id: command.deliveryId, webhookTokenId: webhook.id },
    });
    if (!original) {
      throw new AppException('WEBHOOK_DELIVERY_NOT_FOUND', 'Webhook delivery not found.', HttpStatus.NOT_FOUND);
    }
    if (original.status !== 'FAILED' && original.status !== 'DEAD_LETTER') {
      throw new AppException(
        'WEBHOOK_DELIVERY_NOT_REDELIVERABLE',
        'Only FAILED or DEAD_LETTER deliveries can be redelivered.',
        HttpStatus.CONFLICT,
      );
    }

    const redelivered = await this.prisma.webhookDelivery.create({
      data: {
        webhookTokenId: webhook.id,
        event: original.event,
        payload: original.payload as unknown as Prisma.InputJsonValue,
        status: 'PENDING',
        nextAttemptAt: new Date(),
      },
    });

    const type: AuditEventType = 'WEBHOOK_DELIVERY_REDELIVERED';
    await this.prisma.auditEvent.create({
      data: {
        userId: command.userId,
        type,
        ipAddress: '0.0.0.0',
        userAgent: 'api',
        metadata: { webhookTokenId: webhook.id, originalDeliveryId: original.id, newDeliveryId: redelivered.id },
      },
    });

    return toWebhookDeliveryDto(redelivered);
  }
}
