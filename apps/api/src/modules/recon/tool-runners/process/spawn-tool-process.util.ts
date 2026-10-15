import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import type { ToolRunResult } from '../tool-runner.interface.js';

export interface SpawnToolProcessOptions {
  /// The binary name/path and its argv — ALWAYS an array, never a shell
  /// string. This is the one call site for child_process.spawn in the
  /// entire Recon module specifically so this invariant only has to be
  /// enforced in one place: target values are user-supplied and must
  /// never be interpolated into a shell command.
  command: string;
  args: string[];
  signal: AbortSignal;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  /// Grace period between SIGTERM and SIGKILL when the signal aborts —
  /// gives well-behaved tools a chance to exit cleanly first.
  killGraceMs?: number;
}

function lineBuffer(onLine: ((line: string) => void) | undefined) {
  let buffer = '';
  return (chunk: Buffer): void => {
    if (!onLine) return;
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.length > 0) onLine(line);
    }
  };
}

/// Injectable (not a bare function) specifically so every tool-runner
/// adapter can have this mocked via plain constructor-injected jest.fn(),
/// matching this codebase's established testing convention (no
/// module-level mocking anywhere else) — this is what lets each adapter's
/// spec assert `spawn receives an argv array, never a shell string`
/// mechanically instead of relying on code review.
@Injectable()
export class ToolProcessSpawner {
  /// Spawns a tool, streaming stdout/stderr line-by-line, and resolves
  /// once the process exits or the signal aborts (SIGTERM, escalating to
  /// SIGKILL after killGraceMs if the process ignores it).
  spawn(options: SpawnToolProcessOptions): Promise<ToolRunResult> {
    const { command, args, signal, killGraceMs = 5000 } = options;

    return new Promise((resolve, reject) => {
      // stdin 'ignore' (/dev/null), not the default open pipe: the
      // ProjectDiscovery tools (httpx, katana, naabu, ...) read targets from
      // stdin whenever it isn't a TTY, so a pipe that's never closed makes
      // them block until the job timeout. Every adapter passes its target
      // via argv, never stdin.
      const child = spawn(command, args, {
        signal,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let timedOut = false;
      let killTimer: NodeJS.Timeout | undefined;

      const handleStdoutLine = lineBuffer(options.onStdoutLine);
      const handleStderrLine = lineBuffer(options.onStderrLine);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        handleStdoutLine(chunk);
      });
      child.stderr.on('data', handleStderrLine);

      const onAbort = (): void => {
        timedOut = true;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
      };
      signal.addEventListener('abort', onAbort, { once: true });

      child.on('error', (error) => {
        signal.removeEventListener('abort', onAbort);
        if (killTimer) clearTimeout(killTimer);
        reject(error);
      });

      child.on('close', (exitCode) => {
        signal.removeEventListener('abort', onAbort);
        if (killTimer) clearTimeout(killTimer);
        resolve({ exitCode, stdout, timedOut });
      });
    });
  }
}
