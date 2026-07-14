import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { AiContextSummaryDto } from '@pentesthub/shared';
import { AiContextService } from '../context/ai-context.service.js';

/// Backs the frontend's "Context Indicator" (AI Dashboard spec) — a
/// terse summary of what the AI currently knows about this project,
/// computed from the exact same AiContextService.buildContext() the chat
/// turn itself uses, so the indicator never drifts from reality.
export class GetAiContextSummaryQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
  ) {}
}

@QueryHandler(GetAiContextSummaryQuery)
export class GetAiContextSummaryHandler implements IQueryHandler<
  GetAiContextSummaryQuery,
  AiContextSummaryDto
> {
  constructor(private readonly contextService: AiContextService) {}

  async execute(query: GetAiContextSummaryQuery): Promise<AiContextSummaryDto> {
    const { workspaceId, projectId } =
      await this.contextService.resolveWorkspaceAndProject(
        query.userId,
        query.projectId,
      );
    const context = await this.contextService.buildContext(
      workspaceId,
      projectId,
    );

    const openCriticalOrHigh =
      (context.vulnFindingCountsBySeverity.CRITICAL ?? 0) +
      (context.vulnFindingCountsBySeverity.HIGH ?? 0);
    const totalVulnFindings = Object.values(
      context.vulnFindingCountsBySeverity,
    ).reduce((a, b) => a + b, 0);
    const totalReconFindings = context.reconFindingCountsByType.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );

    return {
      workspaceId,
      projectId,
      targetCount: context.targets.length,
      reconFindingCount: totalReconFindings,
      vulnFindingCount: totalVulnFindings,
      noteCount: context.notes.length,
      evidenceCount: context.evidenceSummary.length,
      openCriticalOrHighFindings: openCriticalOrHigh,
      lastActivityAt: context.recentActivity[0]?.createdAt ?? null,
    };
  }
}
