import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  AcceptOrganizationInviteRequestDto as AcceptInviteShape,
  AddTeamMemberRequestDto as AddTeamMemberShape,
  ApprovalRequestStatus,
  CreateApprovalRequestRequestDto as CreateApprovalRequestShape,
  CreateApprovalWorkflowRequestDto as CreateApprovalWorkflowShape,
  CreateCustomRoleRequestDto as CreateCustomRoleShape,
  CreateDepartmentRequestDto as CreateDepartmentShape,
  CreateOrganizationInviteRequestDto as CreateInviteShape,
  CreateOrganizationRequestDto as CreateOrgShape,
  CreatePermissionGroupRequestDto as CreatePermGroupShape,
  CreateResourcePermissionRequestDto as CreateResourcePermShape,
  CreateTeamRequestDto as CreateTeamShape,
  DecideApprovalRequestRequestDto as DecideApprovalShape,
  EnterpriseRole,
  GrantTemporaryPermissionRequestDto as GrantTempPermShape,
  ListApprovalRequestsQueryDto as ListApprovalRequestsShape,
  ListOrganizationMembersQueryDto as ListMembersShape,
  OrganizationMemberStatus,
  PermissionEffect,
  PermissionSubjectType,
  UpdateDepartmentRequestDto as UpdateDepartmentShape,
  UpdateOrganizationMemberRoleRequestDto as UpdateMemberRoleShape,
  UpdateOrganizationRequestDto as UpdateOrgShape,
  UpdateOrganizationSettingsRequestDto as UpdateOrgSettingsShape,
  UpdateResourceQuotaRequestDto as UpdateQuotaShape,
  UpdateTeamRequestDto as UpdateTeamShape,
} from '@pentesthub/shared';

const ENTERPRISE_ROLES: EnterpriseRole[] = [
  'SUPER_ADMIN',
  'ORG_OWNER',
  'ADMIN',
  'SECURITY_MANAGER',
  'TEAM_LEAD',
  'PENTESTER',
  'BUG_HUNTER',
  'DEVELOPER',
  'VIEWER',
  'GUEST',
];
const ORG_MEMBER_STATUSES: OrganizationMemberStatus[] = ['ACTIVE', 'SUSPENDED'];
const ORG_STATUSES = ['ACTIVE', 'TRIAL', 'SUSPENDED', 'ARCHIVED'] as const;
const PERMISSION_SUBJECT_TYPES: PermissionSubjectType[] = ['USER', 'TEAM', 'ROLE'];
const PERMISSION_EFFECTS: PermissionEffect[] = ['ALLOW', 'DENY'];
const APPROVAL_REQUEST_STATUSES: ApprovalRequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

// --- Organizations ---

export class CreateOrganizationDto implements CreateOrgShape {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty() @IsString() @MaxLength(60) slug!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() domain?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
}

export class UpdateOrganizationDto implements UpdateOrgShape {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() domain?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() plan?: string;
  @ApiPropertyOptional({ enum: ORG_STATUSES }) @IsOptional() @IsIn(ORG_STATUSES) status?: (typeof ORG_STATUSES)[number];
}

export class UpdateOrganizationSettingsDto implements UpdateOrgSettingsShape {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enforceMfa?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() allowedEmailDomains?: string[];
  @ApiPropertyOptional({ enum: ENTERPRISE_ROLES }) @IsOptional() @IsIn(ENTERPRISE_ROLES) defaultMemberRole?: EnterpriseRole;
  @ApiPropertyOptional() @IsOptional() @IsInt() sessionTimeoutMinutes?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() dataResidency?: string;
}

export class UpdateResourceQuotaDto implements UpdateQuotaShape {
  @ApiPropertyOptional() @IsOptional() @IsInt() maxWorkspaces?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxMembers?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxTeams?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxStorageMb?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxScansPerMonth?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxAiTokensPerMonth?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxApiKeysPerMember?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxWebhooksPerWorkspace?: number | null;
}

