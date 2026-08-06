import { HttpStatus, Injectable } from '@nestjs/common';
import type { AiProviderName, EvaluationRunDto, RunEvaluationRequestDto } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiProviderRegistryService } from '../ai/providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../ai/providers/collect-stream.util.js';
import { EvaluationRepository } from './evaluation.repository.js';
import { toEvaluationRunDto } from './to-evaluation-run-dto.mapper.js';

/// Module 13 — AI Evaluation (task #289). Seven metric computations,
/// one `EvaluationRun` row written per call — see `EvaluationRun`'s
/// Prisma doc comment for why this stayed a single generic table.
///
/// Two metrics (RESPONSE_QUALITY, HALLUCINATION_RATE) are **AI-judge**
/// metrics: they resolve a real AI provider (same
/// `AiProviderRegistryService`/`collectStreamedCompletion` pair
/// `McpToolRegistryService.askAi` uses) and ask it to score the given
/// text, parsing a `{score: 0..1, reasoning}` JSON response — an LLM
/// grading another LLM's output, the standard "LLM-as-judge" evaluation
/// pattern, not a hand-rolled heuristic. The other five are pure
/// aggregations over data this platform already generates as a side
/// effect of normal use (MCP tool calls, prompt test runs, workflow
/// runs, agent runs) — no synthetic test data is invented.
@Injectable()
export class AiEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: EvaluationRepository,
    private readonly aiProviderRegistry: AiProviderRegistryService,
  ) {}

  async run(params: { workspaceId: string; userId: string; data: RunEvaluationRequestDto }): Promise<EvaluationRunDto> {
    const { workspaceId, userId, data } = params;
    switch (data.metricType) {
      case 'RESPONSE_QUALITY':
        return this.judge(workspaceId, userId, data, {
          instruction:
            'You are grading the QUALITY of an AI response to a prompt: how relevant, correct, complete, and well-written it is. Score from 0 (unusable) to 1 (excellent).',
          textLabel: 'prompt',
          text: this.requireInputString(data, 'prompt'),
          responseLabel: 'response',
          response: this.requireInputString(data, 'response'),
        });
      case 'HALLUCINATION_RATE':
        return this.judge(workspaceId, userId, data, {
          instruction:
            'You are grading HALLUCINATION in an AI response: does it assert facts not supported by (or contradicting) the given context? Score from 0 (fully grounded, no hallucination) to 1 (severely hallucinated).',
          textLabel: 'context',
          text: typeof data.input?.context === 'string' ? data.input.context : '(no grounding context provided)',
          responseLabel: 'response',
          response: this.requireInputString(data, 'response'),
        });
      case 'TOOL_SUCCESS_RATE':
        return this.toolSuccessRate(workspaceId, userId, data);
      case 'WORKFLOW_SUCCESS':
        return this.workflowSuccess(workspaceId, userId, data);
      case 'EXECUTION_TIME':
        return this.executionTime(workspaceId, userId, data);
      case 'PROMPT_EFFECTIVENESS':
        return this.promptEffectiveness(workspaceId, userId, data);
      case 'PROVIDER_COMPARISON':
        return this.providerComparison(workspaceId, userId, data);
      default:
        throw new AppException('EVALUATION_METRIC_NOT_SUPPORTED', `Unknown metric type "${String(data.metricType)}".`, HttpStatus.BAD_REQUEST);
    }
  }

  async list(params: { workspaceId: string; metricType?: EvaluationRunDto['metricType']; subjectType?: EvaluationRunDto['subjectType']; subjectId?: string; limit?: number }): Promise<EvaluationRunDto[]> {
    const rows = await this.repository.listRuns({
      workspaceId: params.workspaceId,
      metricType: params.metricType,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      limit: params.limit ?? 50,
    });
    return rows.map(toEvaluationRunDto);
  }

  async summary(workspaceId: string) {
    return this.repository.summarize(workspaceId);
  }

  // --- AI-judge metrics -----------------------------------------------

  private async judge(
    workspaceId: string,
    userId: string,
    data: RunEvaluationRequestDto,
    judge: { instruction: string; textLabel: string; text: string; responseLabel: string; response: string },
  ): Promise<EvaluationRunDto> {
    const { provider, credential } = await this.aiProviderRegistry.resolveProvider(
      workspaceId,
      data.provider as AiProviderName | undefined,
    );
    const raw = await collectStreamedCompletion(
      provider,
      {
        model: data.model ?? provider.getDefaultModel(credential),
        messages: [
          {
            role: 'system',
            content: `${judge.instruction} Respond with ONLY a JSON object: {"score": <number 0-1>, "reasoning": "<one sentence>"}.`,
          },
          { role: 'user', content: `${judge.textLabel}:\n${judge.text}\n\n${judge.responseLabel}:\n${judge.response}` },
        ],
        maxTokens: 256,
      },
      credential,
    );
    const { score, reasoning } = this.parseJudgeOutput(raw);

    const row = await this.repository.createRun({
      workspaceId,
      metricType: data.metricType,
      subjectType: data.subjectType,
      subjectId: data.subjectId ?? null,
      provider: provider.name,
      model: data.model ?? provider.getDefaultModel(credential),
      score,
      result: { reasoning, rawResponse: raw.slice(0, 2000) },
      createdBy: userId,
    });
    return toEvaluationRunDto(row);
  }

  private parseJudgeOutput(raw: string): { score: number | null; reasoning: string | null } {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { score: null, reasoning: null };
    try {
      const parsed = JSON.parse(match[0]) as { score?: unknown; reasoning?: unknown };
      const score = typeof parsed.score === 'number' && Number.isFinite(parsed.score) ? Math.max(0, Math.min(1, parsed.score)) : null;
      const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : null;
      return { score, reasoning };
    } catch {
      return { score: null, reasoning: null };
    }
  }

  // --- Aggregation metrics ----------------------------------------------

  private async toolSuccessRate(workspaceId: string, userId: string, data: RunEvaluationRequestDto): Promise<EvaluationRunDto> {
    const toolName = data.subjectId ?? this.requireInputString(data, 'toolName');
    const sinceDays = typeof data.input?.sinceDays === 'number' ? data.input.sinceDays : 30;
    const stats = await this.repository.toolInvocationStats(workspaceId, toolName, sinceDays);
    const score = stats.totalCalls > 0 ? stats.successCount / stats.totalCalls : null;
    const row = await this.repository.createRun({
      workspaceId,
      metricType: 'TOOL_SUCCESS_RATE',
      subjectType: 'MCP_TOOL',
      subjectId: toolName,
      provider: null,
      model: null,
      score,
      result: { ...stats, sinceDays },
      createdBy: userId,
    });
    return toEvaluationRunDto(row);
  }

  private async workflowSuccess(workspaceId: string, userId: string, data: RunEvaluationRequestDto): Promise<EvaluationRunDto> {
    const workflowId = data.subjectId;
    if (!workflowId) {
      throw new AppException('MCP_TOOL_ARGUMENT_INVALID', 'WORKFLOW_SUCCESS requires "subjectId" (a workflowId).', HttpStatus.BAD_REQUEST);
    }
    const runs = await this.prisma.workflowRun.findMany({
      where: { workflowId },
      select: { status: true },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });
    const total = runs.length;
    const succeeded = runs.filter((r) => r.status === 'SUCCEEDED').length;
    const score = total > 0 ? succeeded / total : null;
    const row = await this.repository.createRun({
      workspaceId,
      metricType: 'WORKFLOW_SUCCESS',
      subjectType: 'WORKFLOW',
      subjectId: workflowId,
      provider: null,
      model: null,
      score,
      result: { totalRuns: total, succeeded, failed: runs.filter((r) => r.status === 'FAILED').length },
      createdBy: userId,
    });
    return toEvaluationRunDto(row);
  }

  private async executionTime(workspaceId: string, userId: string, data: RunEvaluationRequestDto): Promise<EvaluationRunDto> {
    const subjectId = data.subjectId;
    let avgDurationMs: number | null = null;
    let sampleCount = 0;

    if (data.subjectType === 'MCP_TOOL' && subjectId) {
      const sinceDays = typeof data.input?.sinceDays === 'number' ? data.input.sinceDays : 30;
      const stats = await this.repository.toolInvocationStats(workspaceId, subjectId, sinceDays);
      avgDurationMs = stats.avgDurationMs;
      sampleCount = stats.totalCalls;
    } else if (data.subjectType === 'PROMPT' && subjectId) {
      const stats = await this.repository.promptEffectivenessStats(subjectId);
      avgDurationMs = stats.avgDurationMs;
      sampleCount = stats.sampleCount;
    } else if (data.subjectType === 'AGENT' && subjectId) {
      const stats = await this.repository.agentRunDurationStats(subjectId);
      avgDurationMs = stats.avgDurationMs;
      sampleCount = stats.sampleCount;
    } else if (data.subjectType === 'WORKFLOW' && subjectId) {
      const runs = await this.prisma.workflowRun.findMany({
        where: { workflowId: subjectId, startedAt: { not: null }, finishedAt: { not: null } },
        select: { startedAt: true, finishedAt: true },
        take: 500,
        orderBy: { createdAt: 'desc' },
      });
      sampleCount = runs.length;
      if (runs.length > 0) {
        const totalMs = runs.reduce((sum, r) => sum + (r.finishedAt!.getTime() - r.startedAt!.getTime()), 0);
        avgDurationMs = totalMs / runs.length;
      }
    } else {
      throw new AppException(
        'EVALUATION_METRIC_NOT_SUPPORTED',
        'EXECUTION_TIME requires subjectId + subjectType one of MCP_TOOL/PROMPT/AGENT/WORKFLOW.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Normalized to a 0-1 "speed score" isn't meaningful across such
    // different subject types (a 50ms MCP tool call and a 5-minute
    // workflow run aren't comparable) — `score` is left null here and
    // the real number lives in `result.avgDurationMs`, matching
    // `EvaluationRunDto.score`'s documented nullability.
    const row = await this.repository.createRun({
      workspaceId,
      metricType: 'EXECUTION_TIME',
      subjectType: data.subjectType,
      subjectId: subjectId ?? null,
      provider: null,
      model: null,
      score: null,
      result: { avgDurationMs, sampleCount },
      createdBy: userId,
    });
    return toEvaluationRunDto(row);
  }

  private async promptEffectiveness(workspaceId: string, userId: string, data: RunEvaluationRequestDto): Promise<EvaluationRunDto> {
    const promptTemplateId = data.subjectId;
    if (!promptTemplateId) {
      throw new AppException('MCP_TOOL_ARGUMENT_INVALID', 'PROMPT_EFFECTIVENESS requires "subjectId" (a promptTemplateId).', HttpStatus.BAD_REQUEST);
    }
    const stats = await this.repository.promptEffectivenessStats(promptTemplateId);
    // ratingScore is stored 1-5 (see PromptTestRun's Prisma column) —
    // normalized to 0-1 to keep `score` comparable across every metric.
    const score = stats.avgRating !== null ? Math.max(0, Math.min(1, (stats.avgRating - 1) / 4)) : null;
    const row = await this.repository.createRun({
      workspaceId,
      metricType: 'PROMPT_EFFECTIVENESS',
      subjectType: 'PROMPT',
      subjectId: promptTemplateId,
      provider: null,
      model: null,
      score,
      result: { ...stats },
      createdBy: userId,
    });
    return toEvaluationRunDto(row);
  }

  private async providerComparison(workspaceId: string, userId: string, data: RunEvaluationRequestDto): Promise<EvaluationRunDto> {
    const providerName = data.subjectId ?? data.provider;
    if (!providerName) {
      throw new AppException('MCP_TOOL_ARGUMENT_INVALID', 'PROVIDER_COMPARISON requires "subjectId" or "provider".', HttpStatus.BAD_REQUEST);
    }
    // Meta-aggregation over this workspace's own RESPONSE_QUALITY
    // EvaluationRuns tagged with this provider — a closed loop over data
    // this same service already produces, rather than inventing a
    // separate benchmark harness.
    const priorRuns = await this.repository.listRuns({
      workspaceId,
      metricType: 'RESPONSE_QUALITY',
      limit: 500,
    });
    const forProvider = priorRuns.filter((r) => r.provider === providerName && r.score !== null);
    const score = forProvider.length > 0 ? forProvider.reduce((sum, r) => sum + (r.score ?? 0), 0) / forProvider.length : null;
    const row = await this.repository.createRun({
      workspaceId,
      metricType: 'PROVIDER_COMPARISON',
      subjectType: 'PROVIDER',
      subjectId: providerName,
      provider: providerName,
      model: null,
      score,
      result: { sampleCount: forProvider.length, basedOn: 'RESPONSE_QUALITY runs for this provider' },
      createdBy: userId,
    });
    return toEvaluationRunDto(row);
  }

  private requireInputString(data: RunEvaluationRequestDto, key: string): string {
    const value = data.input?.[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new AppException('MCP_TOOL_ARGUMENT_INVALID', `input.${key} is required and must be a non-empty string.`, HttpStatus.BAD_REQUEST);
    }
    return value;
  }
}
