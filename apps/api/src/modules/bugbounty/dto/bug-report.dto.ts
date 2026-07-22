import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  BugReportExportFormat,
  BugReportStatus,
  BugReportTemplate,
  CreateBugReportRequestDto as CreateShape,
  ExportBugReportRequestDto as ExportShape,
  ExportBugReportV2RequestDto as ExportV2Shape,
  GenerateBugReportDraftRequestDto as DraftShape,
  ListBugReportsQueryDto as ListShape,
  ReportExportFormatV2,
  ReportTemplateKind,
  SubmitBugReportRequestDto as SubmitShape,
  UpdateBugReportRequestDto as UpdateShape,
} from '@pentesthub/shared';
import { REPORT_TEMPLATE_KINDS } from '@pentesthub/shared';

export const REPORT_EXPORT_FORMATS_V2: ReportExportFormatV2[] = [
  'MARKDOWN',
  'PDF',
  'DOCX',
  'HTML',
  'JSON',
  'TXT',
];

export const BUG_REPORT_TEMPLATES: BugReportTemplate[] = [
  'HACKERONE',
  'BUGCROWD',
  'INTIGRITI',
  'MARKDOWN',
  'PDF',
  'HTML',
];

export const BUG_REPORT_STATUSES: BugReportStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'TRIAGED',
  'ACCEPTED',
  'REJECTED',
  'DUPLICATE',
  'RESOLVED',
  'CLOSED',
];

export const BUG_REPORT_EXPORT_FORMATS: BugReportExportFormat[] = [
  'PDF',
  'MARKDOWN',
  'HTML',
  'JSON',
  'CSV',
];

export class CreateBugReportDto implements CreateShape {
  @ApiProperty() @IsUUID() programId!: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() findingId?: string;

  @ApiProperty({ maxLength: 300 }) @IsString() @MaxLength(300) title!: string;

  @ApiPropertyOptional({ enum: BUG_REPORT_TEMPLATES })
  @IsOptional()
  @IsIn(BUG_REPORT_TEMPLATES)
  template?: BugReportTemplate;

  @ApiPropertyOptional({ enum: REPORT_TEMPLATE_KINDS })
  @IsOptional()
  @IsIn(REPORT_TEMPLATE_KINDS)
  templateKind?: ReportTemplateKind;

  @ApiPropertyOptional() @IsOptional() @IsUUID() customTemplateId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() summary?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() impact?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() stepsToReproduce?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() proofOfConcept?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() cwe?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() cvssScore?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() cvssVector?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  references?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() mitigation?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  evidenceIds?: string[];
}

export class UpdateBugReportDto implements UpdateShape {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ enum: BUG_REPORT_TEMPLATES })
  @IsOptional()
  @IsIn(BUG_REPORT_TEMPLATES)
  template?: BugReportTemplate;

  @ApiPropertyOptional({ enum: REPORT_TEMPLATE_KINDS })
  @IsOptional()
  @IsIn(REPORT_TEMPLATE_KINDS)
  templateKind?: ReportTemplateKind;

  @ApiPropertyOptional() @IsOptional() @IsUUID() customTemplateId?: string;

  @ApiPropertyOptional({ enum: BUG_REPORT_STATUSES })
  @IsOptional()
  @IsIn(BUG_REPORT_STATUSES)
  status?: BugReportStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() summary?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() impact?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() stepsToReproduce?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() proofOfConcept?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() cwe?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() cvssScore?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() cvssVector?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  references?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() mitigation?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() bountyAmount?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  platformReportUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() platformReportId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  evidenceIds?: string[];
}

export class SubmitBugReportDto implements SubmitShape {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  platformReportUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() platformReportId?: string;
}

export class ListBugReportsQueryParamsDto implements ListShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() programId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() findingId?: string;

  @ApiPropertyOptional({ enum: BUG_REPORT_STATUSES })
  @IsOptional()
  @IsIn(BUG_REPORT_STATUSES)
  status?: BugReportStatus;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class GenerateBugReportDraftDto implements DraftShape {
  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
}

export class ExportBugReportDto implements ExportShape {
  @ApiProperty({ enum: BUG_REPORT_EXPORT_FORMATS })
  @IsIn(BUG_REPORT_EXPORT_FORMATS)
  format!: BugReportExportFormat;
}

export class ExportBugReportV2Dto implements ExportV2Shape {
  @ApiProperty({ enum: REPORT_EXPORT_FORMATS_V2 })
  @IsIn(REPORT_EXPORT_FORMATS_V2)
  format!: ReportExportFormatV2;
}
