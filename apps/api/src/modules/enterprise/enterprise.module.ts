import { Module } from '@nestjs/common';

import {
  AcceptOrganizationInviteHandler,
  CreateOrganizationHandler,
  CreateOrganizationInviteHandler,
  HandleBillingWebhookHandler,
  RemoveOrganizationMemberHandler,
  RevokeOrganizationInviteHandler,
  UpdateOrganizationHandler,
  UpdateOrganizationMemberRoleHandler,
  UpdateOrganizationSettingsHandler,
  UpdateResourceQuotaHandler,
  UpdateTenantBillingHandler,
  UpdateTenantBrandingHandler,
} from './commands/organizations.commands.js';
import {
  AddTeamMemberHandler,
  CreateDepartmentHandler,
  CreateTeamHandler,
  DeleteDepartmentHandler,
  DeleteTeamHandler,
  RemoveTeamMemberHandler,
  UpdateDepartmentHandler,
  UpdateTeamHandler,
} from './commands/departments-teams.commands.js';
import {
  CreateApprovalRequestHandler,
  CreateApprovalWorkflowHandler,
  CreateCustomRoleHandler,
  CreatePermissionGroupHandler,
  CreateResourcePermissionHandler,
  DecideApprovalRequestHandler,
  DeleteResourcePermissionHandler,
  GrantTemporaryPermissionHandler,
  RevokeTemporaryPermissionHandler,
} from './commands/rbac-abac.commands.js';
import {
  GetOrganizationHandler,
  GetOrganizationSettingsHandler,
  GetResourceQuotaHandler,
  GetTenantUsageHandler,
  ListDepartmentsHandler,
  ListMyOrganizationsHandler,
  ListOrganizationMembersHandler,
  ListTeamsHandler,
} from './queries/organizations.query.js';
import {
  ListApprovalRequestsHandler,
  ListApprovalWorkflowsHandler,
  ListCustomRolesHandler,
  ListPermissionGroupsHandler,
  ListResourcePermissionsHandler,
  ListTemporaryPermissionsHandler,
} from './queries/rbac-abac.query.js';
import { OrganizationsController } from './controllers/organizations.controller.js';
import { RbacController } from './controllers/rbac.controller.js';
import { BillingWebhookController } from './controllers/billing-webhook.controller.js';

const COMMAND_HANDLERS = [
  CreateOrganizationHandler,
  UpdateOrganizationHandler,
  UpdateOrganizationSettingsHandler,
  UpdateResourceQuotaHandler,
  UpdateTenantBillingHandler,
  UpdateTenantBrandingHandler,
  HandleBillingWebhookHandler,
  CreateOrganizationInviteHandler,
  RevokeOrganizationInviteHandler,
  AcceptOrganizationInviteHandler,
  UpdateOrganizationMemberRoleHandler,
  RemoveOrganizationMemberHandler,
  CreateDepartmentHandler,
  UpdateDepartmentHandler,
  DeleteDepartmentHandler,
  CreateTeamHandler,
  UpdateTeamHandler,
  DeleteTeamHandler,
  AddTeamMemberHandler,
  RemoveTeamMemberHandler,
  CreateCustomRoleHandler,
  CreatePermissionGroupHandler,
  CreateResourcePermissionHandler,
  DeleteResourcePermissionHandler,
  GrantTemporaryPermissionHandler,
  RevokeTemporaryPermissionHandler,
  CreateApprovalWorkflowHandler,
  CreateApprovalRequestHandler,
  DecideApprovalRequestHandler,
];

const QUERY_HANDLERS = [
  GetOrganizationHandler,
  ListMyOrganizationsHandler,
  GetOrganizationSettingsHandler,
  GetResourceQuotaHandler,
  GetTenantUsageHandler,
  ListOrganizationMembersHandler,
  ListDepartmentsHandler,
  ListTeamsHandler,
  ListCustomRolesHandler,
  ListPermissionGroupsHandler,
  ListResourcePermissionsHandler,
  ListTemporaryPermissionsHandler,
  ListApprovalWorkflowsHandler,
  ListApprovalRequestsHandler,
];

/// Module 10 — Multi-Tenant Architecture + RBAC & ABAC. Organizations
/// (tenants) sit above Module 1's Workspace (see `Workspace.organizationId`
/// in schema.prisma); Departments and Teams provide the hierarchy the spec
/// asks for; the ten-level `EnterpriseRole` ladder plus ABAC
/// `ResourcePermission` rules extend authorization beyond the
/// `WorkspaceMemberRole`/bug-bounty-Collaboration roles Modules 1 and 9
/// already built, without changing either. Like Module 9's Collaboration
/// surface, every handler here injects `PrismaService` directly rather
/// than a repository-interface layer — same disclosed trade-off (simple,
/// non-cross-module-reused entities), see docs/adr/0010-enterprise-platform.md.
///
/// Module 14 — Tenant Management adds billing/branding/usage-stats on top
/// (`UpdateTenantBillingCommand`, `UpdateTenantBrandingCommand`,
/// `GetTenantUsageQuery`, `BillingWebhookController`), all gated behind
/// `@RequiresEdition('enterprise')`. This entire Organizations surface —
/// Module 10's original CRUD and Module 14's additions alike — has no
/// consuming frontend yet (`apps/web` has UI for Module 1's Workspace,
/// a separate, simpler entity, but none for Organization/tenant
/// management); that gap predates this pass and isn't closed by it —
/// disclosed here rather than left implicit.
@Module({
  controllers: [OrganizationsController, RbacController, BillingWebhookController],
  providers: [...COMMAND_HANDLERS, ...QUERY_HANDLERS],
})
export class EnterpriseModule {}
