# MCP Guide — Secora AI's Model Context Protocol Server & Client

Secora AI implements the [Model Context Protocol](https://modelcontextprotocol.io)
(protocol version `2025-06-18`) as its extensibility substrate: any
MCP-compatible AI application can list and call this platform's tools,
read its resources, and pull its prompt library — and Secora can
itself act as an MCP client against any other compliant server. See
`docs/adr/0013-ai-automation-platform-mcp-ecosystem.md` for the design
rationale and `docs/modules/13-ai-automation-platform-mcp-ecosystem.md`
for the full implementation map.

## Server

One endpoint: `POST /mcp/rpc`, JSON-RPC 2.0. Every request must carry a
bearer API key (`Authorization: Bearer <key>`); the key's granted scopes
(`tools`, `resources`, `prompts`) gate which method groups it may call.
Supported methods:

| Method | Purpose |
| --- | --- |
| `initialize` | Negotiate protocol version, open an `McpSession`. |
| `tools/list` | List available tools (see Tools below). |
| `tools/call` | Invoke a tool by name with JSON arguments. |
| `resources/list` | List available resource types for the caller's workspace. |
| `resources/read` | Read a resource by `pentesthub://<workspace>/<type>/<id>` URI. |
| `prompts/list` | List prompts from the workspace's Prompt Registry (Module 11). |
| `prompts/get` | Fetch one prompt's full text by name. |

## Tools

Every tool call dispatches an existing `CommandBus`/`QueryBus` handler —
there is no parallel business logic behind the MCP surface. Current
catalog (`MCP_TOOL_NAMES` in `@pentesthub/shared`):

`create_project`, `create_target`, `run_recon`, `launch_scan`,
`generate_report`, `create_note`, `search_knowledge`, `ask_ai`,
`generate_payload`, `create_workflow`, `manage_findings`, `export_report`,
`upload_evidence`, `desktop_agent_command`, `browser_extension_command`.

`desktop_agent_command`/`browser_extension_command` route through the
Local Execution relay queue (`RelayCommand`) rather than calling anything
directly — the target device polls for and executes the command itself.

## Resources

Thirteen read-only resource types, each a projection over data another
module already owns: `projects`, `targets`, `findings`, `evidence`,
`reports`, `notes`, `knowledge-base`, `recon-results`, `scanner-results`,
`activity`, `workspace-settings`, `ai-memory`, `rag-documents`. URIs are
of the form `pentesthub://<workspaceId>/<type>/<id>` (list form omits the
id). Resources are never written to over MCP — creating or mutating data
always goes through a tool call instead.

## Prompts

Every workspace `PromptTemplate` (Module 11) is exposed read-only, named
with the `pentesthub:` prefix (`MCP_PROMPT_NAME_PREFIX`) so it can't
collide with another MCP server's own prompt catalog if a client
aggregates multiple servers. Creating/editing prompts stays on the
`/ai/prompt-templates` REST surface.

## Client

`@pentesthub/sdk` exports `McpClient` (`packages/sdk-typescript/src/mcp-client.ts`)
— a dependency-free JSON-RPC 2.0 client for calling **any** MCP-compatible
server, Secora's own or a third party's:

```ts
import { McpClient } from '@pentesthub/sdk';

const client = new McpClient({ baseUrl: 'https://api.example.com/mcp/rpc', apiKey: '...' });
const { tools } = await client.listTools();
const result = await client.callTool('run_recon', { targetId: 't_123' });
```

Only the HTTP+JSON-RPC transport is implemented; there is no stdio
transport in the portable SDK class (see ADR 0013 §2 for why). The CLI's
`pentesthub mcp` command group is the first consumer built on top of it —
see `packages/cli/README.md`.

## Authoring a custom agent or script against MCP

A `CUSTOM`-kind Agent SDK definition, or a Script Engine `ScriptDefinition`,
reaches the platform only through a capability-gated `pentesthub` global
inside its `node:vm` sandbox — for example `pentesthub.ai.ask(question)`,
present only when the run was granted the matching permission (e.g.
`ai:invoke`). There is no ambient network, filesystem, or `require()`
access. See `docs/modules/13-ai-automation-platform-mcp-ecosystem.md`
§§8-9, 13 for the full Agent SDK / Script Engine model.

## Known limitations

- No stdio MCP transport (HTTP+JSON-RPC only).
- PYTHON scripts are always rejected (`SCRIPT_LANGUAGE_NOT_EXECUTABLE`) —
  no Python sandbox exists yet.
- `apps/api`'s MCP implementation has not been exercised against a real
  external MCP client in this development environment — see the
  Verification section of ADR 0013 for the sandbox constraints that
  applied to this module.
