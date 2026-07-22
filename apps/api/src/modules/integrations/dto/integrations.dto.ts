import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type {
  CompleteOAuthConnectionRequestDto as CompleteOAuthShape,
  ConnectIntegrationRequestDto as ConnectShape,
  ExecuteIntegrationActionRequestDto as ExecuteActionShape,
  IntegrationProvider,
  StartOAuthConnectionRequestDto as StartOAuthShape,
  UpdateIntegrationConnectionRequestDto as UpdateShape,
} from '@pentesthub/shared';

const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  'GITHUB', 'GITLAB', 'JIRA', 'LINEAR',
  'SLACK', 'DISCORD', 'MS_TEAMS', 'TELEGRAM',
  'NOTION', 'OBSIDIAN', 'GOOGLE_DRIVE', 'DROPBOX',
  'AWS', 'AZURE', 'GCP',
];

export class ConnectIntegrationDto implements ConnectShape {
  @ApiProperty({ enum: INTEGRATION_PROVIDERS }) @IsIn(INTEGRATION_PROVIDERS) provider!: IntegrationProvider;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workspaceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @ApiProperty() @IsString() token!: string;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class UpdateIntegrationConnectionDto implements UpdateShape {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() token?: string;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class StartOAuthConnectionDto implements StartOAuthShape {
  @ApiProperty({ enum: INTEGRATION_PROVIDERS }) @IsIn(INTEGRATION_PROVIDERS) provider!: IntegrationProvider;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workspaceId?: string;
}

export class CompleteOAuthConnectionDto implements CompleteOAuthShape {
  @ApiProperty({ enum: INTEGRATION_PROVIDERS }) @IsIn(INTEGRATION_PROVIDERS) provider!: IntegrationProvider;
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() state!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workspaceId?: string;
}

export class ExecuteIntegrationActionDto implements ExecuteActionShape {
  @ApiProperty() @IsString() action!: string;
  @ApiProperty({ type: Object }) @IsObject() payload!: Record<string, unknown>;
}
