import { Body, Controller, Get, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AiInvestigationSessionDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { AiInvestigationService } from '../ai-investigation.service.js';
import { DecideAiInvestigationDto, StartAiInvestigationDto } from '../dto/ai-investigation.dto.js';

/// Module 16 — AI Investigation Mode (task #398). Resolves workspaceId
/// from the authenticated caller via `WorkspacesRepository
/// .findPersonalWorkspaceForUser` — the same enumeration-safe pattern
/// `ResearchSessionController`/`SecurityController` use — never from a
/// client-supplied value. `start()`'s `targetId` is a request body field,
/// but `AiInvestigationService.start()` independently re-resolves and
/// verifies it against this workspace via `resolveTargetForCaller` before
/// trusting it for anything — see that service's class doc comment.
@ApiTags('ai-investigation')
@ApiBearerAuth()
@Controller('ai/investigations')
export class AiInvestigationController {
  constructor(
    private readonly investigations: AiInvestigationService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  private async resolveWorkspaceId(userId: string): Promise<string> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    return workspace.id;
  }

  @Get()
  @ApiOperation({ summary: "List this workspace's AI Investigation sessions" })
  async list(@CurrentUser() user: RequestUser): Promise<AiInvestigationSessionDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.investigations.listForWorkspace(workspaceId);
  }

  @Post()
  @ApiOperation({ summary: 'Start a new AI Investigation: validates scope, generates a plan, submits it for approval' })
  async start(
    @CurrentUser() user: RequestUser,
    @Body() dto: StartAiInvestigationDto,
  ): Promise<AiInvestigationSessionDto> {
    return this.investigations.start(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an AI Investigation session, its plan, and its steps' })
  async get(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<AiInvestigationSessionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.investigations.getForWorkspace(id, workspaceId);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve or deny an investigation plan. Approving executes every step through the existing ToolRunner/ScopeEngine path.' })
  async approve(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: DecideAiInvestigationDto,
  ): Promise<AiInvestigationSessionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.investigations.decide(id, workspaceId, user.id, dto.approve, dto.decisionNote);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an investigation before it starts running' })
  async cancel(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<AiInvestigationSessionDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.investigations.cancel(id, workspaceId);
  }
}