export class ListOrganizationMembersQueryParamsDto implements ListMembersShape {
  @ApiPropertyOptional({ enum: ENTERPRISE_ROLES }) @IsOptional() @IsIn(ENTERPRISE_ROLES) role?: EnterpriseRole;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional({ enum: ORG_MEMBER_STATUSES }) @IsOptional() @IsIn(ORG_MEMBER_STATUSES) status?: OrganizationMemberStatus;
}

export class UpdateOrganizationMemberRoleDto implements UpdateMemberRoleShape {
  @ApiProperty({ enum: ENTERPRISE_ROLES }) @IsIn(ENTERPRISE_ROLES) role!: EnterpriseRole;
}

// --- Invites ---

export class CreateOrganizationInviteDto implements CreateInviteShape {
  @ApiProperty() @IsString() email!: string;
  @ApiProperty({ enum: ENTERPRISE_ROLES }) @IsIn(ENTERPRISE_ROLES) role!: EnterpriseRole;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() teamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(30) expiresInDays?: number;
}

export class AcceptOrganizationInviteDto implements AcceptInviteShape {
  @ApiProperty() @IsString() token!: string;
}

// --- Departments / teams ---

export class CreateDepartmentDto implements CreateDepartmentShape {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentDepartmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() managerUserId?: string;
}

export class UpdateDepartmentDto implements UpdateDepartmentShape {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentDepartmentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() managerUserId?: string | null;
}

export class CreateTeamDto implements CreateTeamShape {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentTeamId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leadUserId?: string;
}

export class UpdateTeamDto implements UpdateTeamShape {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentTeamId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leadUserId?: string | null;
}

export class AddTeamMemberDto implements AddTeamMemberShape {
  @ApiProperty() @IsUUID() organizationMemberId!: string;
}

// --- RBAC ---

export class CreateCustomRoleDto implements CreateCustomRoleShape {
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: ENTERPRISE_ROLES }) @IsIn(ENTERPRISE_ROLES) basedOnRole!: EnterpriseRole;
  @ApiProperty({ type: [String] }) permissionKeys!: string[];
}

export class CreatePermissionGroupDto implements CreatePermGroupShape {
  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiProperty({ type: [String] }) permissionKeys!: string[];
}

// --- ABAC ---

export class CreateResourcePermissionDto implements CreateResourcePermShape {
  @ApiProperty({ enum: PERMISSION_SUBJECT_TYPES }) @IsIn(PERMISSION_SUBJECT_TYPES) subjectType!: PermissionSubjectType;
  @ApiProperty() @IsString() subjectId!: string;
  @ApiProperty() @IsString() resourceType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() resourceId?: string;
  @ApiProperty() @IsString() action!: string;
  @ApiProperty({ enum: PERMISSION_EFFECTS }) @IsIn(PERMISSION_EFFECTS) effect!: PermissionEffect;
  @ApiPropertyOptional() @IsOptional() @IsObject() conditions?: Record<string, unknown>;
}

// --- Temporary permissions ---

export class GrantTemporaryPermissionDto implements GrantTempPermShape {
  @ApiProperty() @IsUUID() userId!: string;
  @ApiProperty() @IsString() permissionKey!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() resourceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() resourceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiProperty() @IsInt() @Min(1) @Max(24 * 30) expiresInHours!: number;
}

// --- Approval workflows / requests ---

export class CreateApprovalWorkflowDto implements CreateApprovalWorkflowShape {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty() @IsString() resourceType!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10) requiredApprovals?: number;
  @ApiProperty({ enum: ENTERPRISE_ROLES }) @IsIn(ENTERPRISE_ROLES) approverRole!: EnterpriseRole;
}

export class CreateApprovalRequestDto implements CreateApprovalRequestShape {
  @ApiProperty() @IsUUID() workflowId!: string;
  @ApiProperty() @IsString() resourceType!: string;
  @ApiProperty() @IsString() resourceId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class DecideApprovalRequestDto implements DecideApprovalShape {
  @ApiProperty() @IsBoolean() approve!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() decisionNote?: string;
}

export class ListApprovalRequestsQueryParamsDto implements ListApprovalRequestsShape {
  @ApiPropertyOptional({ enum: APPROVAL_REQUEST_STATUSES }) @IsOptional() @IsIn(APPROVAL_REQUEST_STATUSES) status?: ApprovalRequestStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workflowId?: string;
}
