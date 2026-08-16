import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type {
  AcceptWorkspaceInviteRequestDto as AcceptInviteShape,
  AssignableEntityType,
  AssignmentStatus,
  CollaborationEntityType,
  CommentEntityType,
  CreateAssignmentRequestDto as CreateAssignmentShape,
  CreateCommentRequestDto as CreateCommentShape,
  CreateTaskItemRequestDto as CreateTaskShape,
  CreateWorkspaceInviteRequestDto as CreateInviteShape,
  ListAssignmentsQueryDto as ListAssignmentsShape,
  ListCommentsQueryDto as ListCommentsShape,
  ListTaskItemsQueryDto as ListTasksShape,
  ListWorkspaceInvitesQueryDto as ListInvitesShape,
  ToggleReactionRequestDto as ToggleReactionShape,
  ToggleWatcherRequestDto as ToggleWatcherShape,
  UpdateAssignmentRequestDto as UpdateAssignmentShape,
  UpdateCommentRequestDto as UpdateCommentShape,
  UpdateTaskItemRequestDto as UpdateTaskShape,
  UpdateWorkspaceMemberRoleRequestDto as UpdateRoleShape,
  WorkspaceInviteStatus,
  WorkspaceMemberRole,
} from '@pentesthub/shared';

const WORKSPACE_MEMBER_ROLES: WorkspaceMemberRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'TRIAGER', 'REVIEWER', 'MEMBER'];
const WORKSPACE_INVITE_STATUSES: WorkspaceInviteStatus[] = ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'];
const COMMENT_ENTITY_TYPES: CommentEntityType[] = ['PROGRAM', 'FINDING', 'REPORT', 'TARGET', 'NOTE', 'TASK'];
const ASSIGNABLE_ENTITY_TYPES: AssignableEntityType[] = ['PROGRAM', 'FINDING', 'REPORT', 'TARGET', 'TASK'];
const ASSIGNMENT_STATUSES: AssignmentStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE'];
const COLLABORATION_ENTITY_TYPES: CollaborationEntityType[] = [
  'BUGBOUNTY_FINDING',
  'BUG_REPORT',
  'COMMENT',
  'RESEARCH_SESSION',
];

// --- Invites / members ---

export class CreateWorkspaceInviteDto implements CreateInviteShape {
  @ApiProperty() @IsString() email!: string;
  @ApiProperty({ enum: WORKSPACE_MEMBER_ROLES }) @IsIn(WORKSPACE_MEMBER_ROLES) role!: WorkspaceMemberRole;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(30) expiresInDays?: number;
}

export class AcceptWorkspaceInviteDto implements AcceptInviteShape {
  @ApiProperty() @IsString() token!: string;
}

export class ListWorkspaceInvitesQueryParamsDto implements ListInvitesShape {
  @ApiPropertyOptional({ enum: WORKSPACE_INVITE_STATUSES })
  @IsOptional()
  @IsIn(WORKSPACE_INVITE_STATUSES)
  status?: WorkspaceInviteStatus;
}

export class UpdateWorkspaceMemberRoleDto implements UpdateRoleShape {
  @ApiProperty({ enum: WORKSPACE_MEMBER_ROLES }) @IsIn(WORKSPACE_MEMBER_ROLES) role!: WorkspaceMemberRole;
}

// --- Comments ---

export class CreateCommentDto implements CreateCommentShape {
  @ApiProperty({ enum: COMMENT_ENTITY_TYPES }) @IsIn(COMMENT_ENTITY_TYPES) entityType!: CommentEntityType;
  @ApiProperty() @IsUUID() entityId!: string;
  @ApiProperty() @IsString() @MaxLength(20000) bodyMarkdown!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentCommentId?: string;
}

export class UpdateCommentDto implements UpdateCommentShape {
  @ApiProperty() @IsString() @MaxLength(20000) bodyMarkdown!: string;
}

export class ListCommentsQueryParamsDto implements ListCommentsShape {
  @ApiProperty({ enum: COMMENT_ENTITY_TYPES }) @IsIn(COMMENT_ENTITY_TYPES) entityType!: CommentEntityType;
  @ApiProperty() @IsUUID() entityId!: string;
}

export class ListMentionsQueryParamsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() unreadOnly?: boolean;
}

// --- Assignments ---

export class CreateAssignmentDto implements CreateAssignmentShape {
  @ApiProperty({ enum: ASSIGNABLE_ENTITY_TYPES }) @IsIn(ASSIGNABLE_ENTITY_TYPES) entityType!: AssignableEntityType;
  @ApiProperty() @IsUUID() entityId!: string;
  @ApiProperty() @IsUUID() assigneeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() dueAt?: string;
}

export class UpdateAssignmentDto implements UpdateAssignmentShape {
  @ApiPropertyOptional({ enum: ASSIGNMENT_STATUSES }) @IsOptional() @IsIn(ASSIGNMENT_STATUSES) status?: AssignmentStatus;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() dueAt?: string | null;
}

export class ListAssignmentsQueryParamsDto implements ListAssignmentsShape {
  @ApiPropertyOptional({ enum: ASSIGNABLE_ENTITY_TYPES }) @IsOptional() @IsIn(ASSIGNABLE_ENTITY_TYPES) entityType?: AssignableEntityType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assigneeId?: string;
  @ApiPropertyOptional({ enum: ASSIGNMENT_STATUSES }) @IsOptional() @IsIn(ASSIGNMENT_STATUSES) status?: AssignmentStatus;
}

// --- Task items ---

export class CreateTaskItemDto implements CreateTaskShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() entityId?: string;
  @ApiProperty() @IsString() @MaxLength(300) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assigneeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() dueAt?: string;
}

export class UpdateTaskItemDto implements UpdateTaskShape {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assigneeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() dueAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() done?: boolean;
}

export class ListTaskItemsQueryParamsDto implements ListTasksShape {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assigneeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() done?: boolean;
}

// --- Activity feed ---

export class ListActivityFeedQueryParamsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number;
}

// --- Watchers / Reactions (Module 16, task #390) ---

export class ToggleWatcherDto implements ToggleWatcherShape {
  @ApiProperty({ enum: COLLABORATION_ENTITY_TYPES }) @IsIn(COLLABORATION_ENTITY_TYPES) entityType!: CollaborationEntityType;
  @ApiProperty() @IsUUID() entityId!: string;
}

export class ListWatchersQueryParamsDto {
  @ApiProperty({ enum: COLLABORATION_ENTITY_TYPES }) @IsIn(COLLABORATION_ENTITY_TYPES) entityType!: CollaborationEntityType;
  @ApiProperty() @IsUUID() entityId!: string;
}

export class ToggleReactionDto implements ToggleReactionShape {
  @ApiProperty({ enum: COLLABORATION_ENTITY_TYPES }) @IsIn(COLLABORATION_ENTITY_TYPES) entityType!: CollaborationEntityType;
  @ApiProperty() @IsUUID() entityId!: string;
  @ApiProperty() @IsString() @MaxLength(8) emoji!: string;
}

export class ListReactionsQueryParamsDto {
  @ApiProperty({ enum: COLLABORATION_ENTITY_TYPES }) @IsIn(COLLABORATION_ENTITY_TYPES) entityType!: CollaborationEntityType;
  @ApiProperty() @IsUUID() entityId!: string;
}
