import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AssetGraphDto,
  AttackSurfaceSummaryDto,
  ChangeDetectionEventDto,
  CorrelationInsightDto,
  TechnologyDto,
} from '@pentesthub/shared';
import { AssetGraphService } from '../asset-graph.service.js';
import { TechnologyDetectionService } from '../technology-detection.service.js';
import { ChangeDetectionService } from '../change-detection.service.js';
import { FindingCorrelationService } from '../finding-correlation.service.js';

/// Module 16 — tasks #373-376. Read endpoints only — every row here is
/// derived from Recon findings/Technology/BugBountyFinding by
/// `ReconJobCompletedEventHandler` (see intelligence.module.ts), never
/// written directly through this controller. Target/project-scoped
/// authorization is inherited from whatever already gated the caller's
/// access to that target (Module 1 RBAC + workspace membership) — these
/// routes don't re-derive workspaceId since a targetId/projectId is
/// already an opaque id a caller can only have obtained by already having
/// access to it elsewhere in the UI; a stricter per-route ownership check
/// is listed as a disclosed gap in the Module 16 security review (task
/// #407) alongside the same pattern in Module 6/9's asset endpoints.
/// Re-confirmed still open by the Module 18 Phase 6 database/IDOR review
/// (task #508), which fixed the narrower, previously-*undisclosed* sibling
/// gaps in `ThreatMatchService`/`VulnerabilityMatchingService`
/// (`listMatchesForTarget`) but scoped this controller's four routes out
/// as a larger, pre-existing architectural decision — see Module 18's
/// Phase 29 documentation for the full disclosure and remediation plan.
@ApiTags('intelligence')
@ApiBearerAuth()
@Controller('assets')
export class IntelligenceController {
  constructor(
    private readonly assetGraph: AssetGraphService,
    private readonly technologyDetection: TechnologyDetectionService,
    private readonly changeDetection: ChangeDetectionService,
    private readonly findingCorrelation: FindingCorrelationService,
  ) {}

  @Get('graph/:targetId')
  @ApiOperation({ summary: "Get a target's asset graph" })
  getGraph(@Param('targetId') targetId: string): Promise<AssetGraphDto> {
    return this.assetGraph.getForTarget(targetId);
  }

  @Get('attack-surface/:projectId')
  @ApiOperation({ summary: "Get a project's attack surface summary" })
  getAttackSurface(
    @Param('projectId') projectId: string,
  ): Promise<AttackSurfaceSummaryDto> {
    return this.assetGraph.attackSurfaceForProject(projectId);
  }

  @Get('technologies/:targetId')
  @ApiOperation({ summary: "List a target's detected technologies" })
  listTechnologies(@Param('targetId') targetId: string): Promise<TechnologyDto[]> {
    return this.technologyDetection.listForTarget(targetId);
  }

  @Get('changes/:targetId')
  @ApiOperation({ summary: "List a target's recent change-detection events" })
  listChanges(@Param('targetId') targetId: string): Promise<ChangeDetectionEventDto[]> {
    return this.changeDetection.listForTarget(targetId);
  }

  @Get('correlations/:projectId')
  @ApiOperation({ summary: "List a project's correlation insights" })
  listCorrelations(@Param('projectId') projectId: string): Promise<CorrelationInsightDto[]> {
    return this.findingCorrelation.listForProject(projectId);
  }
}
