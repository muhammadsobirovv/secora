import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { CreateSupportTicketRequestDto, SupportTicketCategory } from '@pentesthub/shared';

const CATEGORIES: SupportTicketCategory[] = ['BUG', 'BILLING', 'ACCOUNT', 'FEATURE_REQUEST', 'OTHER'];

export class CreateSupportTicketDto implements CreateSupportTicketRequestDto {
  @ApiProperty({ enum: CATEGORIES })
  @IsIn(CATEGORIES)
  category!: SupportTicketCategory;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @ApiProperty({ maxLength: 10_000 })
  @IsString()
  @MinLength(10)
  @MaxLength(10_000)
  message!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  // Module 15 — task #353/#355 integration. `useDiagnostics()`'s report
  // shape, attached optionally so a triager doesn't start by asking "what
  // browser/version are you on?" — validated only as a plain object here
  // (not field-by-field) since it's diagnostic context, not something the
  // system acts on.
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  diagnosticsSnapshot?: CreateSupportTicketRequestDto['diagnosticsSnapshot'];
}
