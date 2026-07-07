import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import type { RefreshRequestDto } from '@pentesthub/shared';

export class RefreshDto implements RefreshRequestDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}
