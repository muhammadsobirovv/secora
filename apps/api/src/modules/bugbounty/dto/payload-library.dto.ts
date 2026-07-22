import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type {
  CreatePayloadLibraryEntryRequestDto as CreateShape,
  ExplainPayloadRequestDto as ExplainShape,
  ListPayloadLibraryQueryDto as ListShape,
  PayloadCategory,
  UpdatePayloadLibraryEntryRequestDto as UpdateShape,
} from '@pentesthub/shared';
import { PAYLOAD_CATEGORIES } from '@pentesthub/shared';

export class CreatePayloadLibraryEntryDto implements CreateShape {
  @ApiProperty({ enum: PAYLOAD_CATEGORIES })
  @IsIn(PAYLOAD_CATEGORIES)
  category!: PayloadCategory;

  @ApiProperty({ maxLength: 200 }) @IsString() @MaxLength(200) title!: string;

  @ApiProperty() @IsString() description!: string;

  @ApiProperty() @IsString() example!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  references?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdatePayloadLibraryEntryDto implements UpdateShape {
  @ApiPropertyOptional({ enum: PAYLOAD_CATEGORIES })
  @IsOptional()
  @IsIn(PAYLOAD_CATEGORIES)
  category?: PayloadCategory;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() example?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  references?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ListPayloadLibraryQueryParamsDto implements ListShape {
  @ApiPropertyOptional({ enum: PAYLOAD_CATEGORIES })
  @IsOptional()
  @IsIn(PAYLOAD_CATEGORIES)
  category?: PayloadCategory;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
}

export class ExplainPayloadDto implements ExplainShape {
  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
}
