import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { DeleteAccountRequestDto } from '@pentesthub/shared';

/// Module 15 — Privacy controls (task #342).
export class DeleteAccountDto implements DeleteAccountRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;
}
