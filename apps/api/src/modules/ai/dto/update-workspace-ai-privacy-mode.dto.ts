import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { AiPrivacyMode, UpdateWorkspaceAiPrivacyModeRequestDto as UpdateWorkspaceAiPrivacyModeShape } from '@pentesthub/shared';
import { AI_PRIVACY_MODES } from '@pentesthub/shared';

/// Module 11 — Privacy controls (task #234).
export class UpdateWorkspaceAiPrivacyModeDto implements UpdateWorkspaceAiPrivacyModeShape {
  @ApiProperty({ enum: AI_PRIVACY_MODES })
  @IsIn(AI_PRIVACY_MODES)
  mode!: AiPrivacyMode;
}
