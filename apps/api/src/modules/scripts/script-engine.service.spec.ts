import { describe, expect, it } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { ScriptPermission } from '@pentesthub/shared';
import { ScriptEngineService } from './script-engine.service.js';
import type { McpToolRegistryService } from '../mcp/mcp-tool-registry.service.js';
import type { McpResourceRegistryService } from '../mcp/mcp-resource-registry.service.js';
import type { EnvConfig } from '../../config/env.validation.js';

/// Module 13 — Script Engine tests (task #295). Constructed directly
/// (no `@nestjs/testing` `TestingModule`) — `ScriptEngineService`'s
/// constructor only stores its three dependencies, never calls them
/// eagerly, so plain stand-in objects are enough; this mirrors
/// `plugin-signature.util.spec.ts`'s "exercise the real class/function
/// directly" style rather than bootstrapping a DI container for a unit
/// test. `toolRegistry`/`resourceRegistry` are only reached if a test's
/// script actually calls a `pentesthub.*` API that needs them.

function buildConfigService(overrides: { timeoutMs?: number; pythonEnabled?: boolean } = {}) {
  const values: Record<string, unknown> = {
    SCRIPT_ENGINE_TIMEOUT_MS: overrides.timeoutMs ?? 5_000,
    SCRIPT_ENGINE_PYTHON_ENABLED: overrides.pythonEnabled ?? false,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<EnvConfig, true>;
}

function buildService(options: { timeoutMs?: number; pythonEnabled?: boolean; toolCall?: (name: string, args: Record<string, unknown>) => Promise<unknown> } = {}) {
  const toolRegistry = {
    call: options.toolCall ?? (async () => {
      throw new Error('No tool call expected in this test.');
    }),
  } as unknown as McpToolRegistryService;
  const resourceRegistry = {} as unknown as McpResourceRegistryService;
  const configService = buildConfigService(options);
  return new ScriptEngineService(toolRegistry, resourceRegistry, configService);
}

const NO_PERMISSIONS: ScriptPermission[] = [];

describe('ScriptEngineService', () => {
  it('runs a synchronous script and returns its output', async () => {
    const service = buildService();
    const result = await service.run({
      language: 'JAVASCRIPT',
      sourceCode: 'module.exports.main = (input) => ({ doubled: input.n * 2 });',
      permissions: NO_PERMISSIONS,
      workspaceId: 'ws-1',
      userId: 'user-1',
      input: { n: 21 },
    });
    expect(result.output).toEqual({ doubled: 42 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runs an async script and awaits its resolved value', async () => {
    const service = buildService();
    const result = await service.run({
      language: 'JAVASCRIPT',
      sourceCode: `module.exports.main = async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { echoed: input.value };
      };`,
      permissions: NO_PERMISSIONS,
      workspaceId: 'ws-1',
      userId: 'user-1',
      input: { value: 'hello' },
    });
    expect(result.output).toEqual({ echoed: 'hello' });
  });

  it('captures console.log calls into result.logs', async () => {
    const service = buildService();
    const result = await service.run({
      language: 'JAVASCRIPT',
      sourceCode: `module.exports.main = () => { console.log('hello', 'world'); return null; };`,
      permissions: NO_PERMISSIONS,
      workspaceId: 'ws-1',
      userId: 'user-1',
      input: {},
    });
    expect(result.logs).toEqual(['hello world']);
  });

  it('rejects a script that never assigns module.exports.main', async () => {
    const service = buildService();
    await expect(
      service.run({
        language: 'JAVASCRIPT',
        sourceCode: 'const x = 1;',
        permissions: NO_PERMISSIONS,
        workspaceId: 'ws-1',
        userId: 'user-1',
        input: {},
      }),
    ).rejects.toThrow(/module.exports.main/);
  });

  it('enforces a real wall-clock timeout on async scripts that never resolve', async () => {
    const service = buildService({ timeoutMs: 100 });
    await expect(
      service.run({
        language: 'JAVASCRIPT',
        sourceCode: `module.exports.main = () => new Promise(() => {});`,
        permissions: NO_PERMISSIONS,
        workspaceId: 'ws-1',
        userId: 'user-1',
        input: {},
      }),
    ).rejects.toThrow(/wall-clock budget/);
  }, 2_000);

  it('does not expose pentesthub.ai when ai:invoke was not granted', async () => {
    const service = buildService();
    await expect(
      service.run({
        language: 'JAVASCRIPT',
        sourceCode: `module.exports.main = () => pentesthub.ai.ask('is this reachable?');`,
        permissions: NO_PERMISSIONS,
        workspaceId: 'ws-1',
        userId: 'user-1',
        input: {},
      }),
    ).rejects.toThrow();
  });

  it('exposes pentesthub.ai.ask and routes it through the tool registry when ai:invoke is granted', async () => {
    // Captured outside the mock rather than asserted inside it — a
    // failed `expect()` inside `toolCall` would be swallowed by
    // `LocalMcpContextAdapter.callTool`'s own try/catch (which turns any
    // rejection into a normal `{isError: true}` result) and only surface
    // indirectly as a confusing "Script execution failed" message; this
    // way a mismatch fails the test with a clean, direct assertion.
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const service = buildService({
      toolCall: async (name, args) => {
        calls.push({ name, args });
        return { answer: 'pong' };
      },
    });
    const result = await service.run({
      language: 'JAVASCRIPT',
      sourceCode: `module.exports.main = async () => pentesthub.ai.ask('ping');`,
      permissions: ['ai:invoke'],
      workspaceId: 'ws-1',
      userId: 'user-1',
      input: {},
    });
    expect(result.output).toEqual({ answer: 'pong' });
    expect(calls).toEqual([{ name: 'ask_ai', args: { workspaceId: 'ws-1', question: 'ping' } }]);
  });

  it('rejects PYTHON scripts with SCRIPT_LANGUAGE_NOT_EXECUTABLE regardless of the flag', async () => {
    const service = buildService({ pythonEnabled: false });
    await expect(
      service.run({
        language: 'PYTHON',
        sourceCode: 'print("hi")',
        permissions: NO_PERMISSIONS,
        workspaceId: 'ws-1',
        userId: 'user-1',
        input: {},
      }),
    ).rejects.toMatchObject({ code: 'SCRIPT_LANGUAGE_NOT_EXECUTABLE' });
  });

  it('rejects a script with a syntax error', async () => {
    const service = buildService();
    await expect(
      service.run({
        language: 'JAVASCRIPT',
        sourceCode: 'module.exports.main = ( => {',
        permissions: NO_PERMISSIONS,
        workspaceId: 'ws-1',
        userId: 'user-1',
        input: {},
      }),
    ).rejects.toThrow(/Script execution failed/);
  });
});
