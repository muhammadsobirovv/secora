import { Controller, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AnalyzeIncidentResponseDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { AiSocAnalystService } from '../ai-soc-analyst.service.js';

/// Module 17 — task #471 (AI SOC Analyst). Workspace resolution mirrors
/// every other Module 17 controller — see `SecurityMetricsController`'s
/// doc comment. `POST` (not `GET`) because this call has a real,
/// disclosed side effect — one append-only `AI_ANALYSIS` timeline row —
/// even though it never mutates the incident's own fields.
@ApiTags('ai-soc-analyst')
@ApiBearerAuth()
@Controller('incidents')
export class AiSocAnalystController {
  constructor(
    private readonly aiSocAnalyst: AiSocAnalystService,
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

  @Post(':id/ai-analysis')
  @ApiOperation({
    summary:
      'Generate an evidence-grounded, advisory AI SOC analysis for this incident (never declares compromise as fact, never auto-applies its suggestions)',
  })
  async analyze(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<AnalyzeIncidentResponseDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.aiSocAnalyst.analyzeIncident(workspaceId, user.id, id);
  }
}
