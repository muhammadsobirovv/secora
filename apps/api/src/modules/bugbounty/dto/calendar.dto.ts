import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type {
  CalendarEventType,
  CreateCalendarEventRequestDto as CreateShape,
  ListCalendarEventsQueryDto as ListShape,
  UpdateCalendarEventRequestDto as UpdateShape,
} from '@pentesthub/shared';

export const CALENDAR_EVENT_TYPES: CalendarEventType[] = [
  'SUBMISSION_DEADLINE',
  'FOLLOW_UP',
  'RETEST',
  'DISCLOSURE',
];

export class CreateCalendarEventDto implements CreateShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() programId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() reportId?: string;

  @ApiProperty({ enum: CALENDAR_EVENT_TYPES })
  @IsIn(CALENDAR_EVENT_TYPES)
  type!: CalendarEventType;

  @ApiProperty({ maxLength: 300 }) @IsString() @MaxLength(300) title!: string;

  @ApiProperty() @IsDateString() dueAt!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateCalendarEventDto implements UpdateShape {
  @ApiPropertyOptional({ enum: CALENDAR_EVENT_TYPES })
  @IsOptional()
  @IsIn(CALENDAR_EVENT_TYPES)
  type?: CalendarEventType;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString() dueAt?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  completedAt?: string | null;
}

export class ListCalendarEventsQueryParamsDto implements ListShape {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;

  @ApiPropertyOptional({ enum: CALENDAR_EVENT_TYPES })
  @IsOptional()
  @IsIn(CALENDAR_EVENT_TYPES)
  type?: CalendarEventType;

  @ApiPropertyOptional() @IsOptional() @IsUUID() programId?: string;
}
