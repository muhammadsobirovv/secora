import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import type { AiPrivacyMode, UpdateWorkspaceAiPrivacyModeRequestDto as UpdateWorkspaceAiPrivacyModeShape } from '@pentesthub/shared';
import { AI_PRIVACY_MODES } from '@pentesthub/shared';

/// Module 11 — Privacy controls (task #234). confirmCloudUsage added in
/// Module 15 (task #341) — see WorkspaceAiPrivacySettingDto's doc comment
/// in packages/shared/src/ai.ts.
export class UpdateWorkspaceAiPrivacyModeDto implements UpdateWorkspaceAiPrivacyModeShape {
  @ApiProperty({ enum: AI_PRIVACY_MODES })
  @IsIn(AI_PRIVACY_MODES)
  mode!: AiPrivacyMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirmCloudUsage?: boolean;
}
