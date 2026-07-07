import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import type { ResendVerificationEmailRequestDto } from '@pentesthub/shared';

export class ResendVerificationEmailDto implements ResendVerificationEmailRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;
}
