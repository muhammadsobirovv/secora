import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';
import type {
  CreateNotificationChannelConfigRequestDto as CreateShape,
  NotificationChannel,
  NotificationChannelConfigPayload,
  UpdateNotificationChannelConfigRequestDto as UpdateShape,
} from '@pentesthub/shared';
import { NOTIFICATION_CHANNELS } from '@pentesthub/shared';

export class CreateNotificationChannelConfigDto implements CreateShape {
  @ApiProperty({ enum: NOTIFICATION_CHANNELS }) @IsIn(NOTIFICATION_CHANNELS) channel!: NotificationChannel;
  @ApiProperty({ type: Object }) @IsObject() config!: NotificationChannelConfigPayload;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateNotificationChannelConfigDto implements UpdateShape {
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() config?: NotificationChannelConfigPayload;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}
