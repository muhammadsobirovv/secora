import { describe, expect, it, jest } from '@jest/globals';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  REQUIRED_TOOLS,
  VERSION_ARGS,
  ToolPreflight,
  ToolUnavailableError,
  checkTool,
  toolNameOf,
  type PreflightDeps,
} from './tool-preflight.js';
import { formatToolTable } from './tool-preflight.service.js';
import { versionLine } from './tool-preflight.js';

const posix = process.platform !== 'win32';

function fixture(name = 'httpx', mode = 0o755) {
  const dir = mkdtempSync(join(tmpdir(), 'preflight-'));
  const file = join(dir, name);
  writeFileSync(file, '#!/bin/sh\necho fake\n');
  if (posix) chmodSync(file, mode);
  return { dir, file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const deps = (run: PreflightDeps['run']): PreflightDeps => ({ run, pathEnv: '', platform: process.platform });

describe('checkTool', () => {
  it('a binary that is not there is MISSING, without running anything', async () => {
    const run = jest.fn<PreflightDeps['run']>();
    const check = await checkTool(join(tmpdir(), 'no-such-dir', 'httpx'), deps(run));
    expect(check).toMatchObject({ tool: 'httpx', status: 'MISSING', detail: 'not found' });
    expect(run).not.toHaveBeenCalled();
  });

  it('a bare name is looked up on PATH, and is MISSING when no directory has it', async () => {
    const f = fixture('httpx');
    try {
      const run = jest.fn<PreflightDeps['run']>(async () => ({ exitCode: 0, output: 'httpx 1.12.0', timedOut: false }));
      const found = await checkTool('httpx', { run, pathEnv: f.dir, platform: process.platform });
      expect(found.status).toBe('OK');
      const missing = await checkTool('httpx', { run, pathEnv: join(tmpdir(), 'empty-nowhere'), platform: process.platform });
      expect(missing.status).toBe('MISSING');
    } finally {
      f.cleanup();
    }
  });

  (posix ? it : it.skip)('a file without the executable bit is NOT_EXECUTABLE', async () => {
    const f = fixture('httpx', 0o644);
    try {
      const run = jest.fn<PreflightDeps['run']>();
      expect(await checkTool(f.file, deps(run))).toMatchObject({ status: 'NOT_EXECUTABLE' });
      expect(run).not.toHaveBeenCalled();
    } finally {
      f.cleanup();
    }
  });

  it('a start that the OS refuses (EACCES / EPERM) is NOT_EXECUTABLE', async () => {
    const f = fixture('nuclei');
    try {
      const run = jest.fn<PreflightDeps['run']>(async () => ({ exitCode: null, output: '', timedOut: false, spawnError: 'spawn EACCES' }));
      expect(await checkTool(f.file, deps(run))).toMatchObject({ tool: 'nuclei', status: 'NOT_EXECUTABLE', detail: 'permission denied' });
    } finally {
      f.cleanup();
    }
  });

  it('a binary whose version check exits non-zero is BROKEN', async () => {
    const f = fixture('katana');
    try {
      const run = jest.fn<PreflightDeps['run']>(async () => ({ exitCode: 2, output: 'boom', timedOut: false }));
      const check = await checkTool(f.file, deps(run));
      expect(check).toMatchObject({ status: 'BROKEN' });
      expect(check.detail).toContain('code 2');
    } finally {
      f.cleanup();
    }
  });

  it('a binary that hangs on its version check is BROKEN', async () => {
    const f = fixture('dnsx');
    try {
      const run = jest.fn<PreflightDeps['run']>(async () => ({ exitCode: null, output: '', timedOut: true }));
      expect(await checkTool(f.file, deps(run))).toMatchObject({ status: 'BROKEN' });
    } finally {
      f.cleanup();
    }
  });

  it('a working binary is OK and its version line is kept; each tool gets its own version flag', async () => {
    const calls: { name: string; args: string[] }[] = [];
    for (const tool of REQUIRED_TOOLS) {
      const f = fixture(tool);
      try {
        const run = jest.fn<PreflightDeps['run']>(async (_c, args) => {
          calls.push({ name: tool, args });
          return { exitCode: 0, output: `${tool} version 1.2.3`, timedOut: false };
        });
        const check = await checkTool(f.file, deps(run));
        expect(check).toMatchObject({ tool, status: 'OK', detail: `${tool} version 1.2.3` });
      } finally {
        f.cleanup();
      }
    }
    expect(calls.find((c) => c.name === 'ffuf')?.args).toEqual(['-V']);
    expect(calls.find((c) => c.name === 'dalfox')?.args).toEqual(['--version']);
    expect(calls.find((c) => c.name === 'httpx')?.args).toEqual(['-version']);
  });

  it('works out the tool name from a configured path', () => {
    expect(toolNameOf('/opt/secora-tools/bin/httpx')).toBe('httpx');
    expect(toolNameOf('C:\\Tools\\nuclei\\nuclei.exe')).toBe('nuclei');
  });
});

describe('ToolPreflight cache', () => {
  it('trusts a working tool for 5 minutes but re-checks a failing one after 30 seconds', async () => {
    const f = fixture('httpx');
    try {
      let now = 1_000_000;
      let exitCode = 1;
      const run = jest.fn<PreflightDeps['run']>(async () => ({ exitCode, output: 'v', timedOut: false }));
      const preflight = new ToolPreflight(deps(run), () => now);

      expect((await preflight.check(f.file)).status).toBe('BROKEN');
      now += 10_000;
      await preflight.check(f.file);
      expect(run).toHaveBeenCalledTimes(1); // still cached

      now += 25_000; // 35 s: the failure expired
      exitCode = 0;
      expect((await preflight.check(f.file)).status).toBe('OK');
      expect(run).toHaveBeenCalledTimes(2);

      now += 4 * 60_000;
      await preflight.check(f.file);
      expect(run).toHaveBeenCalledTimes(2); // OK is trusted for 5 minutes
      now += 2 * 60_000;
      await preflight.check(f.file);
      expect(run).toHaveBeenCalledTimes(3);
    } finally {
      f.cleanup();
    }
  });

  it('concurrent checks of one tool run it once', async () => {
    const f = fixture('httpx');
    try {
      const run = jest.fn<PreflightDeps['run']>(async () => ({ exitCode: 0, output: 'v', timedOut: false }));
      const preflight = new ToolPreflight(deps(run));
      await Promise.all([preflight.check(f.file), preflight.check(f.file), preflight.check(f.file)]);
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      f.cleanup();
    }
  });

  it('assertAvailable names the tool and the reason', async () => {
    const preflight = new ToolPreflight(deps(jest.fn<PreflightDeps['run']>()));
    const error = await preflight.assertAvailable(join(tmpdir(), 'gone', 'httpx')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ToolUnavailableError);
    expect((error as Error).message).toBe('tool httpx is not available on this worker (not found)');
  });

  it('invalidate forgets a cached OK', async () => {
    const f = fixture('httpx');
    try {
      const run = jest.fn<PreflightDeps['run']>(async () => ({ exitCode: 0, output: 'v', timedOut: false }));
      const preflight = new ToolPreflight(deps(run));
      await preflight.check(f.file);
      preflight.invalidate(f.file);
      await preflight.check(f.file);
      expect(run).toHaveBeenCalledTimes(2);
    } finally {
      f.cleanup();
    }
  });
});

describe('boot table', () => {
  it('prints one line per tool with its status and detail', () => {
    const table = formatToolTable([
      { tool: 'httpx', command: '/opt/httpx', status: 'OK', detail: 'httpx 1.12.0', checkedAt: '' },
      { tool: 'nuclei', command: 'nuclei', status: 'MISSING', detail: 'not found', checkedAt: '' },
    ]);
    expect(table.split('\n')).toHaveLength(2);
    expect(table).toMatch(/httpx\s+OK\s+httpx 1\.12\.0/);
    expect(table).toMatch(/nuclei\s+MISSING\s+not found/);
  });
});

describe('versionLine', () => {
  it('skips the ASCII banner and finds the version', () => {
    const banner = '\n    __    __  __       _  __\n   / /_  / /_/ /_____ | |/ /\n\n\t\tprojectdiscovery.io\n\n[INF] Current Version: v1.7.0\n';
    expect(versionLine(banner)).toBe('[INF] Current Version: v1.7.0');
    expect(versionLine('ffuf version: 2.3.0')).toBe('ffuf version: 2.3.0');
    expect(versionLine('\u001b[34mINF\u001b[0m Nuclei Engine Version: v3.11.1')).toContain('v3.11.1');
    expect(versionLine('')).toBe('ok');
  });
});

describe('version arguments', () => {
  it('are always flags, never a bare word a scanner could take as a target', () => {
    for (const [tool, args] of Object.entries(VERSION_ARGS)) {
      expect(args.length).toBeGreaterThan(0);
      for (const arg of args) expect({ tool, arg, isFlag: arg.startsWith('-') }).toEqual({ tool, arg, isFlag: true });
    }
  });
});
