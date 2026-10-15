// Module 13 — MCP Client (task #277). A minimal, dependency-free JSON-RPC
// 2.0 client for the Model Context Protocol — works against **any**
// MCP-compatible server, not just Secora's own (`McpModule`,
// apps/api/src/modules/mcp). This is the piece that makes the spec's
// "Allow Secora to communicate with any MCP-compatible AI
// application" line literal: the CLI's `mcp` command group and (per the
// Desktop Agent integration notes in docs/mcp/mcp-guide.md) a future
// Rust port of this same protocol both build on this class.
//
// Deliberately transport-minimal: only the HTTP+JSON-RPC transport is
// implemented (a plain `fetch` POST per call) — no stdio transport here,
// since Node's `child_process` stdio piping is a different enough shape
// that a CLI-specific wrapper (not this browser/Node-portable class)
// is the right place for it. See the CLI Guide's `mcp` command
// documentation for how `pentesthub mcp connect --stdio <command>` layers
// stdio framing on top of the same `McpRpcRequest`/`McpRpcResult` shapes
// this file defines.

export interface McpRpcRequest {
  method: string;
  params?: Record<string, unknown>;
}

export interface McpRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface McpClientOptions {
  /// The server's JSON-RPC endpoint, e.g.
  /// `https://api.pentesthub.ai/mcp/rpc` for Secora's own server.
  endpoint: string;
  /// Sent as `X-API-Key` if provided (Secora's own server requires
  /// this; a third-party MCP server's auth requirements vary — this
  /// client also accepts arbitrary extra headers via `headers`).
  apiKey?: string;
  headers?: Record<string, string>;
  clientName?: string;
  clientVersion?: string;
  fetchImpl?: typeof fetch;
}

export interface McpResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: { type: string; text: string }[];
  isError: boolean;
}

let requestCounter = 0;

/// Thrown for a JSON-RPC-level error response (`response.error` set) —
/// distinct from a network/HTTP failure, which throws whatever the
/// underlying `fetch` rejection was.
export class McpRpcCallError extends Error {
  constructor(public readonly rpcError: McpRpcError) {
    super(rpcError.message);
  }
}

export class McpClient {
  private sessionId: string | null = null;
  private protocolVersion: string | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: McpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get isInitialized(): boolean {
    return this.sessionId !== null;
  }

  /// Version Negotiation + Session Management (spec sections) — must be
  /// called before any other method. `protocolVersion` here is this
  /// client's own supported-version list; the server picks (or falls
  /// back to its own default, surfaced in the return value) — see
  /// `McpRpcDispatcherService.initialize` server-side for the mirror of
  /// this same negotiation.
  async initialize(protocolVersion = '2025-06-18'): Promise<{ sessionId: string; protocolVersion: string }> {
    const result = await this.call<{ sessionId: string; protocolVersion: string }>('initialize', {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: this.options.clientName ?? 'pentesthub-mcp-client', version: this.options.clientVersion },
    });
    this.sessionId = result.sessionId;
    this.protocolVersion = result.protocolVersion;
    return result;
  }

  async listResources(): Promise<McpResourceDescriptor[]> {
    const result = await this.call<{ resources: McpResourceDescriptor[] }>('resources/list', this.withSession());
    return result.resources;
  }

  async readResource(uri: string): Promise<unknown> {
    const result = await this.call<{ contents: { uri: string; text?: string }[] }>(
      'resources/read',
      this.withSession({ uri }),
    );
    const text = result.contents[0]?.text;
    return text ? JSON.parse(text) : null;
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    const result = await this.call<{ tools: McpToolDescriptor[] }>('tools/list', this.withSession());
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolCallResult> {
    return this.call<McpToolCallResult>('tools/call', this.withSession({ name, arguments: args }));
  }

  async listPrompts(): Promise<{ name: string; description?: string }[]> {
    const result = await this.call<{ prompts: { name: string; description?: string }[] }>(
      'prompts/list',
      this.withSession(),
    );
    return result.prompts;
  }

  async getPrompt(name: string, args: Record<string, string> = {}): Promise<{ messages: { role: string; content: { text: string } }[] }> {
    return this.call('prompts/get', this.withSession({ name, arguments: args }));
  }

  private withSession(params: Record<string, unknown> = {}): Record<string, unknown> {
    return { ...params, sessionId: this.sessionId };
  }

  private async call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    requestCounter += 1;
    const id = requestCounter;
    const response = await this.fetchImpl(this.options.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.options.apiKey ? { 'X-API-Key': this.options.apiKey } : {}),
        ...this.options.headers,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params } satisfies McpRpcRequest & { jsonrpc: '2.0'; id: number }),
    });
    if (!response.ok) {
      throw new Error(`MCP server responded ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { result?: T; error?: McpRpcError };
    if (body.error) throw new McpRpcCallError(body.error);
    return body.result as T;
  }
}
