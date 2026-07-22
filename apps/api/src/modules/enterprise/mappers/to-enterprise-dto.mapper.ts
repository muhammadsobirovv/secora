import type {
  ApprovalRequestDto,
  ApprovalWorkflowDto,
  CustomRoleDto,
  DepartmentDto,
  OrganizationDto,
  OrganizationInviteDto,
  OrganizationMemberDto,
  OrganizationSettingsDto,
  PermissionGroupDto,
  ResourcePermissionDto,
  ResourceQuotaDto,
  TeamDto,
  TemporaryPermissionDto,
} from '@pentesthub/shared';
import type {
  ApprovalRequest,
  ApprovalWorkflow,
  CustomRole,
  Department,
  Organization,
  OrganizationInvite,
  OrganizationMember,
  OrganizationSettings,
  PermissionGroup,
  ResourcePermission,
  ResourceQuota,
  Team,
  TemporaryPermission,
} from '../../../prisma-types.js';

export function toOrganizationDto(row: Organization): OrganizationDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    domain: row.domain,
    logoUrl: row.logoUrl,
    plan: row.plan,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toOrganizationMemberDto(row: OrganizationMember): OrganizationMemberDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    role: row.role,
    departmentId: row.departmentId,
    status: row.status,
    joinedAt: row.joinedAt.toISOString(),
  };
}

export function toDepartmentDto(row: Department): DepartmentDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    parentDepartmentId: row.parentDepartmentId,
    managerUserId: row.managerUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTeamDto(row: Team, memberCount: number): TeamDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    departmentId: row.departmentId,
    parentTeamId: row.parentTeamId,
    name: row.name,
    leadUserId: row.leadUserId,
    memberCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toOrganizationInviteDto(row: OrganizationInvite): OrganizationInviteDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    role: row.role,
    departmentId: row.departmentId,
    teamId: row.teamId,
    status: row.status,
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toResourceQuotaDto(row: ResourceQuota): ResourceQuotaDto {
  return {
    organizationId: row.organizationId,
    maxWorkspaces: row.maxWorkspaces,
    maxMembers: row.maxMembers,
    maxTeams: row.maxTeams,
    maxStorageMb: row.maxStorageMb,
    maxScansPerMonth: row.maxScansPerMonth,
    maxAiTokensPerMonth: row.maxAiTokensPerMonth,
    maxApiKeysPerMember: row.maxApiKeysPerMember,
    maxWebhooksPerWorkspace: row.maxWebhooksPerWorkspace,
  };
}

export function toOrganizationSettingsDto(row: OrganizationSettings): OrganizationSettingsDto {
  return {
    organizationId: row.organizationId,
    enforceMfa: row.enforceMfa,
    allowedEmailDomains: row.allowedEmailDomains,
    defaultMemberRole: row.defaultMemberRole,
    sessionTimeoutMinutes: row.sessionTimeoutMinutes,
    dataResidency: row.dataResidency,
  };
}

export function toCustomRoleDto(row: CustomRole & { permissions: { permissionKey: string }[] }): CustomRoleDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    basedOnRole: row.basedOnRole,
    permissionKeys: row.permissions.map((p) => p.permissionKey),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPermissionGroupDto(row: PermissionGroup): PermissionGroupDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    permissionKeys: row.permissionKeys,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toResourcePermissionDto(row: ResourcePermission): ResourcePermissionDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    action: row.action,
    effect: row.effect,
    conditions: (row.conditions as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTemporaryPermissionDto(row: TemporaryPermission): TemporaryPermissionDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    permissionKey: row.permissionKey,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    grantedBy: row.grantedBy,
    reason: row.reason,
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toApprovalWorkflowDto(row: ApprovalWorkflow): ApprovalWorkflowDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    resourceType: row.resourceType,
    requiredApprovals: row.requiredApprovals,
    approverRole: row.approverRole,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toApprovalRequestDto(row: ApprovalRequest): ApprovalRequestDto {
  return {
    id: row.id,
    workflowId: row.workflowId,
    organizationId: row.organizationId,
    requestedBy: row.requestedBy,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    reason: row.reason,
    status: row.status,
    decidedBy: row.decidedBy,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}
