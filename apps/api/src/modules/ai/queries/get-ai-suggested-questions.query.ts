import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { AiSuggestedQuestionDto } from '@pentesthub/shared';
import { AiContextService } from '../context/ai-context.service.js';

export class GetAiSuggestedQuestionsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly projectId: string,
  ) {}
}

/// Rule-based, not an LLM call — deliberately deterministic and instant
/// (no provider round trip, no cost) since this only needs to populate a
/// handful of quick-start buttons on page load (AI Dashboard: "Suggested
/// Questions"). Falls back to generic prompts when the project has no
/// data yet worth asking about.
@QueryHandler(GetAiSuggestedQuestionsQuery)
export class GetAiSuggestedQuestionsHandler implements IQueryHandler<
  GetAiSuggestedQuestionsQuery,
  AiSuggestedQuestionDto[]
> {
  constructor(private readonly contextService: AiContextService) {}

  async execute(
    query: GetAiSuggestedQuestionsQuery,
  ): Promise<AiSuggestedQuestionDto[]> {
    const { workspaceId, projectId } =
      await this.contextService.resolveWorkspaceAndProject(
        query.userId,
        query.projectId,
      );
    const context = await this.contextService.buildContext(
      workspaceId,
      projectId,
    );
    const suggestions: AiSuggestedQuestionDto[] = [];

    const criticalOrHigh =
      (context.vulnFindingCountsBySeverity.CRITICAL ?? 0) +
      (context.vulnFindingCountsBySeverity.HIGH ?? 0);
    if (criticalOrHigh > 0) {
      suggestions.push({
        label: `Summarize the ${criticalOrHigh} critical/high findings`,
        prompt:
          'Summarize the critical and high severity findings in this project and suggest which to fix first.',
      });
    }
    if (context.recentReconFindings.length > 0) {
      suggestions.push({
        label: 'What does the attack surface look like?',
        prompt:
          "Based on the recon results, summarize this project's attack surface and flag anything unusual.",
      });
    }
    if (context.targets.length > 0) {
      suggestions.push({
        label: 'What should I scan next?',
        prompt:
          'Given the current findings and scan history, what should I scan or investigate next?',
      });
    }
    if (context.recentVulnFindings.length > 0) {
      suggestions.push({
        label: 'Draft an executive summary',
        prompt:
          "Draft an executive summary of this project's findings for a non-technical stakeholder.",
      });
    }
    suggestions.push({
      label: 'Explain a finding in plain terms',
      prompt:
        'Pick the most interesting finding in this project and explain it in plain terms, including how to fix it.',
    });

    return suggestions.slice(0, 5);
  }
}
