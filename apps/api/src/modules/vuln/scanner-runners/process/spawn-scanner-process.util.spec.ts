import { describe, expect, it } from '@jest/globals';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScannerProcessSpawner } from './spawn-scanner-process.util.js';

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
