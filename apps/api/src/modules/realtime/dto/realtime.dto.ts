import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import type { TypingSignalRequestDto as TypingSignalShape } from '@pentesthub/shared';

export class WorkspaceScopedQueryParamsDto {
  @ApiProperty() @IsString() workspaceId!: string;
}

export class TypingSignalDto implements TypingSignalShape {
  @ApiProperty() @IsString() @MaxLength(100) entityType!: string;
  @ApiProperty() @IsString() @MaxLength(200) entityId!: string;
}
