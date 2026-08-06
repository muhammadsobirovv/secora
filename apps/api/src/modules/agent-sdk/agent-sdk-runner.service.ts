import { HttpStatus, Injectable } from '@nestjs/common';
import { AgentRuntime } from '@pentesthub/agent-sdk';
import { BUILTIN_AGENTS } from '@pentesthub/agent-sdk';
import type { AgentSdkRunDto, BuiltinAgentSlug } from '@pentesthub/shared';
import { SCRIPT_PERMISSIONS, type ScriptPermission } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { McpToolRegistryService } from '../mcp/mcp-tool-registry.service.js';
import { McpResourceRegistryService } from '../mcp/mcp-resource-registry.service.js';
import { ScriptEngineService } from '../scripts/script-engine.service.js';
import { MetricsRegistryService } from '../observability/metrics-registry.service.js';
import { AgentSdkRepository, type AgentSdkDefinitionRow, type AgentSdkRunRow } from './agent-sdk.repository.js';
import { LocalMcpContextAdapter } from './local-mcp-context.adapter.js';

function toDto(row: AgentSdkRunRow): AgentSdkRunDto {
  return {
    id: row.id,
    agentSdkDefinitionId: row.agentSdkDefinitionId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    status: row.status,
    input: row.inputJson,
    output: row.outputJson,
    events: (row.eventsJson as AgentSdkRunDto['events']) ?? [],
    errorMessage: row.errorMessage,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/// Module 13 — AI Agent SDK runner (task #281). v1 executes runs
/// synchronously (the HTTP request awaits completion, same posture as
/// `RunPromptTestCommand`) rather than queuing them onto a background
/// poller — `BUILTIN` agents (a handful of AI calls, seconds not
/// minutes) don't need it; a `CUSTOM` agent's `sourceCode` runs through
/// `ScriptEngineService`'s sandbox (task #286) with the same synchronous
/// posture (and the same real wall-clock timeout that service provides),
/// so this remains true for both kinds.
@Injectable()
export class AgentSdkRunnerService {
  private readonly runtime = new AgentRuntime();

  constructor(
    private readonly repository: AgentSdkRepository,
    private readonly toolRegistry: McpToolRegistryService,
    private readonly resourceRegistry: McpResourceRegistryService,
    private readonly scriptEngine: ScriptEngineService,
    private readonly metrics: MetricsRegistryService,
  ) {}

  async startRun(params: {
    workspaceId: string;
    userId: string;
    agentSdkDefinitionId: string;
    projectId?: string;
    input?: Record<string, unknown>;
  }): Promise<AgentSdkRunDto> {
    const definition = await this.repository.findDefinitionById(params.agentSdkDefinitionId);
    if (!definition || (definition.workspaceId !== null && definition.workspaceId !== params.workspaceId)) {
      throw new AppException('AGENT_SDK_DEFINITION_NOT_FOUND', 'Agent definition not found.', HttpStatus.NOT_FOUND);
    }

    if (definition.kind === 'CUSTOM') {
      return this.runCustom(definition, params);
    }

    const agent = BUILTIN_AGENTS[definition.slug as BuiltinAgentSlug];
    if (!agent) {
      throw new AppException('AGENT_SDK_DEFINITION_NOT_FOUND', `No built-in implementation for "${definition.slug}".`, HttpStatus.NOT_FOUND);
    }

    const runRow = await this.repository.createRun({
      agentSdkDefinitionId: definition.id,
      workspaceId: params.workspaceId,
      projectId: params.projectId ?? null,
      input: params.input ?? null,
      createdBy: params.userId,
    });

    const startedAt = new Date();
    const backend = new LocalMcpContextAdapter(this.toolRegistry, this.resourceRegistry, params.userId);
    const outcome = await this.runtime.run(agent, {
      agentSlug: definition.slug,
      workspaceId: params.workspaceId,
      projectId: params.projectId ?? null,
      input: params.input ?? null,
      backend,
    });

    const status = outcome.errorMessage ? 'FAILED' : 'SUCCEEDED';
    await this.repository.finishRun({
      id: runRow.id,
      status,
      output: outcome.output,
      events: outcome.events,
      errorMessage: outcome.errorMessage,
      startedAt,
    });
    this.metrics.agentSdkRunsTotal.inc({ kind: 'BUILTIN', status });

    const finished = await this.repository.findRunById(runRow.id);
    return toDto(finished!);
  }

  /// `CUSTOM` agent execution (task #286 close-out). A `CUSTOM`
  /// definition's `sourceCode` runs through `ScriptEngineService` exactly
  /// like a workspace member's own saved script — `main(input)` — with
  /// `definition.permissions` intersected against `SCRIPT_PERMISSIONS`
  /// (Agent SDK registration accepts free-form permission strings; only
  /// the subset that are also real script permissions get wired into the
  /// sandbox's `pentesthub.*` API, everything else is silently ignored
  /// rather than rejected — registration already happened, this is only
  /// about what capabilities a run actually gets). Always treated as
  /// JAVASCRIPT: `AgentSdkManifest` has no `language` field the way
  /// `ScriptDefinition` does, so there's nothing to select TypeScript/
  /// Python from.
  private async runCustom(
    definition: AgentSdkDefinitionRow,
    params: { workspaceId: string; userId: string; projectId?: string; input?: Record<string, unknown> },
  ): Promise<AgentSdkRunDto> {
    if (!definition.sourceCode) {
      throw new AppException(
        'AGENT_SDK_CUSTOM_EXECUTION_NOT_SUPPORTED',
        'This CUSTOM agent has no sourceCode registered.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const runRow = await this.repository.createRun({
      agentSdkDefinitionId: definition.id,
      workspaceId: params.workspaceId,
      projectId: params.projectId ?? null,
      input: params.input ?? null,
      createdBy: params.userId,
    });

    const startedAt = new Date();
    const scriptPermissions = definition.permissions.filter((permission): permission is ScriptPermission =>
      (SCRIPT_PERMISSIONS as readonly string[]).includes(permission),
    );

    let outputRecord: Record<string, unknown> | null = null;
    let errorMessage: string | null = null;
    try {
      const result = await this.scriptEngine.run({
        language: 'JAVASCRIPT',
        sourceCode: definition.sourceCode,
        permissions: scriptPermissions,
        workspaceId: params.workspaceId,
        userId: params.userId,
        input: params.input ?? {},
      });
      outputRecord =
        result.output && typeof result.output === 'object' && !Array.isArray(result.output)
          ? (result.output as Record<string, unknown>)
          : { result: result.output, logs: result.logs };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    const status = errorMessage ? 'FAILED' : 'SUCCEEDED';
    await this.repository.finishRun({
      id: runRow.id,
      status,
      output: outputRecord,
      events: [],
      errorMessage,
      startedAt,
    });
    this.metrics.agentSdkRunsTotal.inc({ kind: 'CUSTOM', status });

    const finished = await this.repository.findRunById(runRow.id);
    return toDto(finished!);
  }

  async getRun(id: string): Promise<AgentSdkRunDto | null> {
    const row = await this.repository.findRunById(id);
    return row ? toDto(row) : null;
  }

  async listRuns(params: { workspaceId: string; agentSdkDefinitionId?: string; status?: AgentSdkRunDto['status']; limit?: number }): Promise<AgentSdkRunDto[]> {
    const rows = await this.repository.listRuns({
      workspaceId: params.workspaceId,
      agentSdkDefinitionId: params.agentSdkDefinitionId,
      status: params.status,
      limit: params.limit ?? 50,
    });
    return rows.map(toDto);
  }
}
