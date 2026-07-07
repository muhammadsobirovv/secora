import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import type { RequestPasswordResetDto as RequestPasswordResetShape } from '@pentesthub/shared';

// Named ForgotPasswordDto (not RequestPasswordResetDto) to avoid colliding
// with the shared interface it implements.
export class ForgotPasswordDto implements RequestPasswordResetShape {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;
}
