import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type { CreateVulnScanJobRequestDto as CreateVulnScanJobShape } from '@pentesthub/shared';
import type { VulnScanner } from '../../../prisma-types.js';

const VULN_SCANNERS: VulnScanner[] = [
  'NUCLEI',
  'FFUF',
  'DIRSEARCH',
  'FEROXBUSTER',
  'NIKTO',
];

export class CreateVulnScanJobDto implements CreateVulnScanJobShape {
  @ApiProperty({ enum: VULN_SCANNERS, isArray: true })
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(VULN_SCANNERS, { each: true })
  scanners!: VulnScanner[];

  @ApiPropertyOptional({ enum: ['QUICK', 'STANDARD', 'DEEP'] })
  @IsOptional()
  @IsIn(['QUICK', 'STANDARD', 'DEEP'])
  profile?: 'QUICK' | 'STANDARD' | 'DEEP';

  @ApiPropertyOptional({
    description:
      'Must be true for the DEEP profile, which includes default-credential checks.',
  })
  @IsOptional()
  @IsBoolean()
  confirmDeep?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;
}
