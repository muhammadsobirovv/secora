import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AssetGraphNodeType, RiskFactorSnapshotDto, RiskScoreV2ResultDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { RiskEngineV2Service } from '../risk-engine-v2.service.js';
import { ComputeRiskScoreDto } from '../dto/risk.dto.js';

/// Module 17 — task #474/#475 (Risk Engine v2 + Risk prioritization).
/// Workspace resolution mirrors every other Module 17 controller — see
/// `ResearchSessionController`'s doc comment.
@ApiTags('risk')
@ApiBearerAuth()
@Controller('risk')
export class RiskController {
  constructor(
    private readonly risk: RiskEngineV2Service,
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

  @Post('compute')
  @ApiOperation({ summary: 'Compute a Risk Engine v2 score/tier/recommended priority; optionally persist a snapshot' })
  async compute(
    @CurrentUser() user: RequestUser,
    @Body() dto: ComputeRiskScoreDto,
  ): Promise<RiskScoreV2ResultDto | RiskFactorSnapshotDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    const { findingId, assetNodeType, assetRefId, persist, ...factors } = dto;

    if (!persist) {
      return this.risk.compute(factors);
    }

    if (!findingId && !(assetNodeType && assetRefId)) {
      throw new AppException(
        'RISK_SNAPSHOT_TARGET_REQUIRED',
        'Persisting a snapshot requires either findingId or both assetNodeType and assetRefId.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.risk.recordSnapshot(workspaceId, { findingId, assetNodeType, assetRefId }, factors, user.id);
  }

  @Get('findings/:findingId')
  @ApiOperation({ summary: "Get a finding's latest risk snapshot" })
  async latestForFinding(@CurrentUser() user: RequestUser, @Param('findingId') findingId: string): Promise<RiskFactorSnapshotDto | null> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.risk.latestForFinding(workspaceId, findingId);
  }

  @Get('findings/:findingId/history')
  @ApiOperation({ summary: "Get a finding's risk score history" })
  async historyForFinding(
    @CurrentUser() user: RequestUser,
    @Param('findingId') findingId: string,
    @Query('limit') limit?: string,
  ): Promise<RiskFactorSnapshotDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.risk.historyForFinding(workspaceId, findingId, limit ? Number(limit) : undefined);
  }

  @Get('assets/:nodeType/:refId')
  @ApiOperation({ summary: "Get an asset-graph node's latest risk snapshot" })
  async latestForAsset(
    @CurrentUser() user: RequestUser,
    @Param('nodeType') nodeType: string,
    @Param('refId') refId: string,
  ): Promise<RiskFactorSnapshotDto | null> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.risk.latestForAsset(workspaceId, nodeType as AssetGraphNodeType, refId);
  }

  @Get('assets/:nodeType/:refId/history')
  @ApiOperation({ summary: "Get an asset-graph node's risk score history" })
  async historyForAsset(
    @CurrentUser() user: RequestUser,
    @Param('nodeType') nodeType: string,
    @Param('refId') refId: string,
    @Query('limit') limit?: string,
  ): Promise<RiskFactorSnapshotDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.risk.historyForAsset(workspaceId, nodeType as AssetGraphNodeType, refId, limit ? Number(limit) : undefined);
  }
}
