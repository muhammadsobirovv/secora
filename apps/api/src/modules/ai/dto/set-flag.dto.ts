import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/// Generic `{ value: boolean }` body shared by every pin/archive/bookmark
/// toggle endpoint in this module — pin conversation, archive
/// conversation, bookmark message, pin message all have the identical
/// shape, so one DTO class covers all four instead of four near-duplicate
/// files.
export class SetFlagDto {
  @ApiProperty()
  @IsBoolean()
  value!: boolean;
}
