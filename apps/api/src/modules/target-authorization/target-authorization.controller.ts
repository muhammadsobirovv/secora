import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type {
  TargetAuthorizationDto,
  TargetAuthorizationStatusDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../common/types/authenticated-request.js';
import { extractRequestContext } from '../../common/utils/request-context.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../projects/domain/repositories/projects.repository.interface.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../targets/domain/repositories/targets.repository.interface.js';
import { resolveTargetForCaller } from '../targets/commands/target-lifecycle.commands.js';
import { AttestTargetAuthorizationDto } from './dto/attest-target-authorization.dto.js';
import { TargetAuthorizationService } from './target-authorization.service.js';

@ApiTags('targets')
@ApiBearerAuth()
@Controller('targets/:targetId/authorization')
export class TargetAuthorizationController {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    private readonly authorizationService: TargetAuthorizationService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Whether the target has a valid authorization for active scans',
  })
  async status(
    @Param('targetId') targetId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TargetAuthorizationStatusDto> {
    const { target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      user.id,
      targetId,
    );
    return this.authorizationService.getStatus(target);
  }

  @Post()
  @ApiOperation({
    summary:
      'Attest how you are authorized to test this target (adds a new attestation)',
  })
  async attest(
    @Param('targetId') targetId: string,
    @Body() dto: AttestTargetAuthorizationDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<TargetAuthorizationDto> {
    const { workspaceId, target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      user.id,
      targetId,
    );
    return this.authorizationService.attestTarget({
      userId: user.id,
      workspaceId,
      target,
      data: dto,
      context: extractRequestContext(req),
    });
  }
}
