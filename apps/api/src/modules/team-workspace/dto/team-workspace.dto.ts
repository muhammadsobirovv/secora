import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type {
  CreateInternalChatChannelRequestDto as CreateChannelShape,
  CreateWikiPageRequestDto as CreateWikiShape,
  DecideReviewQueueItemRequestDto as DecideReviewShape,
  ReviewQueueItemStatus,
  SendInternalChatMessageRequestDto as SendMessageShape,
  SubmitReviewQueueItemRequestDto as SubmitReviewShape,
  UpdateWikiPageRequestDto as UpdateWikiShape,
} from '@pentesthub/shared';

export class CreateWikiPageDto implements CreateWikiShape {
  @ApiProperty() @IsUUID() workspaceId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentPageId?: string;
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiProperty() @IsString() contentMarkdown!: string;
}

export class UpdateWikiPageDto implements UpdateWikiShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentPageId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contentMarkdown?: string;
}

export class SubmitReviewQueueItemDto implements SubmitReviewShape {
  @ApiProperty() @IsUUID() workspaceId!: string;
  @ApiProperty() @IsString() @MaxLength(60) resourceType!: string;
  @ApiProperty() @IsString() resourceId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

const REVIEW_DECISIONS: ReviewQueueItemStatus[] = ['APPROVED', 'REJECTED'];

export class DecideReviewQueueItemDto implements DecideReviewShape {
  @ApiProperty({ enum: REVIEW_DECISIONS }) @IsIn(REVIEW_DECISIONS) status!: 'APPROVED' | 'REJECTED';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class CreateInternalChatChannelDto implements CreateChannelShape {
  @ApiProperty() @IsUUID() workspaceId!: string;
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPrivate?: boolean;
}

export class SendInternalChatMessageDto implements SendMessageShape {
  @ApiProperty() @IsString() @MaxLength(10000) body!: string;
}
