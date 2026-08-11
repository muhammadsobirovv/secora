import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type {
  DepartmentDto,
  OrganizationDto,
  OrganizationInviteDto,
  OrganizationMemberDto,
  OrganizationSettingsDto,
  ResourceQuotaDto,
  TeamDto,
  TenantUsageDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { RequiresEdition } from '../../../common/decorators/requires-edition.decorator.js';
import {
  AcceptOrganizationInviteDto,
  AddTeamMemberDto,
  CreateDepartmentDto,
  CreateOrganizationDto,
  CreateOrganizationInviteDto,
  CreateTeamDto,
  ListOrganizationMembersQueryParamsDto,
  UpdateDepartmentDto,
  UpdateOrganizationDto,
  UpdateOrganizationMemberRoleDto,
  UpdateOrganizationSettingsDto,
  UpdateResourceQuotaDto,
  UpdateTeamDto,
  UpdateTenantBillingDto,
  UpdateTenantBrandingDto,
} from '../dto/enterprise.dto.js';
import {
  AcceptOrganizationInviteCommand,
  CreateOrganizationCommand,
  CreateOrganizationInviteCommand,
  RemoveOrganizationMemberCommand,
  RevokeOrganizationInviteCommand,
  UpdateOrganizationCommand,
  UpdateOrganizationMemberRoleCommand,
  UpdateOrganizationSettingsCommand,
  UpdateResourceQuotaCommand,
  UpdateTenantBillingCommand,
  UpdateTenantBrandingCommand,
} from '../commands/organizations.commands.js';
import {
  AddTeamMemberCommand,
  CreateDepartmentCommand,
  CreateTeamCommand,
  DeleteDepartmentCommand,
  DeleteTeamCommand,
  RemoveTeamMemberCommand,
  UpdateDepartmentCommand,
  UpdateTeamCommand,
} from '../commands/departments-teams.commands.js';
import {
  GetOrganizationQuery,
  GetOrganizationSettingsQuery,
  GetResourceQuotaQuery,
  GetTenantUsageQuery,
  ListDepartmentsQuery,
  ListMyOrganizationsQuery,
  ListOrganizationMembersQuery,
  ListTeamsQuery,
} from '../queries/organizations.query.js';

/// Module 10 — Multi-Tenant Architecture surface: Organizations (tenants),
/// Departments, Teams, membership, and invites. Organization-explicit
/// routing throughout (`:organizationId` in the URL), same pattern Module
/// 9's Collaboration controllers established for workspace-explicit
/// routes — see `organization-membership.util.ts`.
@ApiTags('enterprise')
@ApiBearerAuth()
@Controller('enterprise')
export class OrganizationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('organizations')
  @ApiOperation({ summary: 'List organizations the caller is an active member of' })
  listMine(@CurrentUser() user: RequestUser): Promise<OrganizationDto[]> {
    return this.queryBus.execute(new ListMyOrganizationsQuery(user.id));
  }

  @Post('organizations')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a new organization (tenant) — caller becomes ORG_OWNER' })
  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: RequestUser): Promise<OrganizationDto> {
    return this.commandBus.execute(new CreateOrganizationCommand(user.id, dto));
  }

  @Get('organizations/:organizationId')
  @ApiOperation({ summary: 'Get an organization (members only)' })
  get(@Param('organizationId') organizationId: string, @CurrentUser() user: RequestUser): Promise<OrganizationDto> {
    return this.queryBus.execute(new GetOrganizationQuery(user.id, organizationId));
  }

  @Patch('organizations/:organizationId')
  @ApiOperation({ summary: 'Update organization details (ORG_OWNER+)' })
  update(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<OrganizationDto> {
    return this.commandBus.execute(new UpdateOrganizationCommand(user.id, organizationId, dto));
  }

  @Get('organizations/:organizationId/settings')
  @ApiOperation({ summary: 'Get organization settings (SSO/MFA enforcement, session timeout, ...)' })
  getSettings(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<OrganizationSettingsDto | null> {
    return this.queryBus.execute(new GetOrganizationSettingsQuery(user.id, organizationId));
  }

  @Patch('organizations/:organizationId/settings')
  @ApiOperation({ summary: 'Update organization settings (ORG_OWNER+)' })
  updateSettings(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateOrganizationSettingsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<OrganizationSettingsDto> {
    return this.commandBus.execute(new UpdateOrganizationSettingsCommand(user.id, organizationId, dto));
  }

  @Get('organizations/:organizationId/quota')
  @ApiOperation({ summary: 'Get resource quota (null fields mean unlimited)' })
  getQuota(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ResourceQuotaDto | null> {
    return this.queryBus.execute(new GetResourceQuotaQuery(user.id, organizationId));
  }

  @Patch('organizations/:organizationId/quota')
  @ApiOperation({ summary: 'Update resource quota (ORG_OWNER+)' })
  updateQuota(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateResourceQuotaDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ResourceQuotaDto> {
    return this.commandBus.execute(new UpdateResourceQuotaCommand(user.id, organizationId, dto));
  }

  // --- Tenant Management (Module 14, Enterprise Edition only) ---

  @Patch('organizations/:organizationId/billing')
  @RequiresEdition('enterprise')
  @ApiOperation({ summary: 'Update tenant billing contact (ORG_OWNER+, Enterprise Edition only)' })
  updateBilling(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateTenantBillingDto,
    @CurrentUser() user: RequestUser,
  ): Promise<OrganizationDto> {
    return this.commandBus.execute(new UpdateTenantBillingCommand(user.id, organizationId, dto));
  }

  @Patch('organizations/:organizationId/branding')
  @RequiresEdition('enterprise')
  @ApiOperation({ summary: 'Update custom domain / branding (ORG_OWNER+, Enterprise Edition only)' })
  updateBranding(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateTenantBrandingDto,
    @CurrentUser() user: RequestUser,
  ): Promise<OrganizationDto> {
    return this.commandBus.execute(new UpdateTenantBrandingCommand(user.id, organizationId, dto));
  }

  @Get('organizations/:organizationId/usage')
  @RequiresEdition('enterprise')
  @ApiOperation({ summary: 'Resource usage against quota (members only, Enterprise Edition only)' })
  getUsage(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TenantUsageDto> {
    return this.queryBus.execute(new GetTenantUsageQuery(user.id, organizationId));
  }

  // --- Members ---

  @Get('organizations/:organizationId/members')
  @ApiOperation({ summary: 'List organization members' })
  listMembers(
    @Param('organizationId') organizationId: string,
    @Query() query: ListOrganizationMembersQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<OrganizationMemberDto[]> {
    return this.queryBus.execute(new ListOrganizationMembersQuery(user.id, organizationId, query));
  }

  @Patch('organizations/:organizationId/members/:userId/role')
  @ApiOperation({ summary: "Change a member's enterprise role (ADMIN+, cannot grant above your own role)" })
  async updateMemberRole(
    @Param('organizationId') organizationId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateOrganizationMemberRoleDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new UpdateOrganizationMemberRoleCommand(user.id, organizationId, targetUserId, dto));
  }

  @Delete('organizations/:organizationId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the organization (ADMIN+)' })
  async removeMember(
    @Param('organizationId') organizationId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new RemoveOrganizationMemberCommand(user.id, organizationId, targetUserId));
  }

  // --- Invites ---

  @Post('organizations/:organizationId/invites')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Invite someone to the organization at a role (ADMIN+)' })
  createInvite(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateOrganizationInviteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<OrganizationInviteDto> {
    return this.commandBus.execute(new CreateOrganizationInviteCommand(user.id, organizationId, dto));
  }

  @Delete('organizations/:organizationId/invites/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an outstanding invite (ADMIN+)' })
  async revokeInvite(
    @Param('organizationId') organizationId: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new RevokeOrganizationInviteCommand(user.id, organizationId, inviteId));
  }

  @Post('organizations/invites/accept')
  @ApiOperation({ summary: 'Redeem an organization invite token' })
  acceptInvite(
    @Body() dto: AcceptOrganizationInviteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<OrganizationInviteDto> {
    return this.commandBus.execute(new AcceptOrganizationInviteCommand(user.id, user.email, dto));
  }

  // --- Departments ---

  @Get('organizations/:organizationId/departments')
  @ApiOperation({ summary: 'List departments' })
  listDepartments(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<DepartmentDto[]> {
    return this.queryBus.execute(new ListDepartmentsQuery(user.id, organizationId));
  }

  @Post('organizations/:organizationId/departments')
  @ApiOperation({ summary: 'Create a department (ADMIN+)' })
  createDepartment(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateDepartmentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<DepartmentDto> {
    return this.commandBus.execute(new CreateDepartmentCommand(user.id, organizationId, dto));
  }

  @Patch('organizations/:organizationId/departments/:id')
  @ApiOperation({ summary: 'Update a department (ADMIN+)' })
  updateDepartment(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<DepartmentDto> {
    return this.commandBus.execute(new UpdateDepartmentCommand(user.id, organizationId, id, dto));
  }

  @Delete('organizations/:organizationId/departments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a department (ADMIN+)' })
  async deleteDepartment(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteDepartmentCommand(user.id, organizationId, id));
  }

  // --- Teams ---

  @Get('organizations/:organizationId/teams')
  @ApiOperation({ summary: 'List teams' })
  listTeams(@Param('organizationId') organizationId: string, @CurrentUser() user: RequestUser): Promise<TeamDto[]> {
    return this.queryBus.execute(new ListTeamsQuery(user.id, organizationId));
  }

  @Post('organizations/:organizationId/teams')
  @ApiOperation({ summary: 'Create a team (TEAM_LEAD+)' })
  createTeam(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateTeamDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamDto> {
    return this.commandBus.execute(new CreateTeamCommand(user.id, organizationId, dto));
  }

  @Patch('organizations/:organizationId/teams/:id')
  @ApiOperation({ summary: 'Update a team (TEAM_LEAD+)' })
  updateTeam(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamDto> {
    return this.commandBus.execute(new UpdateTeamCommand(user.id, organizationId, id, dto));
  }

  @Delete('organizations/:organizationId/teams/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a team (ADMIN+)' })
  async deleteTeam(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteTeamCommand(user.id, organizationId, id));
  }

  @Post('organizations/:organizationId/teams/:id/members')
  @ApiOperation({ summary: 'Add an organization member to a team (TEAM_LEAD+)' })
  async addTeamMember(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: AddTeamMemberDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new AddTeamMemberCommand(user.id, organizationId, id, dto));
  }

  @Delete('organizations/:organizationId/teams/:id/members/:organizationMemberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from a team (TEAM_LEAD+)' })
  async removeTeamMember(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('organizationMemberId') organizationMemberId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new RemoveTeamMemberCommand(user.id, organizationId, id, organizationMemberId));
  }
}
