import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import type { VerifyEmailRequestDto } from '@pentesthub/shared';

export class VerifyEmailDto implements VerifyEmailRequestDto {
  @ApiProperty()
  @IsString()
  token!: string;
}
