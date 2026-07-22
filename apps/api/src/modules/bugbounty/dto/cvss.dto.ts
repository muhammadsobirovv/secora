import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type {
  CalculateCvssRequestDto as CalculateShape,
  CvssAttackComplexity,
  CvssAttackVector,
  CvssImpact,
  CvssPrivilegesRequired,
  CvssScope,
  CvssUserInteraction,
  CvssVectorComponents,
} from '@pentesthub/shared';

const ATTACK_VECTORS: CvssAttackVector[] = ['N', 'A', 'L', 'P'];
const ATTACK_COMPLEXITIES: CvssAttackComplexity[] = ['L', 'H'];
const PRIVILEGES_REQUIRED: CvssPrivilegesRequired[] = ['N', 'L', 'H'];
const USER_INTERACTIONS: CvssUserInteraction[] = ['N', 'R'];
const SCOPES: CvssScope[] = ['U', 'C'];
const IMPACTS: CvssImpact[] = ['N', 'L', 'H'];

/// The 8 CVSS 3.1 base-metric components — validated against FIRST.org's
/// fixed value sets (see cvss/cvss-calculator.util.ts for the scoring
/// formula this DTO ultimately feeds).
export class CvssVectorComponentsDto implements CvssVectorComponents {
  @ApiProperty({ enum: ATTACK_VECTORS }) @IsIn(ATTACK_VECTORS) AV!: CvssAttackVector;
  @ApiProperty({ enum: ATTACK_COMPLEXITIES }) @IsIn(ATTACK_COMPLEXITIES) AC!: CvssAttackComplexity;
  @ApiProperty({ enum: PRIVILEGES_REQUIRED }) @IsIn(PRIVILEGES_REQUIRED) PR!: CvssPrivilegesRequired;
  @ApiProperty({ enum: USER_INTERACTIONS }) @IsIn(USER_INTERACTIONS) UI!: CvssUserInteraction;
  @ApiProperty({ enum: SCOPES }) @IsIn(SCOPES) S!: CvssScope;
  @ApiProperty({ enum: IMPACTS }) @IsIn(IMPACTS) C!: CvssImpact;
  @ApiProperty({ enum: IMPACTS }) @IsIn(IMPACTS) I!: CvssImpact;
  @ApiProperty({ enum: IMPACTS }) @IsIn(IMPACTS) A!: CvssImpact;
}

export class CalculateCvssDto implements CalculateShape {
  @ApiProperty({ type: CvssVectorComponentsDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CvssVectorComponentsDto)
  components!: CvssVectorComponentsDto;
}
