# @pentesthub/cli

Official command-line interface for Secora AI's Module 13 automation platform — MCP tools, Agent SDK runs, Script Engine, and the AI automation usage dashboard, all over the same REST API the web app and SDKs use.

## Install

```bash
pnpm add -g @pentesthub/cli
# or, inside this monorepo:
pnpm --filter @pentesthub/cli build
node packages/cli/dist/bin/pentesthub.js --help
```

## Authenticate

```bash
pentesthub login                       # interactive email/password
pentesthub login --api-key <key>       # non-interactive (recommended for CI)
# or set PENTESTHUB_API_KEY / PENTESTHUB_BASE_URL env vars — no config file needed
```

Credentials are stored at `~/.pentesthub/config.json` (mode `0600`). This is plain JSON, not an OS keychain — see the disclosed limitation in `src/config.ts`'s doc comment. Password entry via `pentesthub login` is not masked; use `--api-key` if that matters for your terminal.

## Commands

```
pentesthub mcp tools                              List available MCP tools
pentesthub mcp catalog                             Full catalog (tools + resources + prompts), JSON
pentesthub mcp call <tool> [--args '{"k":"v"}']    Invoke a tool for real (not a dry-run)

pentesthub agents list                             List Agent SDK definitions
pentesthub agents run <id> [--input '{"k":"v"}']   Start a run and print the result
pentesthub agents get-run <runId>                  Fetch a run's current state

pentesthub scripts list                            List saved scripts
pentesthub scripts run <id> [--input '{"k":"v"}']  Run a script and print the result

pentesthub observability dashboard [--since-days <n>]   AI automation platform usage dashboard
```

## Known limitations

- `mcp *` commands go through the Developer Portal's REST catalog/try-it-out endpoints, not a persistent MCP JSON-RPC session — there's no `initialize`d session to hold open between one-off CLI invocations. A `pentesthub mcp serve` stdio-transport bridge for real MCP clients is a natural future addition, not built in this pass.
- `pentesthub login` does not support MFA-enabled accounts — use `--api-key` instead.
- No shell-completion scripts yet.
