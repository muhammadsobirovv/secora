import { Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import type {
  CheckDuplicateFindingRequestDto,
  CheckDuplicateFindingResultDto,
  DuplicateMatchDto,
} from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_FINDINGS_REPOSITORY,
  type BugBountyFindingsRepository,
  type DuplicateCandidateProjection,
} from '../domain/repositories/bugbounty-findings.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { AiMemoryService } from '../../ai/memory/ai-memory.service.js';
import {
  scoreLexicalMatch,
  type DuplicateMatchReason,
} from '../duplicate-detection/duplicate-lexical-score.util.js';

export class CheckDuplicateFindingQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly data: CheckDuplicateFindingRequestDto,
  ) {}
}

/// Combines two independent signals per candidate finding, per ADR 0006:
/// lexical (exact target/endpoint/payload/vulnType matches + title token
/// overlap — always available, no AI dependency) and semantic (embedding
/// cosine similarity over the finding's indexed description — reuses the
/// RAG layer's AiMemoryChunk store rather than a second similarity
/// engine; silently contributes nothing when no embedding provider is
/// configured, same "best-effort enrichment" rule AiMemoryService.search
/// already follows). The two scores are combined by taking the max per
/// candidate (either signal alone can be strong enough to flag a
/// duplicate) and merging their matchedOn reasons.
@QueryHandler(CheckDuplicateFindingQuery)
export class CheckDuplicateFindingHandler implements IQueryHandler<
  CheckDuplicateFindingQuery,
  CheckDuplicateFindingResultDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    private readonly memoryService: AiMemoryService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(
    query: CheckDuplicateFindingQuery,
  ): Promise<CheckDuplicateFindingResultDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );

    const [candidates, semanticResults] = await Promise.all([
      this.findingsRepository.findDuplicateCandidates({
        workspaceId: workspace.id,
        programId: query.data.programId,
        excludeFindingId: query.data.excludeFindingId,
      }),
      this.memoryService.search(
        workspace.id,
        this.buildSemanticQueryText(query.data),
        {
          sourceType: 'BUGBOUNTY_FINDING',
          topK: 20,
        },
      ),
    ]);

    const semanticScoreByFindingId = new Map<string, number>();
    for (const result of semanticResults) {
      const existing = semanticScoreByFindingId.get(result.sourceId) ?? 0;
      semanticScoreByFindingId.set(
        result.sourceId,
        Math.max(existing, result.score),
      );
    }

    const threshold = this.configService.get(
      'BUGBOUNTY_DUPLICATE_SIMILARITY_THRESHOLD',
      { infer: true },
    );

    const matches: DuplicateMatchDto[] = candidates
      .map((candidate) =>
        this.scoreCandidate(query.data, candidate, semanticScoreByFindingId),
      )
      .filter((match) => match.similarityScore >= threshold)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 10);

    return { matches };
  }

  private buildSemanticQueryText(
    data: CheckDuplicateFindingRequestDto,
  ): string {
    return [data.title, data.vulnType, data.endpoint, data.payload]
      .filter((v): v is string => !!v?.trim())
      .join(' — ');
  }

  private scoreCandidate(
    data: CheckDuplicateFindingRequestDto,
    candidate: DuplicateCandidateProjection,
    semanticScoreByFindingId: Map<string, number>,
  ): DuplicateMatchDto {
    const lexical = scoreLexicalMatch(data, candidate);
    const semanticScore = semanticScoreByFindingId.get(candidate.id) ?? 0;

    const matchedOn = new Set<DuplicateMatchReason>(lexical.matchedOn);
    if (semanticScore >= 0.5) matchedOn.add('semantic');

    return {
      findingId: candidate.id,
      title: candidate.title,
      target: candidate.targetId,
      endpoint: candidate.endpoint,
      vulnType: candidate.vulnType,
      stage: candidate.stage,
      similarity