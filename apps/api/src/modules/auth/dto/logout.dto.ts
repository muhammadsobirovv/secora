import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import type { LogoutRequestDto } from '@pentesthub/shared';

export class LogoutDto implements LogoutRequestDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}
