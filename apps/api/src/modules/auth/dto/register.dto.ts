import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { RegisterRequestDto } from '@pentesthub/shared';

export class RegisterDto implements RegisterRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName!: string;

  @ApiProperty({
    example: '2026-10-06',
    description:
      'LEGAL_VERSION of the Terms of Service, Acceptable Use Policy and Privacy Policy the user accepted. Must equal the current version.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  acceptedLegalVersion!: string;
}
