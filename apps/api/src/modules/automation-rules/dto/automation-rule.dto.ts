import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  AutomationRuleActionConfig,
  AutomationRuleStatus,
  AutomationRuleTriggerType,
} from '@pentesthub/shared';

const TRIGGER_TYPES: AutomationRuleTriggerType[] = [
  'KEV_MATCH',
  'INDICATOR_MATCH',
  'SLA_BREACH',
  'NEW_INTERNET_FACING_ASSET',
  'CUSTOM',
];

/// `actionConfig` stays `Record<string, unknown>` at the DTO layer —
/// class-validator has no clean way to validate a discriminated union by
/// a `kind` field, so `AutomationRulesService.validateActionConfig`
/// (called from `create`/`update`) is the actual source of truth for
/// "is this a well-formed NOTIFY/CREATE_INCIDENT/CREATE_REMEDIATION_TASK
/// action," throwing `AUTOMATION_RULE_ACTION_INVALID` on anything else.
export class CreateAutomationRuleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: TRIGGER_TYPES })
  @IsIn(TRIGGER_TYPES)
  triggerType!: AutomationRuleTriggerType;

  @ApiPropertyOptional({ description: 'Flat key-value match against the trigger context, e.g. { "minSeverity": "HIGH" }.' })
  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @ApiProperty({ description: 'Discriminated by `kind`: NOTIFY | CREATE_INCIDENT | CREATE_REMEDIATION_TASK.' })
  @IsObject()
  actionConfig!: AutomationRuleActionConfig;
}

export class UpdateAutomationRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  actionConfig?: AutomationRuleActionConfig;
}

export class SetAutomationRuleStatusDto {
  @ApiProperty({ enum: ['ENABLED', 'DISABLED'] })
  @IsIn(['ENABLED', 'DISABLED'])
  status!: AutomationRuleStatus;
}

export class ListAutomationRulesQueryDto {
  @ApiPropertyOptional({ enum: TRIGGER_TYPES })
  @IsOptional()
  @IsIn(TRIGGER_TYPES)
  triggerType?: AutomationRuleTriggerType;

  @ApiPropertyOptional({ enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: AutomationRuleStatus;
}

export class DecideAutomationApprovalDto {
  @ApiProperty()
  @IsBoolean()
  @Type(() => Boolean)
  approve!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionNote?: string;
}
