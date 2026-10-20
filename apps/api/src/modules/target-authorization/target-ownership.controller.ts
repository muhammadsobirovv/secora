import { Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { TargetOwnershipStatusDto } from '@pentesthub/shared';
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
import { TargetOwnershipService } from './target-ownership.service.js';

/// Ownership verification for a target: create a challenge, then verify it
/// once the record or file/meta tag is published.
@ApiTags('targets')
@ApiBearerAuth()
@Controller('targets/:targetId/ownership')
export class TargetOwnershipController {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    private readonly ownershipService: TargetOwnershipService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Ownership verification status of the target' })
  async status(
    @Param('targetId') targetId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TargetOwnershipStatusDto> {
    const { target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      user.id,
      targetId,
    );
    return this.ownershipService.getStatus(target);
  }

  @Post('challenge')
  @ApiOperation({
    summary: 'Create (or reuse) the verification token for an unverified target',
  })
  async challenge(
    @Param('targetId') targetId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<TargetOwnershipStatusDto> {
    const { workspaceId, target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      user.id,
      targetId,
    );
    return this.ownershipService.createChallenge({
      userId: user.id,
      workspaceId,
      target,
      context: extractRequestContext(req),
    });
  }

  @Post('verify')
  @ApiOperation({ summary: 'Check the published token and verify the target' })
  async verify(
    @Param('targetId') targetId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<TargetOwnershipStatusDto> {
    const { workspaceId, target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      user.id,
      targetId,
    );
    return this.ownershipService.verify({
      userId: user.id,
      workspaceId,
      target,
      context: extractRequestContext(req),
    });
  }
}
