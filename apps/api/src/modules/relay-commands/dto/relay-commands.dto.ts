import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type {
  CompleteRelayCommandRequestDto as CompleteShape,
  ListPendingRelayCommandsQueryDto as ListPendingShape,
  RelayCommandTarget,
} from '@pentesthub/shared';

const RELAY_COMMAND_TARGETS: RelayCommandTarget[] = ['DESKTOP', 'BROWSER'];

export class ListPendingRelayCommandsQueryParamsDto implements ListPendingShape {
  @ApiProperty({ enum: RELAY_COMMAND_TARGETS }) @IsIn(RELAY_COMMAND_TARGETS) target!: RelayCommandTarget;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50) limit?: number;
}

export class CompleteRelayCommandDto implements CompleteShape {
  @ApiProperty() @IsBoolean() success!: boolean;
  @ApiPropertyOptional() @IsOptional() result?: unknown;
  @ApiPropertyOptional() @IsOptional() @IsString() errorMessage?: string;
}
