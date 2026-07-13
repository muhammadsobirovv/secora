import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { CreateVulnScanTemplateRequestDto as CreateVulnScanTemplateShape } from '@pentesthub/shared';
import type { VulnScanner } from '../../../prisma-types.js';

const VULN_SCANNERS: VulnScanner[] = [
  'NUCLEI',
  'FFUF',
  'DIRSEARCH',
  'FEROXBUSTER',
  'NIKTO',
];

export class CreateVulnScanTemplateDto implements CreateVulnScanTemplateShape {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: VULN_SCANNERS, isArray: true })
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(VULN_SCANNERS, { each: true })
  scanners!: VulnScanner[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
