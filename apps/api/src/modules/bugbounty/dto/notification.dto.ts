import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import type { ListNotificationsQueryDto as Shape } from '@pentesthub/shared';

export class ListNotificationsQueryParamsDto implements Shape {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}
