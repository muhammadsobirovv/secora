import type { McpClient, McpToolCallResult } from '@pentesthub/sdk';
import type { AgentSdkLifecycleEvent } from '@pentesthub/shared';

/// Module 13 — AI Agent SDK (task #281). The eight-phase lifecycle the
/// spec names (Initialize/LoadContext/ReceiveTask/CallTools/
/// ReadResources/GenerateResult/PublishEvents/Shutdown) is split across
/// two things: five *methods* a concrete agent implements
/// (`initialize`/`loadContext`/`receiveTask`/`generateResult`/
/// `shutdown` — all but the first and last optional, since a simple
/// agent may need neither), and three *events* (`call_tool`,
/// `read_resource`, `publish_event`) that `AgentRuntime` emits
/// automatically whenever the agent's `ctx.callTool`/`ctx.readResource`/
/// `ctx.publishEvent` helpers are used — an agent author never
/// hand-rolls lifecycle bookkeeping, it falls out of using the context
/// object `AgentRuntime.run` hands it.

export type AgentLifecyclePhase = AgentSdkLifecycleEvent['phase'];

/// Everything a running agent needs, handed to every lifecycle method.
/// `mcp` is a live, already-`initialize()`d `McpClient` — third-party
/// agents get one that talks HTTP to a real Secora MCP server (see
/// the SDK Guide's "Hello Agent" walkthrough); the eleven built-in
/// agents (task #282) get an in-process adapter with the identical
/// `callTool`/`readResource` surface (see apps/api's
/// `local-mcp-context.adapter.ts`) — same contract either way, no
/// agent code branches on which one it got.
export interface AgentLifecycleContext {
  readonly agentSlug: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  /// This run's task instruction + structured input — set once, before
  /// `receiveTask` runs, and read-only from then on.
  readonly input: Record<string, unknown> | null;
  /// Free-form per-definition config (`AgentSdkManifest.configSchema`
  /// validates its shape at registration time, not here).
  readonly config: Record<string, unknown>;
  /// State a `loadContext`/`receiveTask` implementation stashes for
  /// `generateResult` to read back — plain object, no schema, since it
  /// never leaves this one run.
  readonly state: Record<string, unknown>;

  /// Call Tools (lifecycle phase). Delegates to the underlying
  /// `McpClient`/local adapter and always emits a `call_tool` event
  /// first — even if the call itself throws, the event (with
  /// `detail.error`) still records the attempt for `AgentSdkRunDto.events`.
  callTool(name: string, args?: Record<string, unknown>): Promise<McpToolCallResult>;

  /// Read Resources (lifecycle phase). Same emit-then-call shape as
  /// `callTool`.
  readResource(uri: string): Promise<unknown>;

  /// Publish Events (lifecycle phase) — an agent's own domain signal
  /// (e.g. "found 3 subdomains"), independent of the tool/resource
  /// bookkeeping events. Surfaces in `AgentSdkRunDto.events` exactly
  /// like the others so a caller polling a run sees agent-authored
  /// progress, not just plumbing.
  publishEvent(detail: Record<string, unknown>): void;
}

export interface AgentLifecycle {
  readonly slug: string;
  readonly displayName: string;
  readonly description: string;

  /// Initialize — one-time setup (e.g. validate `ctx.config`). Most
  /// agents don't need this; default is a no-op.
  initialize?(ctx: AgentLifecycleContext): Promise<void> | void;

  /// Load Context — read whatever MCP Resources this agent's specialty
  /// needs before it sees the task (e.g. Recon Agent pre-loads the
  /// project's existing `recon-results`). Optional.
  loadContext?(ctx: AgentLifecycleContext): Promise<void> | void;

  /// Receive Task — react to `ctx.input` (e.g. parse it into a more
  /// specific internal shape, stashed on `ctx.state`). Optional; a
  /// simple agent can read `ctx.input` directly inside `generateResult`.
  receiveTask?(ctx: AgentLifecycleContext): Promise<void> | void;

