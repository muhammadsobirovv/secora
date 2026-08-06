import * as vm from 'node:vm';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildMcpResourceUri, type ScriptLanguage, type ScriptPermission } from '@pentesthub/shared';
import type { McpToolCallResult } from '@pentesthub/sdk';
import type { EnvConfig } from '../../config/env.validation.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { McpToolRegistryService } from '../mcp/mcp-tool-registry.service.js';
import { McpResourceRegistryService } from '../mcp/mcp-resource-registry.service.js';
import { LocalMcpContextAdapter } from '../agent-sdk/local-mcp-context.adapter.js';

export interface ScriptRunParams {
  language: ScriptLanguage;
  sourceCode: string;
  permissions: ScriptPermission[];
  workspaceId: string;
  userId: string;
  input: Record<string, unknown>;
  timeoutMs?: number;
}

export interface ScriptRunResult {
  output: unknown;
  logs: string[];
  durationMs: number;
}

/// Module 13 — Script Engine (task #286). Generalizes
/// `PluginSandboxService`'s `node:vm` sandbox (Module 10) into a
/// workspace-member-facing "run my own script against my own data"
/// capability, rather than forking a second sandbox implementation — see
/// `ScriptDefinition`'s Prisma doc comment. Two real differences from the
/// plugin sandbox this class doesn't share:
///
/// 1. **The `pentesthub.*` API surface is the MCP tool/resource
///    registries**, not a bespoke set of capabilities — every permission
///    a script can request (`SCRIPT_PERMISSIONS` in `@pentesthub/shared`)
///    maps onto an existing MCP tool call or resource read via
///    `LocalMcpContextAdapter` (the exact same adapter the AI Agent SDK's
///    built-in agents use, task #281/#282). This keeps the platform-
///    action surface a script sees in lockstep with what MCP already
///    exposes instead of a third, independently-maintained capability
///    list.
/// 2. **Real wall-clock bounding of async work.** `vm.Script`'s
///    `timeout` option only bounds *synchronous* execution inside the
///    isolate — a script that `await`s an MCP tool call (network I/O)
///    would run past that budget entirely unbounded, which
///    `PluginSandboxService` never had to deal with since its hooks are
///    synchronous. Here, the sandboxed script's top-level body only
///    defines `module.exports.main` (bounded by `vm.Script`'s sync
///    `timeout`); `main(input)` is then invoked as a normal host-side
///    function call (still executing inside the vm context's realm) and
///    its returned Promise is raced against a real `setTimeout` in the
///    host — a genuine wall-clock limit for async scripts.
@Injectable()
export class ScriptEngineService {
  constructor(
    private readonly toolRegistry: McpToolRegistryService,
    private readonly resourceRegistry: McpResourceRegistryService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async run(params: ScriptRunParams): Promise<ScriptRunResult> {
    if (params.language === 'PYTHON') {
      const pythonEnabled = this.configService.get('SCRIPT_ENGINE_PYTHON_ENABLED', { infer: true });
      throw new AppException(
        'SCRIPT_LANGUAGE_NOT_EXECUTABLE',
        pythonEnabled
          ? 'SCRIPT_ENGINE_PYTHON_ENABLED is set, but this deployment still has no Python interpreter integration wired up — the flag is a placeholder for a future subprocess-based executor, not a working toggle yet.'
          : 'Python scripts are stored but not executable in this deployment (no bundled interpreter, and SCRIPT_ENGINE_PYTHON_ENABLED is off) — see the Script Engine section of the Developer Guide.',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    const startedAt = Date.now();
    const logs: string[] = [];
    const backend = new LocalMcpContextAdapter(this.toolRegistry, this.resourceRegistry, params.userId);
    const api = this.buildApi(params.permissions, params.workspaceId, backend, logs);

    const moduleShim = { exports: {} as Record<string, unknown> };
    const context = vm.createContext({
      module: moduleShim,
      exports: moduleShim.exports,
      pentesthub: api,
      console: { log: (...args: unknown[]) => logs.push(args.map((a) => String(a)).join(' ')) },
    });

    const defaultTimeoutMs = this.configService.get('SCRIPT_ENGINE_TIMEOUT_MS', { infer: true });
    const timeoutMs = params.timeoutMs ?? defaultTimeoutMs;
    try {
      const script = new vm.Script(params.sourceCode, { filename: 'script.js' });
      // Bounds only the synchronous top-level body (defining
      // module.exports.main) — see class doc comment point 2.
      script.runInContext(context, { timeout: Math.min(timeoutMs, 5000) });

      const main = moduleShim.exports.main;
      if (typeof main !== 'function') {
        throw new Error('Script must assign a function to `module.exports.main` — e.g. `module.exports.main = async (input) => { ... }`.');
      }

      const runPromise = Promise.resolve().then(() => (main as (input: unknown) => unknown)(params.input));
      const output = await this.withTimeout(runPromise, timeoutMs);
      return { output, logs, durationMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[error] ${message}`);
      throw new Error(`Script execution failed: ${message}`);
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer!: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Script exceeded its ${timeoutMs}ms wall-clock budget.`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
  }

  /// Unwraps an `McpToolCallResult` into a plain value a script can use
  /// directly (`await pentesthub.ai.ask(...)` returns `{ answer }`, not
  /// the MCP content-block envelope) — throws if the tool call itself
  /// failed, so a script's own `try/catch` (or this method's caller) sees
  /// a real error rather than a silently-successful-looking object.
  private unwrapToolResult(result: McpToolCallResult): unknown {
    const text = result.content?.[0]?.text;
    if (result.isError) {
      throw new Error(text ?? 'Tool call failed.');
    }
    if (text === undefined) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private buildApi(
    permissions: ScriptPermission[],
    workspaceId: string,
    backend: LocalMcpContextAdapter,
    logs: string[],
  ): Record<string, unknown> {
    const has = (permission: ScriptPermission) => permissions.includes(permission);
    const unwrap = (p: Promise<McpToolCallResult>) => p.then((r) => this.unwrapToolResult(r));

    const api: Record<string, unknown> = {
      log: (message: unknown) => logs.push(String(message)),
    };

    if (has('projects:read')) {
      api.projects = { list: () => backend.readResource(buildMcpResourceUri(workspaceId, 'projects')) };
    }
    if (has('targets:read')) {
      api.targets = { list: () => backend.readResource(buildMcpResourceUri(workspaceId, 'targets')) };
    }
    if (has('findings:read')) {
      api.findings = {
        ...(api.findings as Record<string, unknown> | undefined),
        list: () => backend.readResource(buildMcpResourceUri(workspaceId, 'findings')),
      };
    }
    if (has('findings:write')) {
      api.findings = {
        ...(api.findings as Record<string, unknown> | undefined),
        update: (findingId: string, data: Record<string, unknown>) => unwrap(backend.callTool('manage_findings', { findingId, data })),
        transitionStage: (findingId: string, data: Record<string, unknown>) =>
          unwrap(backend.callTool('manage_findings', { findingId, action: 'transition_stage', data })),
      };
    }
    if (has('recon:run')) {
      api.recon = {
        run: (targetId: string, options: Record<string, unknown> = {}) =>
          unwrap(backend.callTool('run_recon', { targetId, ...options })),
      };
    }
    if (has('reports:generate')) {
      api.reports = { generate: (args: Record<string, unknown>) => unwrap(backend.callTool('generate_report', args)) };
    }
    if (has('ai:invoke')) {
      api.ai = { ask: (question: string) => unwrap(backend.callTool('ask_ai', { workspaceId, question })) };
    }
    if (has('mcp:resources:read')) {
      api.mcp = { readResource: (uri: string) => backend.readResource(uri) };
    }
    if (has('network:fetch')) {
      api.fetch = async (url: string, options?: Record<string, unknown>) => {
        const response = await fetch(url, options as unknown as RequestInit | undefined);
        const text = await response.text();
        return { status: response.status, ok: response.ok, text };
      };
    }

    return api;
  }
}
