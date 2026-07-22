import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { WorkspaceInviteDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  AcceptWorkspaceInviteDto,
  CreateWorkspaceInviteDto,
  ListWorkspaceInvitesQueryParamsDto,
  UpdateWorkspaceMemberRoleDto,
} from '../dto/collaboration.dto.js';
import {
  AcceptWorkspaceInviteCommand,
  CreateWorkspaceInviteCommand,
  RemoveWorkspaceMemberCommand,
  RevokeWorkspaceInviteCommand,
  UpdateWorkspaceMemberRoleCommand,
} from '../commands/workspace-invites.commands.js';
import { ListWorkspaceInvitesQuery } from '../queries/workspace-invites.query.js';

/// Workspace-explicit surface (see workspace-membership.util.ts's doc
/// comment) — every route here takes `:workspaceId` from the URL rather
/// than resolving "the caller's own workspace", since Collaboration is
/// specifically about acting on behalf of a workspace that may not be
/// the caller's personal one.
@ApiTags('collaboration')
@ApiBearerAuth()
@Controller('collaboration')
export class WorkspaceMembersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('workspaces/:workspaceId/invites')
  @ApiOperation({ summary: 'List outstanding invites for a workspace (ADMIN+)' })
  list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListWorkspaceInvitesQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkspaceInviteDto[]> {
    return this.queryBus.execute(new ListWorkspaceInvitesQuery(user.id, workspaceId, query));
  }

  @Post('workspaces/:workspaceId/invites')
  @ApiOperation({ summary: 'Invite a teammate to the workspace at a role (ADMIN+)' })
  invite(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateWorkspaceInviteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkspaceInviteDto> {
    return this.commandBus.execute(new CreateWorkspaceInviteCommand(user.id, workspaceId, dto));
  }

  @Delete('workspaces/:workspaceId/invites/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an outstanding invite (ADMIN+)' })
  async revoke(
    @Param('workspaceId') workspaceId: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new RevokeWorkspaceInviteCommand(user.id, workspaceId, inviteId));
  }

  @Post('invites/accept')
  @ApiOperation({ summary: 'Redeem an invite token — joins the workspace at the invited role' })
  accept(
    @Body() dto: AcceptWorkspaceInviteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkspaceInviteDto> {
    return this.commandBus.execute(new AcceptWorkspaceInviteCommand(user.id, user.email, dto));
  }

  @Patch('workspaces/:workspaceId/members/:userId/role')
  @ApiOperation({ summary: "Change a member's role (ADMIN+, cannot grant above your own role)" })
  async updateRole(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateWorkspaceMemberRoleDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdateWorkspaceMemberRoleCommand(user.id, workspaceId, targetUserId, dto),
    );
  }

  @Delete('workspaces/:workspaceId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the workspace (ADMIN+)' })
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new RemoveWorkspaceMemberCommand(user.id, workspaceId, targetUserId));
  }
}
