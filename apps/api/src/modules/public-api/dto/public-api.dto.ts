import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type {
  CreateApiKeyRequestDto as CreateApiKeyShape,
  CreateWebhookTokenRequestDto as CreateWebhookShape,
  ListApiKeysQueryDto as ListApiKeysShape,
  UpdateWebhookTokenRequestDto as UpdateWebhookShape,
  WebhookEventType,
} from '@pentesthub/shared';
import { WEBHOOK_EVENT_TYPES } from '@pentesthub/shared';

export class CreateApiKeyDto implements CreateApiKeyShape {
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workspaceId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) scopes?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(365) expiresInDays?: number;
}

export class ListApiKeysQueryParamsDto implements ListApiKeysShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() workspaceId?: string;
}

export class CreateWebhookTokenDto implements CreateWebhookShape {
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiProperty() @IsUrl({ require_tld: false }) url!: string;
  @ApiProperty({ enum: WEBHOOK_EVENT_TYPES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(WEBHOOK_EVENT_TYPES, { each: true })
  events!: WebhookEventType[];
}

export class UpdateWebhookTokenDto implements UpdateWebhookShape {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) name?: string;
  @ApiPropertyOptional({ enum: WEBHOOK_EVENT_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(WEBHOOK_EVENT_TYPES, { each: true })
  events?: WebhookEventType[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}
