import { describe, expect, it, jest } from '@jest/globals';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScannerProcessSpawner } from './spawn-scanner-process.util.js';
import { ToolUnavailableError } from '../../pipeline/tool-preflight.js';

/// These tests run real child processes (the current Node binary), never a
/// security tool and never the network. `niceLevel: 0` keeps them independent
/// of whether `nice` is installed.
const spawner = new ScannerProcessSpawner();
const node = process.execPath;

describe('ScannerProcessSpawner — output and time limits', () => {
  it('caps stdout and reports that it was truncated', async () => {
    const controller = new AbortController();
    const result = await spawner.spawn({
      command: node,
      args: ['-e', "process.stdout.write('a'.repeat(300000))"],
      signal: controller.signal,
      maxStdoutBytes: 1000,
      niceLevel: 0,
    });
    expect(result.stdoutTruncated).toBe(true);
    expect(Buffer.byteLength(result.stdout)).toBe(1000);
    expect(result.timedOut).toBe(false);
  });

  it('does not truncate small output', async () => {
    const controller = new AbortController();
    const result = await spawner.spawn({
      command: node,
      args: ['-e', "process.stdout.write('ok')"],
      signal: controller.signal,
      niceLevel: 0,
    });
    expect(result.stdout).toBe('ok');
    expect(result.stdoutTruncated).toBe(false);
  });

  it('kills a child that outlives its stage timeout and reports timedOut', async () => {
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 200);
    const result = await spawner.spawn({
      command: node,
      args: ['-e', 'setTimeout(() => {}, 30000)'],
      signal: controller.signal,
      killGraceMs: 500,
      niceLevel: 0,
    });
    expect(result.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('kills the whole process group, so a grandchild cannot outlive the stage', async () => {
    if (process.platform === 'win32') {
      // BLOCKED on Windows: process groups do not exist there. Verified on the
      // Linux worker image only.
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'spawn-tree-'));
    try {
      const marker = join(dir, 'grandchild-ran');
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 300);
      await spawner.spawn({
        command: node,
        args: [join(__dirname, 'fixtures', 'spawn-tree.cjs'), marker],
        signal: controller.signal,
        killGraceMs: 300,
        niceLevel: 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 2500));
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('ScannerProcessSpawner — tool preflight', () => {
  const never = new AbortController().signal;

  it('refuses to start a tool the preflight says is unavailable, naming it', async () => {
    const preflight = {
      assertAvailable: async () => {
        throw new ToolUnavailableError('httpx', 'not found');
      },
      invalidate: () => undefined,
    };
    const guarded = new ScannerProcessSpawner(preflight as never);
    await expect(guarded.spawn({ command: process.execPath, args: ['-e', '0'], signal: never })).rejects.toThrow(
      'tool httpx is not available on this worker (not found)',
    );
  });

  it('turns "command not found" (exit 127 and no output) into the same error and forgets the cached OK', async () => {
    const invalidate = jest.fn();
    const preflight = { assertAvailable: async () => undefined, invalidate };
    const guarded = new ScannerProcessSpawner(preflight as never);
    await expect(
      guarded.spawn({ command: process.execPath, args: ['-e', 'process.exit(127)'], signal: never, niceLevel: 0 }),
    ).rejects.toBeInstanceOf(ToolUnavailableError);
    expect(invalidate).toHaveBeenCalled();
  });

  it('an ordinary non-zero exit with output is a normal result (dalfox exits 1 on findings)', async () => {
    const preflight = { assertAvailable: async () => undefined, invalidate: () => undefined };
    const guarded = new ScannerProcessSpawner(preflight as never);
    const result = await guarded.spawn({
      command: process.execPath,
      args: ['-e', 'console.log("found"); process.exit(1)'],
      signal: never,
      niceLevel: 0,
    });
    expect(result).toMatchObject({ exitCode: 1, timedOut: false });
    expect(result.stdout).toContain('found');
  });
});