  /// Generate Result — the only required method. Does the agent's
  /// actual work (typically: call `ask_ai`/`generate_payload`/etc via
  /// `ctx.callTool`, or a domain-specific tool like `run_recon`) and
  /// returns the structured output persisted to
  /// `AgentSdkRunDto.output`.
  generateResult(ctx: AgentLifecycleContext): Promise<Record<string, unknown>>;

  /// Shutdown — release anything `initialize` acquired. Runs even if
  /// `generateResult` threw (`finally` semantics), same as Module 11's
  /// `BaseAgent.execute`'s cancellation contract.
  shutdown?(ctx: AgentLifecycleContext): Promise<void> | void;
}

/// The context's `callTool`/`readResource`/`publishEvent` need a real
/// backend — this is that seam. `HttpAgentRuntimeBackend` (below) wraps
/// an `McpClient`; apps/api's `LocalMcpContextAdapter` implements this
/// same interface directly against `McpToolRegistryService`/
/// `McpResourceRegistryService` (no HTTP round-trip to itself).
export interface AgentRuntimeBackend {
  callTool(name: string, args?: Record<string, unknown>): Promise<McpToolCallResult>;
  readResource(uri: string): Promise<unknown>;
}

export class HttpAgentRuntimeBackend implements AgentRuntimeBackend {
  constructor(private readonly mcp: McpClient) {}

  callTool(name: string, args?: Record<string, unknown>): Promise<McpToolCallResult> {
    return this.mcp.callTool(name, args);
  }

  readResource(uri: string): Promise<unknown> {
    return this.mcp.readResource(uri);
  }
}

export interface AgentRunOptions {
  agentSlug: string;
  workspaceId: string;
  projectId?: string | null;
  input?: Record<string, unknown> | null;
  config?: Record<string, unknown>;
  backend: AgentRuntimeBackend;
}

export interface AgentRunOutcome {
  output: Record<string, unknown> | null;
  events: AgentSdkLifecycleEvent[];
  errorMessage: string | null;
}

/// Drives one agent through its full lifecycle, in order, recording
/// every phase transition + every tool/resource/publish call as an
/// `AgentSdkLifecycleEvent` — this array is exactly what
/// `AgentSdkRunDto.events` persists, so a caller polling a run's status
/// sees the same audit trail this function builds live.
export class AgentRuntime {
  async run(agent: AgentLifecycle, options: AgentRunOptions): Promise<AgentRunOutcome> {
    const events: AgentSdkLifecycleEvent[] = [];
    const record = (phase: AgentLifecyclePhase, detail?: Record<string, unknown>) => {
      events.push({ phase, at: new Date().toISOString(), detail });
    };

    const state: Record<string, unknown> = {};
    const ctx: AgentLifecycleContext = {
      agentSlug: options.agentSlug,
      workspaceId: options.workspaceId,
      projectId: options.projectId ?? null,
      input: options.input ?? null,
      config: options.config ?? {},
      state,
      async callTool(name, args) {
        record('call_tool', { name, args: args ?? {} });
        return options.backend.callTool(name, args);
      },
      async readResource(uri) {
        record('read_resource', { uri });
        return options.backend.readResource(uri);
      },
      publishEvent(detail) {
        record('publish_event', detail);
      },
    };

    let output: Record<string, unknown> | null = null;
    let errorMessage: string | null = null;
    try {
      record('initialize');
      await agent.initialize?.(ctx);

      record('load_context');
      await agent.loadContext?.(ctx);

      record('receive_task', { input: options.input ?? null });
      await agent.receiveTask?.(ctx);

      output = await agent.generateResult(ctx);
      record('generate_result', { outputKeys: Object.keys(output) });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      record('shutdown');
      try {
        await agent.shutdown?.(ctx);
      } catch {
        // Shutdown errors don't overwrite a real generateResult failure,
        // and don't fail an otherwise-successful run — same
        // best-effort-cleanup posture as Module 7's ToolRunner teardown.
      }
    }

    return { output, events, errorMessage };
  }
}
