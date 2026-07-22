import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type {
  ApprovalRequestDto,
  ApprovalWorkflowDto,
  CustomRoleDto,
  PermissionGroupDto,
  ResourcePermissionDto,
  TemporaryPermissionDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CreateApprovalRequestDto,
  CreateApprovalWorkflowDto,
  CreateCustomRoleDto,
  CreatePermissionGroupDto,
  CreateResourcePermissionDto,
  DecideApprovalRequestDto,
  GrantTemporaryPermissionDto,
  ListApprovalRequestsQueryParamsDto,
} from '../dto/enterprise.dto.js';
import {
  CreateApprovalRequestCommand,
  CreateApprovalWorkflowCommand,
  CreateCustomRoleCommand,
  CreatePermissionGroupCommand,
  CreateResourcePermissionCommand,
  DecideApprovalRequestCommand,
  DeleteResourcePermissionCommand,
  GrantTemporaryPermissionCommand,
  RevokeTemporaryPermissionCommand,
} from '../commands/rbac-abac.commands.js';
import {
  ListApprovalRequestsQuery,
  ListApprovalWorkflowsQuery,
  ListCustomRolesQuery,
  ListPermissionGroupsQuery,
  ListResourcePermissionsQuery,
  ListTemporaryPermissionsQuery,
} from '../queries/rbac-abac.query.js';

/// RBAC & ABAC expansion surface: custom roles, permission groups,
/// resource-level (ABAC) permissions, temporary/time-boxed permissions,
/// and approval workflows. All organization-explicit; see
/// `enterprise-permissions.util.ts` for the role ladder and
/// `abac-evaluator.util.ts` for how `ResourcePermission` rows are actually
/// evaluated against a request (used inline by resource-owning modules,
/// not by this controller itself — this controller only manages the rules).
@ApiTags('enterprise-rbac')
@ApiBearerAuth()
@Controller('enterprise/organizations/:organizationId/rbac')
export class RbacController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('custom-roles')
  @ApiOperation({ summary: 'List custom roles' })
  listCustomRoles(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<CustomRoleDto[]> {
    return this.queryBus.execute(new ListCustomRolesQuery(user.id, organizationId));
  }

  @Post('custom-roles')
  @ApiOperation({ summary: 'Create a custom role (ADMIN+)' })
  createCustomRole(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateCustomRoleDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CustomRoleDto> {
    return this.commandBus.execute(new CreateCustomRoleCommand(user.id, organizationId, dto));
  }

  @Get('permission-groups')
  @ApiOperation({ summary: 'List permission groups' })
  listPermissionGroups(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PermissionGroupDto[]> {
    return this.queryBus.execute(new ListPermissionGroupsQuery(user.id, organizationId));
  }

  @Post('permission-groups')
  @ApiOperation({ summary: 'Create a permission group (ADMIN+)' })
  createPermissionGroup(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreatePermissionGroupDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PermissionGroupDto> {
    return this.commandBus.execute(new CreatePermissionGroupCommand(user.id, organizationId, dto));
  }

  @Get('resource-permissions')
  @ApiOperation({ summary: 'List ABAC resource permission rules' })
  listResourcePermissions(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ResourcePermissionDto[]> {
    return this.queryBus.execute(new ListResourcePermissionsQuery(user.id, organizationId));
  }

  @Post('resource-permissions')
  @ApiOperation({ summary: 'Create an ABAC resource permission rule (SECURITY_MANAGER+)' })
  createResourcePermission(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateResourcePermissionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ResourcePermissionDto> {
    return this.commandBus.execute(new CreateResourcePermissionCommand(user.id, organizationId, dto));
  }

  @Delete('resource-permissions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an ABAC resource permission rule (SECURITY_MANAGER+)' })
  async deleteResourcePermission(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteResourcePermissionCommand(user.id, organizationId, id));
  }

  @Get('temporary-permissions')
  @ApiOperation({ summary: 'List active temporary permission grants' })
  listTemporaryPermissions(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TemporaryPermissionDto[]> {
    return this.queryBus.execute(new ListTemporaryPermissionsQuery(user.id, organizationId));
  }

  @Post('temporary-permissions')
  @ApiOperation({ summary: 'Grant a time-boxed permission (SECURITY_MANAGER+)' })
  grantTemporaryPermission(
    @Param('organizationId') organizationId: string,
    @Body() dto: GrantTemporaryPermissionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TemporaryPermissionDto> {
    return this.commandBus.execute(new GrantTemporaryPermissionCommand(user.id, organizationId, dto));
  }

  @Delete('temporary-permissions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a temporary permission grant early (SECURITY_MANAGER+)' })
  async revokeTemporaryPermission(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new RevokeTemporaryPermissionCommand(user.id, organizationId, id));
  }

  @Get('approval-workflows')
  @ApiOperation({ summary: 'List approval workflows' })
  listApprovalWorkflows(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApprovalWorkflowDto[]> {
    return this.queryBus.execute(new ListApprovalWorkflowsQuery(user.id, organizationId));
  }

  @Post('approval-workflows')
  @ApiOperation({ summary: 'Create an approval workflow (ADMIN+)' })
  createApprovalWorkflow(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateApprovalWorkflowDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApprovalWorkflowDto> {
    return this.commandBus.execute(new CreateApprovalWorkflowCommand(user.id, organizationId, dto));
  }

  @Get('approval-requests')
  @ApiOperation({ summary: 'List approval requests' })
  listApprovalRequests(
    @Param('organizationId') organizationId: string,
    @Query() query: ListApprovalRequestsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApprovalRequestDto[]> {
    return this.queryBus.execute(new ListApprovalRequestsQuery(user.id, organizationId, query));
  }

  @Post('approval-requests')
  @ApiOperation({ summary: 'Open an approval request against a workflow' })
  createApprovalRequest(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateApprovalRequestDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApprovalRequestDto> {
    return this.commandBus.execute(new CreateApprovalRequestCommand(user.id, organizationId, dto));
  }

  @Post('approval-requests/:id/decide')
  @ApiOperation({ summary: "Approve or reject a request (workflow's approverRole+)" })
  decideApprovalRequest(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: DecideApprovalRequestDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApprovalRequestDto> {
    return this.commandBus.execute(new DecideApprovalRequestCommand(user.id, organizationId, id, dto));
  }
}
