import { Injectable } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
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
  /// Stdout is kept in memory for the parser; anything beyond this is dropped
  /// and the result is marked `stdoutTruncated`. Protects the worker from a
  /// runaway tool.
  maxStdoutBytes?: number;
  /// Longest single log line forwarded to onStdoutLine/onStderrLine.
  maxLogLineChars?: number;
  /// POSIX niceness added to the child (`nice -n <n>`), so scans never starve
  /// the API on the 2-CPU host. Ignored on Windows.
  niceLevel?: number;
}

export const DEFAULT_MAX_STDOUT_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_LOG_LINE_CHARS = 2000;
export const DEFAULT_NICE_LEVEL = 10;

const IS_POSIX = process.platform !== 'win32';

function lineBuffer(onLine: ((line: string) => void) | undefined, maxChars: number) {
  let buffer = '';
  return (chunk: Buffer): void => {
    if (!onLine) return;
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.length > 0) {
        onLine(line.length > maxChars ? `${line.slice(0, maxChars)}…` : line);
      }
    }
    // A single unterminated line must not grow without bound either.
    if (buffer.length > maxChars * 4) {
      onLine(`${buffer.slice(0, maxChars)}…`);
      buffer = '';
    }
  };
}

/// Sends the signal to the whole process group on POSIX (the tool and any
/// helper it forked), and to the child alone elsewhere.
function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (IS_POSIX && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Group already gone; fall through to the direct child.
    }
  }
  child.kill(signal);
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
    const {
      command,
      args,
      signal,
      killGraceMs = 5000,
      maxStdoutBytes = DEFAULT_MAX_STDOUT_BYTES,
      maxLogLineChars = DEFAULT_MAX_LOG_LINE_CHARS,
      niceLevel = DEFAULT_NICE_LEVEL,
    } = options;

    // `nice` is applied as an argv prefix (still no shell). Process group on
    // POSIX so a timeout also stops anything the tool forked.
    const useNice = IS_POSIX && niceLevel > 0;
    const file = useNice ? 'nice' : command;
    const argv = useNice ? ['-n', String(niceLevel), command, ...args] : args;

    return new Promise((resolve, reject) => {
      // No `signal` option here: Node would kill the child and reject with an
      // AbortError, losing the timedOut result. Abort is handled below.
      const child = spawn(file, argv, {
        detached: IS_POSIX,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stdoutBytes = 0;
      let stdoutTruncated = false;
      let timedOut = false;
      let killTimer: NodeJS.Timeout | undefined;

      const handleStdoutLine = lineBuffer(options.onStdoutLine, maxLogLineChars);
      const handleStderrLine = lineBuffer(options.onStderrLine, maxLogLineChars);

      child.stdout.on('data', (chunk: Buffer) => {
        if (!stdoutTruncated) {
          const room = maxStdoutBytes - stdoutBytes;
          if (chunk.length <= room) {
            stdout += chunk.toString('utf8');
            stdoutBytes += chunk.length;
          } else {
            stdout += chunk.subarray(0, Math.max(room, 0)).toString('utf8');
            stdoutBytes = maxStdoutBytes;
            stdoutTruncated = true;
          }
        }
        // Still forwarded line by line for the live log, which has its own cap.
        handleStdoutLine(chunk);
      });
      child.stderr.on('data', handleStderrLine);

      const onAbort = (): void => {
        timedOut = true;
        killTree(child, 'SIGTERM');
        killTimer = setTimeout(() => killTree(child, 'SIGKILL'), killGraceMs);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();

      child.on('error', (error) => {
        signal.removeEventListener('abort', onAbort);
        if (killTimer) clearTimeout(killTimer);
        reject(error);
      });

      child.on('close', (exitCode) => {
        signal.removeEventListener('abort', onAbort);
        if (killTimer) clearTimeout(killTimer);
        resolve({ exitCode, stdout, timedOut, stdoutTruncated });
      });
    });
  }
}
