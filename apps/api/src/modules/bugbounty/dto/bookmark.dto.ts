import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type {
  BookmarkEntityType,
  CreateBookmarkRequestDto as CreateShape,
  ListBookmarksQueryDto as ListShape,
} from '@pentesthub/shared';

export const BOOKMARK_ENTITY_TYPES: BookmarkEntityType[] = [
  'TARGET',
  'FINDING',
  'REPORT',
  'PAYLOAD',
  'NOTE',
];

export class CreateBookmarkDto implements CreateShape {
  @ApiProperty({ enum: BOOKMARK_ENTITY_TYPES })
  @IsIn(BOOKMARK_ENTITY_TYPES)
  entityType!: BookmarkEntityType;

  @ApiProperty() @IsUUID() entityId!: string;
}

export class ListBookmarksQueryParamsDto implements ListShape {
  @ApiPropertyOptional({ enum: BOOKMARK_ENTITY_TYPES })
  @IsOptional()
  @IsIn(BOOKMARK_ENTITY_TYPES)
  entityType?: BookmarkEntityType