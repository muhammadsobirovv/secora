import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { ReconJobCompletedEvent } from '../../recon/events/recon-job-events.js';
import { TechnologyDetectionService } from '../technology-detection.service.js';
import { AssetGraphService } from '../asset-graph.service.js';
import { ChangeDetectionService } from '../change-detection.service.js';
import { FindingCorrelationService } from '../finding-correlation.service.js';
import { VulnerabilityMatchingService } from '../vulnerability-matching.service.js';
import { ThreatMatchService } from '../../threat-intel/threat-match.service.js';

/// Module 16 — tasks #372-376. Runs Technology detection, then Asset
/// Graph rebuild (which reads the freshly-upserted Technology rows), then
/// Change Detection diff, every time a Recon job completes. Best-effort:
/// a failure here must never affect the Recon job's own success/failure
/// state (already committed by the time this handler runs) — logged, not
/// rethrown, matching the platform's established "derived intelligence is
/// additive, not load-bearing" posture for event subscribers.
@EventsHandler(ReconJobCompletedEvent)
export class ReconJobCompletedIntelligenceHandler
  implements IEventHandler<ReconJobCompletedEvent>
{
  private readonly logger = new Logger(ReconJobCompletedIntelligenceHandler.name);

  constructor(
    private readonly technologyDetection: TechnologyDetectionService,
    private readonly assetGraph: AssetGraphService,
    private readonly changeDetection: ChangeDetectionService,
    private readonly findingCorrelation: FindingCorrelationService,
    private readonly vulnerabilityMatching: VulnerabilityMatchingService,
    private readonly threatMatch: ThreatMatchService,
  ) {}

  async handle(event: ReconJobCompletedEvent): Promise<void> {
    const targetId = event.metadata?.targetId;
    if (typeof targetId !== 'string' || !targetId) {
      // Defends against the event being published without the metadata
      // field this handler depends on (e.g. an older event shape, or a
      // future caller that forgets to set it) — skip rather than throw,
      // since this is best-effort derived intelligence.
      this.logger.warn(`ReconJobCompletedEvent for job ${event.jobId} has no targetId in metadata — skipping intelligence derivation.`);
      return;
    }

    try {
      await this.technologyDetection.detectForTarget(
        event.workspaceId,
        event.projectId,
        targetId,
      );
    } catch (error: unknown) {
      this.logger.warn(`Technology detection failed for target ${targetId}: ${String(error)}`);
    }

    try {
      await this.assetGraph.rebuild(targetId);
    } catch (error: unknown) {
      this.logger.warn(`Asset graph rebuild failed for target ${targetId}: ${String(error)}`);
    }

    try {
      await this.changeDetection.diffLatestForTarget(
        event.workspaceId,
        event.projectId,
        targetId,
        event.jobId,
      );
    } catch (error: unknown) {
      this.logger.warn(`Change detection diff failed for target ${targetId}: ${String(error)}`);
    }

    // Module 16 — task #395. Must run before finding correlation: the
    // OUTDATED_TECH_KNOWN_CVE heuristic reads CveMatch rows this call
    // produces (see FindingCorrelationService's own doc comment on that
    // dependency).
    try {
      await this.vulnerabilityMatching.runForTarget(event.workspaceId, event.projectId, targetId);
    } catch (error: unknown) {
      this.logger.warn(`Vulnerability matching failed for target ${targetId}: ${String(error)}`);
    }

    // Module 17 — task #469. Independent of vulnerability matching (no
    // read-after-write dependency either direction) — placed alongside it
    // since both are "derive proposed correlations against this target's
    // fresh asset graph" steps.
    try {
      await this.threatMatch.runForTarget(event.workspaceId, event.projectId, targetId);
    } catch (error: unknown) {
      this.logger.warn(`Threat match correlation failed for target ${targetId}: ${String(error)}`);
    }

    try {
      // event.jobId is passed so the Change Intelligence heuristic (task
      // #464) can scope its ChangeDetectionEvent read to exactly this
      // run's diff — see FindingCorrelationService.detectChangeIntelligence.
      await this.findingCorrelation.runForTarget(event.workspaceId, event.projectId, targetId, event.jobId);
    } catch (error: unknown) {
      this.logger.warn(`Finding correlation failed for target ${targetId}: ${String(error)}`);
    }
  }
}
