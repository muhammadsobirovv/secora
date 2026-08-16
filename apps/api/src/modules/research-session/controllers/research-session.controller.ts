import { Body, Controller, Get, HttpStatus, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  ResearchSessionDto,
  ResearchSessionLinkDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { ResearchSessionService } from '../research-session.service.js';
import {
  CreateResearchSessionDto,
  LinkResearchSessionEntityDto,
} from '../dto/create-research-session.dto.js';

/// Module 16 — task #371. Resolves the caller's workspace from `userId`
/// via `WorkspacesRepository.findPersonalWorkspaceForUser` (same sole
/// resolution path every Project/Target/Note/... command uses — see that
/// interface's own doc comment) rather than trusting a client-supplied
/// `workspaceId` query param, which would let one authenticated user read
/// or mutate another workspace's research sessions by guessing an id.
@ApiTags('research-sessions')
@ApiBearerAuth()
@Controller('research-sessions')
export class ResearchSessionController {
  constructor(
    private readonly sessions: ResearchSessionService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  private async resolveWorkspaceId(userId: string): Promise<string> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(userId);
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return workspace.id;
  }

  @Get()
  @ApiOperation({ summary: "List this workspace's research sessions" })
  async list(@CurrentUser() user: RequestUser): Promise<ResearchSessionDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.sessions.listForWorkspace(workspaceId);
  }

  @Post()
  @ApiOperation({ summary: 'Start a new research session' })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateResearchSessionDto,
  ): Promise<ResearchSessionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.sessions.create(workspaceId, user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a research session' })
  async get(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<ResearchSessionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.sessions.getForWorkspace(id, workspaceId);
  }

  @Patch(':id/pause')
  @ApiOperation({ summary: 'Pause a research session' })
  async pause(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<ResearchSessionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.sessions.pause(id, workspaceId);
  }

  @Patch(':id/resume')
  @ApiOperation({ summary: 'Resume a paused research session' })
  async resume(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<ResearchSessionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.sessions.resume(id, workspaceId);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Mark a research session complete' })
  async complete(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<ResearchSessionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.sessions.complete(id, workspaceId);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive a research session' })
  async archive(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<ResearchSessionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.sessions.archive(id, workspaceId);
  }

  @Get(':id/links')
  @ApiOperation({ summary: 'List entities linked to a research session' })
  async listLinks(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<ResearchSessionLinkDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.sessions.listLinks(id, workspaceId);
  }

  @Post(':id/links')
  @ApiOperation({ summary: 'Link an entity (recon job, finding, note, ...) to a research session' })
  async link(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: LinkResearchSessionEntityDto,
  ): Promise<ResearchSessionLinkDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.sessions.link(id, workspaceId, dto);
  }
}
