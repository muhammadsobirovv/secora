import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type {
  PublishSecurityAdvisoryRequestDto as PublishAdvisoryShape,
  RegisterMarketplacePublisherRequestDto as RegisterPublisherShape,
} from '@pentesthub/shared';

const ADVISORY_SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export class RegisterMarketplacePublisherDto implements RegisterPublisherShape {
  @ApiProperty() @IsString() @MaxLength(120) displayName!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() organizationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() websiteUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() supportEmail?: string;
  @ApiPropertyOptional({ description: 'PEM-encoded Ed25519 public key' })
  @IsOptional()
  @IsString()
  publicKeyPem?: string;
}

export class PublishSecurityAdvisoryDto implements PublishAdvisoryShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() pluginId?: string;
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiProperty() @IsString() @MaxLength(5000) description!: string;
  @ApiProperty({ enum: ADVISORY_SEVERITIES }) @IsIn(ADVISORY_SEVERITIES) severity!: (typeof ADVISORY_SEVERITIES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() affectedVersionRange?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() patchedVersion?: string;
}

/// Module 15 — Plugin permission enforcement (task #334). Body-only
/// shape for `POST .../plugin-installations/:id/permissions/grant` — the
/// installation id is already the route param, so unlike
/// `GrantPluginPermissionsRequestDto` (`@pentesthub/shared`) this local
/// DTO doesn't repeat it in the body.
export class GrantPluginPermissionsBodyDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) permissions!: string[];
}
