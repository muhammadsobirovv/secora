import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  CreateReportCustomTemplateRequestDto as CreateShape,
  CustomReportTemplateSection,
  UpdateReportCustomTemplateRequestDto as UpdateShape,
} from '@pentesthub/shared';

export class CustomReportTemplateSectionDto implements CustomReportTemplateSection {
  @ApiProperty({ maxLength: 200 }) @IsString() @MaxLength(200) heading!: string;

  @ApiProperty() @IsString() bodyTemplate!: string;
}

export class CreateReportCustomTemplateDto implements CreateShape {
  @ApiProperty({ maxLength: 200 }) @IsString() @MaxLength(200) name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiProperty({ type: [CustomReportTemplateSectionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomReportTemplateSectionDto)
  sections!: CustomReportTemplateSectionDto[];
}

export class UpdateReportCustomTemplateDto implements UpdateShape {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({ type: [CustomReportTemplateSectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomReportTemplateSectionDto)
  sections?: CustomReportTemplateSectionDto[];
}
