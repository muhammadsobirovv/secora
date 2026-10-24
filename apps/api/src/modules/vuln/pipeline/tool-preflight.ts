import { spawn, type ChildProcess } from 'node:child_process';
import { access, constants, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join, basename } from 'node:path';

/// Can this worker actually run the tool? A missing, non-executable or broken
/// binary used to look like "the host has nothing to scan" (the wrapper that
/// lowers the tool's priority reports a missing program as an empty run). The
/// pipeline now asks first and fails the stage with the reason.

export type ToolStatus = 'OK' | 'MISSING' | 'NOT_EXECUTABLE' | 'BROKEN';

export interface ToolCheck {
  /// Short name (httpx, nuclei, ...), derived from the configured command.
  tool: string;
  command: string;
  status: ToolStatus;
  /// First line of the tool's `-version` output when OK, the reason otherwise.
  detail: string;
  checkedAt: string;
}

/// The argument that makes each tool print its version and exit. Anything not
/// listed is only checked for existing and being executable.
export const VERSION_ARGS: Record<string, string[]> = {
  httpx: ['-version'],
  nuclei: ['-version'],
  katana: ['-version'],
  subfinder: ['-version'],
  dnsx: ['-version'],
  naabu: ['-version'],
  ffuf: ['-V'],
  // dalfox 3 has no "version" command: a bare word would be taken as a scan TARGET
  // (it tried to resolve a host called "version"). Only ever use flags here.
  dalfox: ['--version'],
};

/// Every binary the STANDARD and DEEP pipeline can start.
export const REQUIRED_TOOLS = ['httpx', 'nuclei', 'katana', 'subfinder', 'dnsx', 'naabu', 'ffuf', 'dalfox'] as const;

export class ToolUnavailableError extends Error {
  constructor(
    readonly tool: string,
    readonly reason: string,
  ) {
    super(`tool ${tool} is not available on this worker (${reason})`);
    this.name = 'ToolUnavailableError';
  }
}

export function toolNameOf(command: string): string {
  return basename(command).replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
}

export interface PreflightDeps {
  /// Runs a program and resolves with its exit code and first output line.
  run(command: string, args: string[], timeoutMs: number): Promise<{ exitCode: number | null; output: string; timedOut: boolean; spawnError?: string }>;
  pathEnv: string;
  platform: NodeJS.Platform;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function findInPath(command: string, deps: PreflightDeps): Promise<string | null> {
  if (isAbsolute(command) || command.includes('/') || command.includes('\\')) return (await isFile(command)) ? command : null;
  const exts = deps.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  for (const dir of deps.pathEnv.split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = join(dir, command + ext);
      if (await isFile(candidate)) return candidate;
    }
  }
  return null;
}

export const defaultDeps: PreflightDeps = {
  pathEnv: process.env.PATH ?? '',
  platform: process.platform,
  run: (command, args, timeoutMs) =>
    new Promise((resolve) => {
      let out = '';
      let settled = false;
      const done = (value: Awaited<ReturnType<PreflightDeps['run']>>): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      let child: ChildProcess;
      try {
        child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) {
        done({ exitCode: null, output: '', timedOut: false, spawnError: error instanceof Error ? error.message : String(error) });
        return;
      }
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        done({ exitCode: null, output: out, timedOut: true });
      }, timeoutMs);
      const collect = (chunk: Buffer): void => {
        if (out.length < 16_384) out += chunk.toString('utf8');
      };
      child.stdout?.on('data', collect);
      child.stderr?.on('data', collect);
      child.on('error', (error) => {
        clearTimeout(timer);
        done({ exitCode: null, output: '', timedOut: false, spawnError: error.message });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        done({ exitCode: code, output: out, timedOut: false });
      });
    }),
};

const stripAnsi = (text: string): string => text.split(String.fromCharCode(27)).map((part, i) => (i === 0 ? part : part.replace(/^\[[0-9;]*m/, ''))).join('');

/// Most of these tools print an ASCII-art banner before the version, so the first
/// line says nothing. Pick the line that carries a version number, falling back to
/// the first non-empty line.
export function versionLine(output: string): string {
  const lines = stripAnsi(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const best =
    lines.find((line) => /version/i.test(line) && /\d+\.\d+/.test(line)) ??
    lines.find((line) => /\bv?\d+\.\d+\.\d+/.test(line)) ??
    lines[0] ??
    'ok';
  return best.slice(0, 160);
}

/// Checks one configured command: it exists, it is executable and its version
/// flag works.
export async function checkTool(command: string, deps: PreflightDeps = defaultDeps, now = new Date()): Promise<ToolCheck> {
  const tool = toolNameOf(command);
  const result = (status: ToolStatus, detail: string): ToolCheck => ({ tool, command, status, detail, checkedAt: now.toISOString() });

  const found = await findInPath(command, deps);
  if (!found) return result('MISSING', 'not found');
  if (deps.platform !== 'win32') {
    try {
      await access(found, constants.X_OK);
    } catch {
      return result('NOT_EXECUTABLE', 'the file is not executable');
    }
  }
  const args = VERSION_ARGS[tool];
  if (!args) return result('OK', 'present (no version check for this tool)');

  const ran = await deps.run(found, args, 15_000);
  if (ran.spawnError) {
    const denied = /EACCES|EPERM|permission/i.test(ran.spawnError);
    return result(denied ? 'NOT_EXECUTABLE' : 'BROKEN', denied ? 'permission denied' : ran.spawnError.slice(0, 160));
  }
  if (ran.timedOut) return result('BROKEN', 'the version check did not finish in 15 s');
  if (ran.exitCode !== 0) return result('BROKEN', `the version check exited with code ${String(ran.exitCode)}`);
  return result('OK', versionLine(ran.output));
}

/// Cached answers for the worker. A working tool is trusted for five minutes, a
/// failing one is re-checked after 30 seconds so fixing the image or the path
/// takes effect without a restart.
export class ToolPreflight {
  private readonly cache = new Map<string, { check: ToolCheck; expires: number }>();
  private readonly inflight = new Map<string, Promise<ToolCheck>>();

  constructor(
    private readonly deps: PreflightDeps = defaultDeps,
    private readonly clock: () => number = () => Date.now(),
    private readonly okTtlMs = 5 * 60_000,
    private readonly failTtlMs = 30_000,
  ) {}

  async check(command: string): Promise<ToolCheck> {
    const hit = this.cache.get(command);
    if (hit && hit.expires > this.clock()) return hit.check;
    const pending = this.inflight.get(command);
    if (pending) return pending;
    const run = checkTool(command, this.deps, new Date(this.clock())).then((check) => {
      this.cache.set(command, { check, expires: this.clock() + (check.status === 'OK' ? this.okTtlMs : this.failTtlMs) });
      return check;
    });
    this.inflight.set(command, run);
    try {
      return await run;
    } finally {
      this.inflight.delete(command);
    }
  }

  /// Throws ToolUnavailableError unless the command can run.
  async assertAvailable(command: string): Promise<void> {
    const check = await this.check(command);
    if (check.status !== 'OK') throw new ToolUnavailableError(check.tool, check.detail);
  }

  /// Marks a command as failing right now (the process manager said it could
  /// not be started), so the next stage does not trust a stale OK.
  invalidate(command: string): void {
    this.cache.delete(command);
  }
}
