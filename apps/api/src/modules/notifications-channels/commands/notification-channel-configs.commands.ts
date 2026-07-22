import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreateNotificationChannelConfigRequestDto,
  NotificationChannelConfigDto,
  TestNotificationChannelResultDto,
  UpdateNotificationChannelConfigRequestDto,
} from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { Prisma } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import { toNotificationChannelConfigDto } from '../mappers/to-channel-config-dto.mapper.js';
import { NotificationDispatcherService } from '../services/notification-dispatcher.service.js';
import { encryptChannelConfigSecrets } from '../notification-channel-config-crypto.util.js';

export class CreateNotificationChannelConfigCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly data: CreateNotificationChannelConfigRequestDto,
  ) {}
}

@CommandHandler(CreateNotificationChannelConfigCommand)
export class CreateNotificationChannelConfigHandler
  implements ICommandHandler<CreateNotificationChannelConfigCommand, NotificationChannelConfigDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(command: CreateNotificationChannelConfigCommand): Promise<NotificationChannelConfigDto> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);

    const encryptionKey = this.configService.get('CREDENTIAL_ENCRYPTION_KEY', {
      infer: true,
    });
    const encryptedConfig = encryptChannelConfigSecrets(
      command.data.config as Record<string, unknown>,
      encryptionKey,
    );

    const config = await this.prisma.notificationChannelConfig.create({
      data: {
        workspaceId: command.workspaceId,
        userId: command.userId,
        channel: command.data.channel,
        config: encryptedConfig as Prisma.InputJsonValue,
        enabled: command.data.enabled ?? true,
      },
    });
    return toNotificationChannelConfigDto(config);
  }
}

export class UpdateNotificationChannelConfigCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly configId: string,
    public readonly data: UpdateNotificationChannelConfigRequestDto,
  ) {}
}

@CommandHandler(UpdateNotificationChannelConfigCommand)
export class UpdateNotificationChannelConfigHandler
  implements ICommandHandler<UpdateNotificationChannelConfigCommand, NotificationChannelConfigDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(command: UpdateNotificationChannelConfigCommand): Promise<NotificationChannelConfigDto> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);

    const existing = await this.prisma.notificationChannelConfig.findFirst({
      where: { id: command.configId, workspaceId: command.workspaceId, userId: command.userId },
    });
    if (!existing) {
      throw new AppException('NOTIFICATION_CHANNEL_CONFIG_NOT_FOUND', 'Notification channel not found.', HttpStatus.NOT_FOUND);
    }

    let encryptedConfig: Record<string, unknown> | undefined;
    if (command.data.config !== undefined) {
      const encryptionKey = this.configService.get('CREDENTIAL_ENCRYPTION_KEY', {
        infer: true,
      });
      encryptedConfig = encryptChannelConfigSecrets(
        command.data.config as Record<string, unknown>,
        encryptionKey,
      );
    }

    const updated = await this.prisma.notificationChannelConfig.update({
      where: { id: existing.id },
      data: {
        config: encryptedConfig as Prisma.InputJsonValue | undefined,
        enabled: command.data.enabled,
      },
    });
    return toNotificationChannelConfigDto(updated);
  }
}

export class DeleteNotificationChannelConfigCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly configId: string,
  ) {}
}

@CommandHandler(DeleteNotificationChannelConfigCommand)
export class DeleteNotificationChannelConfigHandler
  implements ICommandHandler<DeleteNotificationChannelConfigCommand, void>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteNotificationChannelConfigCommand): Promise<void> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    const existing = await this.prisma.notificationChannelConfig.findFirst({
      where: { id: command.configId, workspaceId: command.workspaceId, userId: command.userId },
    });
    if (!existing) {
      throw new AppException('NOTIFICATION_CHANNEL_CONFIG_NOT_FOUND', 'Notification channel not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.notificationChannelConfig.delete({ where: { id: existing.id } });
  }
}

export class TestNotificationChannelConfigCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly configId: string,
  ) {}
}

@CommandHandler(TestNotificationChannelConfigCommand)
export class TestNotificationChannelConfigHandler
  implements ICommandHandler<TestNotificationChannelConfigCommand, TestNotificationChannelResultDto>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  async execute(command: TestNotificationChannelConfigCommand): Promise<TestNotificationChannelResultDto> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    const config = await this.prisma.notificationChannelConfig.findFirst({
      where: { id: command.configId, workspaceId: command.workspaceId, userId: command.userId },
    });
    if (!config) {
      throw new AppException('NOTIFICATION_CHANNEL_CONFIG_NOT_FOUND', 'Notification channel not found.', HttpStatus.NOT_FOUND);
    }
    const result = await this.dispatcher.testChannel(config);
    return { channel: config.channel, delivered: result.delivered, error: result.error };
  }
}
