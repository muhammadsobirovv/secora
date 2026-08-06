import { describe, expect, it, jest } from '@jest/globals';
import { AiPlatformObservabilityRepository } from './ai-platform-observability.repository.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

/// Module 13 — Observability dashboard tests (task #295). `PrismaService`
/// is stubbed directly (a plain object with `jest.fn()` methods) rather
/// than bootstrapped via `@nestjs/testing` — `AiPlatformObservabilityRepository`'s
/// constructor only stores the reference, and every query method is a
/// thin wrapper this test exercises for its *transformation* logic
/// (bigint -> number coercion, empty-row defaults, row -> DTO shaping)
/// rather than the SQL itself, which no sandbox here can run against a
/// real Postgres anyway. `$queryRaw` is invoked as a tagged template in
/// the repository (`` this.prisma.$queryRaw<T>`SELECT ...` ``) — mocking
/// it as a plain `jest.fn().mockResolvedValueOnce(rows)` works regardless
/// of the template's contents, since the mock never inspects its args.

function buildPrisma(overrides: { queryRawResults?: unknown[][]; workflowRuns?: unknown[] } = {}) {
  const queryRawResults = overrides.queryRawResults ?? [];
  let callIndex = 0;
  const queryRaw = jest.fn(async () => queryRawResults[callIndex++] ?? []);
  return {
    $queryRaw: queryRaw,
    workflowRun: {
      findMany: jest.fn(async () => overrides.workflowRuns ?? []),
    },
  } as unknown as PrismaService;
}

describe('AiPlatformObservabilityRepository', () => {
  describe('mcpToolUsage', () => {
    it('coerces bigint call/error counts to numbers and preserves order', async () => {
      const prisma = buildPrisma({
        queryRawResults: [
          [
            { toolName: 'create_project', callCount: 10n, errorCount: 1n, avgDurationMs: 42.5 },
            { toolName: 'run_recon', callCount: 3n, errorCount: 0n, avgDurationMs: null },
          ],
        ],
      });
      const repo = new AiPlatformObservabilityRepository(prisma);
      const result = await repo.mcpToolUsage('ws-1', 7);
      expect(result).toEqual([
        { toolName: 'create_project', callCount: 10, errorCount: 1, avgDurationMs: 42.5 },
        { toolName: 'run_recon', callCount: 3, errorCount: 0, avgDurationMs: null },
      ]);
    });

    it('returns an empty array when there is no activity', async () => {
      const prisma = buildPrisma({ queryRawResults: [[]] });
      const repo = new AiPlatformObservabilityRepository(prisma);
      expect(await repo.mcpToolUsage('ws-1', 7)).toEqual([]);
    });
  });

  describe('agentSdkRunsSummary', () => {
    it('defaults every field to zero/null when the query returns no row', async () => {
      const prisma = buildPrisma({ queryRawResults: [[]] });
      const repo = new AiPlatformObservabilityRepository(prisma);
      const result = await repo.agentSdkRunsSummary('ws-1', 7);
      expect(result).toEqual({ totalRuns: 0, succeeded: 0, failed: 0, running: 0, avgDurationMs: null });
    });

    it('coerces the aggregate row bigints to numbers', async () => {
      const prisma = buildPrisma({
        queryRawResults: [[{ totalRuns: 12n, succeeded: 9n, failed: 2n, running: 1n, avgDurationMs: 1500.25 }]],
      });
      const repo = new AiPlatformObservabilityRepository(prisma);
      const result = await repo.agentSdkRunsSummary('ws-1', 7);
      expect(result).toEqual({ totalRuns: 12, succeeded: 9, failed: 2, running: 1, avgDurationMs: 1500.25 });
    });
  });

  describe('scriptExecutionsSummary', () => {
    it('coerces the aggregate row bigints to numbers, including timedOut', async () => {
      const prisma = buildPrisma({
        queryRawResults: [[{ totalExecutions: 5n, succeeded: 3n, failed: 1n, timedOut: 1n, avgDurationMs: 250 }]],
      });
      const repo = new AiPlatformObservabilityRepository(prisma);
      const result = await repo.scriptExecutionsSummary('ws-1', 7);
      expect(result).toEqual({ totalExecutions: 5, succeeded: 3, failed: 1, timedOut: 1, avgDurationMs: 250 });
    });
  });

  describe('workflowRunsSummary', () => {
    it('aggregates raw WorkflowRun rows by status and computes average duration only over finished runs', async () => {
      const now = Date.now();
      const prisma = buildPrisma({
        workflowRuns: [
          { status: 'SUCCEEDED', startedAt: new Date(now), finishedAt: new Date(now + 1000) },
          { status: 'SUCCEEDED', startedAt: new Date(now), finishedAt: new Date(now + 3000) },
          { status: 'FAILED', startedAt: new Date(now), finishedAt: new Date(now + 500) },
          { status: 'RUNNING', startedAt: new Date(now), finishedAt: null },
          { status: 'PENDING', startedAt: null, finishedAt: null },
        ],
      });
      const repo = new AiPlatformObservabilityRepository(prisma);
      const result = await repo.workflowRunsSummary('ws-1', 7);
      expect(result).toEqual({
        totalRuns: 5,
        succeeded: 2,
        failed: 1,
        running: 2, // RUNNING + PENDING both count as "running" (see repository doc comment)
        avgDurationMs: 1500, // average of the 3 finished runs: (1000 + 3000 + 500) / 3
      });
    });

    it('returns zeroed defaults when the workspace has no workflow runs', async () => {
      const prisma = buildPrisma({ workflowRuns: [] });
      const repo = new AiPlatformObservabilityRepository(prisma);
      const result = await repo.workflowRunsSummary('ws-1', 7);
      expect(result).toEqual({ totalRuns: 0, succeeded: 0, failed: 0, running: 0, avgDurationMs: null });
    });
  });

  describe('relayCommandQueueSummary', () => {
    it('coerces per-target status counts to numbers', async () => {
      const prisma = buildPrisma({
        queryRawResults: [
          [
            { target: 'DESKTOP', pending: 2n, delivered: 1n, completed: 5n, failed: 0n },
            { target: 'BROWSER', pending: 0n, delivered: 0n, completed: 1n, failed: 1n },
          ],
        ],
      });
      const repo = new AiPlatformObservabilityRepository(prisma);
      const result = await repo.relayCommandQueueSummary('ws-1');
      expect(result).toEqual([
        { target: 'DESKTOP', pending: 2, delivered: 1, completed: 5, failed: 0 },
        { target: 'BROWSER', pending: 0, delivered: 0, completed: 1, failed: 1 },
      ]);
    });
  });

  describe('evaluationRunsSummary', () => {
    it('coerces sampleCount to a number and preserves averageScore/metricType', async () => {
      const prisma = buildPrisma({
        queryRawResults: [
          [
            { metricType: 'TOOL_SUCCESS_RATE', sampleCount: 4n, averageScore: 0.9 },
            { metricType: 'RESPONSE_QUALITY', sampleCount: 1n, averageScore: null },
          ],
        ],
      });
      const repo = new AiPlatformObservabilityRepository(prisma);
      const result = await repo.evaluationRunsSummary('ws-1', 7);
      expect(result).toEqual([
        { metricType: 'TOOL_SUCCESS_RATE', sampleCount: 4, averageScore: 0.9 },
        { metricType: 'RESPONSE_QUALITY', sampleCount: 1, averageScore: null },
      ]);
    });
  });
});
