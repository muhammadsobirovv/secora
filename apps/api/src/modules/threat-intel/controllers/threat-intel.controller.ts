import { Body, Controller, Get, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  IndicatorDto,
  ThreatActorDto,
  ThreatCampaignDto,
  ThreatIntelImportLogDto,
  ThreatMatchDto,
  ThreatReportDto,
  ThreatRelationshipDto,
  ThreatTechniqueDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { IndicatorsService } from '../indicators.service.js';
import { ThreatIntelCatalogService } from '../threat-intel-catalog.service.js';
import { ThreatIntelProviderService } from '../threat-intel-provider.service.js';
import { StixTaxiiService } from '../stix-taxii.service.js';
import { ThreatMatchService } from '../threat-match.service.js';
import {
  CreateIndicatorDto,
  ImportStixBundleDto,
  ListIndicatorsQueryDto,
  RefreshThreatIntelDto,
  UpdateIndicatorStatusDto,
  UpdateThreatMatchStatusDto,
} from '../dto/threat-intel.dto.js';

/// Module 17 — Threat Intelligence Engine + Indicator management +
/// STIX/TAXII + correlation (tasks #465-469, spec sections 6-10). Shares
/// the `intel` route prefix `CveIntelligenceController` (Module 16)
/// already established under sub-paths that don't collide
/// (`cve`/`cve-matches` there vs. `indicators`/`actors`/... here) —
/// deliberately not merged into that controller/module since Threat
/// Intelligence is a materially larger, separately-evolving domain (its
/// own data model, provider set, and STIX/TAXII ingestion), matching this
/// codebase's precedent of multiple controllers sharing one route
/// namespace (e.g. `assets` across `IntelligenceController`).
///
/// Global (`workspaceId: null`) catalog reads (`actors`/`campaigns`/
/// `reports`/`techniques`) intentionally do not resolve/require a
/// workspace at all — same posture `CveIntelligenceController.lookup`
/// already established for shared cache data (disclosed gap tracked under
/// task #407: target/project id is an opaque id gated elsewhere). Every
/// write path (`createIndicator`, `import/stix`, `threat-matches/:id/status`)
/// resolves the caller's own workspace and can only touch that workspace's
/// own rows.
@ApiTags('threat-intelligence')
@ApiBearerAuth()
@Controller('intel')
export class ThreatIntelController {
  constructor(
    private readonly indicators: IndicatorsService,
    private readonly catalog: ThreatIntelCatalogService,
    private readonly provider: ThreatIntelProviderService,
    private readonly stixTaxii: StixTaxiiService,
    private readonly threatMatch: ThreatMatchService,
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

  @Get('indicators')
  @ApiOperation({ summary: 'List indicators visible to this workspace (its own + the shared public cache)' })
  async listIndicators(@CurrentUser() user: RequestUser, @Query() query: ListIndicatorsQueryDto): Promise<IndicatorDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.indicators.listForWorkspace(workspaceId, query);
  }

  @Get('indicators/:id')
  @ApiOperation({ summary: 'Get an indicator' })
  async getIndicator(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<IndicatorDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.indicators.getForWorkspace(id, workspaceId);
  }

  @Post('indicators')
  @ApiOperation({ summary: 'Manually add a private indicator to this workspace' })
  async createIndicator(@CurrentUser() user: RequestUser, @Body() dto: CreateIndicatorDto): Promise<IndicatorDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.indicators.createManual(workspaceId, user.id, dto);
  }

  @Patch('indicators/:id/status')
  @ApiOperation({ summary: "Disable/expire/re-activate this workspace's own private indicator" })
  async updateIndicatorStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateIndicatorStatusDto,
  ): Promise<IndicatorDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.indicators.setStatus(id, workspaceId, dto.status);
  }

  @Get('actors')
  @ApiOperation({ summary: 'List threat actors (global cache + this workspace)' })
  async listActors(@CurrentUser() user: RequestUser): Promise<ThreatActorDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.catalog.listActors(workspaceId);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'List threat campaigns (global cache + this workspace)' })
  async listCampaigns(@CurrentUser() user: RequestUser): Promise<ThreatCampaignDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.catalog.listCampaigns(workspaceId);
  }

  @Get('reports')
  @ApiOperation({ summary: 'List threat reports (global cache + this workspace)' })
  async listReports(@CurrentUser() user: RequestUser): Promise<ThreatReportDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.catalog.listReports(workspaceId);
  }

  @Get('techniques')
  @ApiOperation({ summary: 'List ATT&CK-style techniques (global cache + this workspace)' })
  async listTechniques(@CurrentUser() user: RequestUser): Promise<ThreatTechniqueDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.catalog.listTechniques(workspaceId);
  }

  @Get('relationships/:objectType/:objectId')
  @ApiOperation({ summary: 'List relationships involving a threat-intel object (either as source or target)' })
  async listRelationships(
    @CurrentUser() user: RequestUser,
    @Param('objectType') objectType: string,
    @Param('objectId') objectId: string,
  ): Promise<ThreatRelationshipDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.catalog.listRelationships(workspaceId, objectType, objectId);
  }

  @Get('import-logs')
  @ApiOperation({ summary: 'List recent threat-intel import runs (provider refreshes + STIX/TAXII imports)' })
  async listImportLogs(@CurrentUser() user: RequestUser): Promise<ThreatIntelImportLogDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.provider.listImportLogs(workspaceId);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @ApiOperation({ summary: 'Explicitly refresh indicators from the configured external threat-intel provider' })
  async refresh(@Body() dto: RefreshThreatIntelDto): Promise<ThreatIntelImportLogDto> {
    return this.provider.refresh(dto.sourceType);
  }

  @Post('import/stix')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @ApiOperation({ summary: 'Import a STIX 2.1 Bundle (untrusted external data — see StixTaxiiService)' })
  async importStix(@CurrentUser() user: RequestUser, @Body() dto: ImportStixBundleDto): Promise<ThreatIntelImportLogDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.stixTaxii.importBundle(workspaceId, user.id, dto.bundle);
  }

  @Post('taxii/poll')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @ApiOperation({ summary: 'Poll the operator-configured TAXII 2.1 collection for new objects' })
  async pollTaxii(@CurrentUser() user: RequestUser): Promise<ThreatIntelImportLogDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.stixTaxii.pollTaxiiCollection(workspaceId, user.id);
  }

  @Get('threat-matches/:targetId')
  @ApiOperation({ summary: "List a target's proposed threat-intel matches (never auto-confirmed — see analystStatus/evidence)" })
  matchesForTarget(@Param('targetId') targetId: string): Promise<ThreatMatchDto[]> {
    return this.threatMatch.listMatchesForTarget(targetId);
  }

  @Patch('threat-matches/:id/status')
  @ApiOperation({ summary: 'Set the analyst status of a threat match (NEW/UNDER_REVIEW/CONFIRMED/FALSE_POSITIVE/IGNORED)' })
  async updateMatchStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateThreatMatchStatusDto,
  ): Promise<ThreatMatchDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.threatMatch.setAnalystStatus(id, workspaceId, dto.analystStatus);
  }
}
