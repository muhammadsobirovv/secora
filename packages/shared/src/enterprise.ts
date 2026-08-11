// Module 10 — Enterprise Platform + SaaS + Global Infrastructure.
// Multi-tenant architecture (Organization -> Department/Team -> Workspace)
// and the RBAC/ABAC layer that sits above Module 1's WorkspaceMemberRole and
// Module 9's bug-bounty Collaboration roles. See
// docs/adr/0010-enterprise-platform.md.

// ---------------------------------------------------------------------------
// Organizations (tenants)
// ---------------------------------------------------------------------------

export type OrganizationStatus = "ACTIVE" | "TRIAL" | "SUSPENDED" | "ARCHIVED";

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  logoUrl: string | null;
  plan: string;
  status: OrganizationStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /// Module 14 — Tenant Management (Enterprise Edition only). Always
  /// present in the DTO shape (never `undefined`) but only ever
  /// non-default when `EditionService.isEnterprise()` — see
  /// `docs/adr/0014-cloud-platform-enterprise-saas-ha.md`.
  billingEmail: string | null;
  billingProviderCustomerId: string | null;
  subscriptionStatus: string | null;
  subscriptionRenewsAt: string | null;
  customDomain: string | null;
  customDomainVerifiedAt: string | null;
  brandingPrimaryColor: string | null;
  brandingFaviconUrl: string | null;
}

export interface CreateOrganizationRequestDto {
  name: string;
  slug: string;
  domain?: string;
  logoUrl?: string;
}

export interface UpdateOrganizationRequestDto {
  name?: string;
  domain?: string;
  logoUrl?: string;
  plan?: string;
  status?: OrganizationStatus;
}

/// Module 14 — Tenant Management. Split from `UpdateOrganizationRequestDto`
/// (rather than folding these fields into it) because every field here
/// is gated by `@RequiresEdition('enterprise')` at the controller layer
/// — a Community Edition `PATCH /enterprise/organizations/:id` request
/// never even has these in its allowed shape.
export interface UpdateTenantBillingRequestDto {
  billingEmail?: string;
}

export interface UpdateTenantBrandingRequestDto {
  customDomain?: string;
  brandingPrimaryColor?: string;
  brandingFaviconUrl?: string;
}

/// A payment provider's webhook delivery, normalized to the minimum this
/// platform actually acts on. `BillingWebhookController` accepts this
/// shape from any provider-specific adapter (Stripe/Paddle/etc. — none
/// shipped in this pass, see ADR 0014) rather than each provider having
/// its own controller.
export type BillingWebhookEventType =
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_UPDATED"
  | "SUBSCRIPTION_CANCELLED"
  | "PAYMENT_FAILED";

export interface BillingWebhookEventDto {
  type: BillingWebhookEventType;
  billingProviderCustomerId: string;
  subscriptionStatus?: string;
  subscriptionRenewsAt?: string;
}

/// Module 14 — Tenant Management. Usage against `ResourceQuotaDto`'s
/// limits, one field per quota field. `workspaces`/`members`/`teams` are
/// live counts (organization-scoped rows, cheap to `count()`). The
/// remaining four are `null` — not "zero usage" but "not tracked yet":
/// storage-per-organization, monthly scan/AI-token consumption, and
/// per-member/per-workspace resource counts would each need their own
/// aggregation pass (summing attachment sizes, metering AI calls, etc.)
/// that no existing service in this codebase currently performs. Kept
/// `null` here rather than a fabricated `0` so a caller can tell "no
/// usage" apart from "not measured" — see `ClusterOverviewDto`'s same
/// null-means-not-computed convention for storage totals.
export interface TenantUsageDto {
  organizationId: string;
  workspaces: number;
  members: number;
  teams: number;
  storageMb: number | null;
  scansThisMonth: number | null;
  aiTokensThisMonth: number | null;
  apiKeysPerMember: number | null;
  webhooksPerWorkspace: number | null;
  quota: ResourceQuotaDto | null;
}

// ---------------------------------------------------------------------------
// Enterprise roles + organization membership
// ---------------------------------------------------------------------------

export type EnterpriseRole =
  | "SUPER_ADMIN"
  | "ORG_OWNER"
  | "ADMIN"
  | "SECURITY_MANAGER"
  | "TEAM_LEAD"
  | "PENTESTER"
  | "BUG_HUNTER"
  | "DEVELOPER"
  | "VIEWER"
  | "GUEST";

export type OrganizationMemberStatus = "ACTIVE" | "SUSPENDED";

export interface OrganizationMemberDto {
  id: string;
  organizationId: string;
  userId: string;
  role: EnterpriseRole;
  departmentId: string | null;
  status: OrganizationMemberStatus;
  joinedAt: string;
}

export interface UpdateOrganizationMemberRoleRequestDto {
  role: EnterpriseRole;
}

// ---------------------------------------------------------------------------
// Departments + Teams (hierarchy)
// ---------------------------------------------------------------------------

export interface DepartmentDto {
  id: string;
  organizationId: string;
  name: string;
  parentDepartmentId: string | null;
  managerUserId: string | null;
  createdAt: string;
}

export interface CreateDepartmentRequestDto {
  name: string;
  parentDepartmentId?: string;
  managerUserId?: string;
}

export interface UpdateDepartmentRequestDto {
  name?: string;
  parentDepartmentId?: string | null;
  managerUserId?: string | null;
}

export interface TeamDto {
  id: string;
  organizationId: string;
  departmentId: string | null;
  parentTeamId: string | null;
  name: string;
  leadUserId: string | null;
  memberCount: number;
  createdAt: string;
}

