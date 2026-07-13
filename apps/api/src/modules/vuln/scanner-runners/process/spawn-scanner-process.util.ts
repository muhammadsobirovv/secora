import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import type { ScannerRunResult } from '../scanner-runner.interface.js';

export interface SpawnScannerProcessOptions {
  /// The binary name/path and its argv — ALWAYS an array, never a shell
  /// string (see ToolProcessSpawner in Module 3 for the identical
  /// rationale: target values are user-supplied and must never be
  /// interpolated into a shell command).
  command: string;
  args: string[];
  signal: AbortSignal;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  /// Grace period between SIGTERM and SIGKILL when the signal aborts.
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

/// The Vulnerability module's own copy of Module 3's ToolProcessSpawner —
/// deliberately not a shared import. Each job/worker module owns its full
/// vertical slice (see docs/adr/0004-vulnerability-engine-module.md); this
/// is a handful of lines duplicated in exchange for the two modules never
/// needing to coordinate a change to this class. Injectable (not a bare
/// function) for the same testing reason as ToolProcessSpawner: every
/// scanner adapter's spec mocks this via plain constructor-injected
/// jest.fn().
@Injectable()
export class ScannerProcessSpawner {
  spawn(options: SpawnScannerProcessOptions): Promise<ScannerRunResult> {
    const { command, args, signal, killGraceMs = 5000 } = options;

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { signal });
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
