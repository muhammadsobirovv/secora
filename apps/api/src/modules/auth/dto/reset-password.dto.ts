import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { ResetPasswordDto as ResetPasswordShape } from '@pentesthub/shared';

export class ResetPasswordDto implements ResetPasswordShape {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