export interface CreateTeamRequestDto {
  name: string;
  departmentId?: string;
  parentTeamId?: string;
  leadUserId?: string;
}

export interface UpdateTeamRequestDto {
  name?: string;
  departmentId?: string | null;
  parentTeamId?: string | null;
  leadUserId?: string | null;
}

export interface AddTeamMemberRequestDto {
  organizationMemberId: string;
}

// ---------------------------------------------------------------------------
// Organization invites
// ---------------------------------------------------------------------------

export type OrganizationInviteStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export interface OrganizationInviteDto {
  id: string;
  organizationId: string;
  email: string;
  role: EnterpriseRole;
  departmentId: string | null;
  teamId: string | null;
  status: OrganizationInviteStatus;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface CreateOrganizationInviteRequestDto {
  email: string;
  role: EnterpriseRole;
  departmentId?: string;
  teamId?: string;
  expiresInDays?: number;
}

export interface AcceptOrganizationInviteRequestDto {
  token: string;
}

// ---------------------------------------------------------------------------
// Resource quotas + organization settings
// ---------------------------------------------------------------------------

export interface ResourceQuotaDto {
  organizationId: string;
  maxWorkspaces: number | null;
  maxMembers: number | null;
  maxTeams: number | null;
  maxStorageMb: number | null;
  maxScansPerMonth: number | null;
  maxAiTokensPerMonth: number | null;
  maxApiKeysPerMember: number | null;
  maxWebhooksPerWorkspace: number | null;
}

export interface UpdateResourceQuotaRequestDto {
  maxWorkspaces?: number | null;
  maxMembers?: number | null;
  maxTeams?: number | null;
  maxStorageMb?: number | null;
  maxScansPerMonth?: number | null;
  maxAiTokensPerMonth?: number | null;
  maxApiKeysPerMember?: number | null;
  maxWebhooksPerWorkspace?: number | null;
}

export interface OrganizationSettingsDto {
  organizationId: string;
  enforceMfa: boolean;
  allowedEmailDomains: string[];
  defaultMemberRole: EnterpriseRole;
  sessionTimeoutMinutes: number | null;
  dataResidency: string | null;
}

export interface UpdateOrganizationSettingsRequestDto {
  enforceMfa?: boolean;
  allowedEmailDomains?: string[];
  defaultMemberRole?: EnterpriseRole;
  sessionTimeoutMinutes?: number | null;
  dataResidency?: string;
}

// ---------------------------------------------------------------------------
// RBAC: custom roles + permission groups
// ---------------------------------------------------------------------------

export interface CustomRoleDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  basedOnRole: EnterpriseRole;
  permissionKeys: string[];
  createdAt: string;
}

export interface CreateCustomRoleRequestDto {
  name: string;
  description?: string;
  basedOnRole: EnterpriseRole;
  permissionKeys: string[];
}

export interface PermissionGroupDto {
  id: string;
  organizationId: string;
  name: string;
  permissionKeys: string[];
  createdAt: string;
}

export interface CreatePermissionGroupRequestDto {
  name: string;
  permissionKeys: string[];
}

// ---------------------------------------------------------------------------
// ABAC: resource-level permissions
// ---------------------------------------------------------------------------

export type PermissionEffect = "ALLOW" | "DENY";
export type PermissionSubjectType = "USER" | "TEAM" | "ROLE";

export interface ResourcePermissionDto {
  id: string;
  organizationId: string;
  subjectType: PermissionSubjectType;
  subjectId: string;
  resourceType: string;
  resourceId: string | null;
  action: string;
  effect: PermissionEffect;
  conditions: Record<string, unknown> | null;
  createdAt: string;
}

export interface CreateResourcePermissionRequestDto {
  subjectType: PermissionSubjectType;
  subjectId: string;
  resourceType: string;
  resourceId?: string;
  action: string;
  effect: PermissionEffect;
  conditions?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Temporary permissions
// ---------------------------------------------------------------------------

export interface TemporaryPermissionDto {
  id: string;
  organizationId: string;
  userId: string;
  permissionKey: string;
  resourceType: string | null;
  resourceId: string | null;
  grantedBy: string;
  reason: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface GrantTemporaryPermissionRequestDto {
  userId: string;
  permissionKey: string;
  resourceType?: string;
  resourceId?: string;
  reason?: string;
  expiresInHours: number;
}

// ---------------------------------------------------------------------------
// Approval workflows
// ---------------------------------------------------------------------------

export interface ApprovalWorkflowDto {
  id: string;
  organizationId: string;
  name: string;
  resourceType: string;
  requiredApprovals: number;
  approverRole: EnterpriseRole;
  enabled: boolean;
  createdAt: string;
}

export interface CreateApprovalWorkflowRequestDto {
  name: string;
  resourceType: string;
  requiredApprovals?: number;
  approverRole: EnterpriseRole;
}

export type ApprovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface ApprovalRequestDto {
  id: string;
  workflowId: string;
  organizationId: string;
  requestedBy: string;
  resourceType: string;
  resourceId: string;
  reason: string | null;
  status: ApprovalRequestStatus;
  decidedBy: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface CreateApprovalRequestRequestDto {
  workflowId: string;
  resourceType: string;
  resourceId: string;
  reason?: string;
}

export interface DecideApprovalRequestRequestDto {
  approve: boolean;
  decisionNote?: string;
}

// ---------------------------------------------------------------------------
// List query params
// ---------------------------------------------------------------------------

export interface ListOrganizationMembersQueryDto {
  role?: EnterpriseRole;
  departmentId?: string;
  status?: OrganizationMemberStatus;
}

export interface ListApprovalRequestsQueryDto {
  status?: ApprovalRequestStatus;
  workflowId?: string;
}
