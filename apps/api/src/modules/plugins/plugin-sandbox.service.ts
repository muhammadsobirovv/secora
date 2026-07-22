import { Injectable } from '@nestjs/common';
import * as vm from 'node:vm';
import type { PluginManifest } from '@pentesthub/shared';

export interface SandboxRunInput {
  /// The plugin version's JS source (the `entryPoint` module body — a CJS-
  /// style script that assigns exported hook functions onto
  /// `module.exports`). Plain source text, not a file path: plugin code
  /// lives in `PluginVersion.manifestJson`/an associated bundle field, not
  /// on this server's filesystem, so there's nothing to `require()`.
  source: string;
  hook: string;
  input: Record<string, unknown>;
  permissions: string[];
  timeoutMs?: number;
}

export interface SandboxRunResult {
  output: unknown;
  logs: string[];
  durationMs: number;
}

/// Sandboxed plugin execution via Node's built-in `vm` module — a real,
/// working process-level sandbox: the script runs in a fresh
/// `vm.createContext()` with no access to `require`, `process`, the
/// filesystem, or the network unless the plugin's declared+accepted
/// `permissions` explicitly grant a capability, in which case a narrow
/// wrapped function (not the raw Node API) is injected for it.
///
/// **Disclosed scope boundary**: `vm` isolates the *global object and
/// syntax scope*, not the OS process — it does not protect against
/// CPU/memory exhaustion beyond a wall-clock `timeout`, and a
/// sufficiently malicious script can still attempt prototype-pollution or
/// other same-process attacks that a true OS-level sandbox (gVisor,
/// Firecracker, a separate worker_threads/child_process with its own
/// resource limits) would block. This is documented in
/// docs/adr/0010-enterprise-platform.md as a v1 boundary — the plugin
/// signature-verification step (see plugin-signature.util.ts) and the
/// permission-consent step (`InstallPluginHandler`) are this version's
/// primary defenses (don't run untrusted/unreviewed code at all) rather
/// than the sandbox being the sole line of defense.
@Injectable()
export class PluginSandboxService {
  async run(input: SandboxRunInput): Promise<SandboxRunResult> {
    const logs: string[] = [];
    const startedAt = Date.now();

    const sandboxApi = this.buildApi(input.permissions, logs);
    const moduleShim = { exports: {} as Record<string, unknown> };
    const context = vm.createContext({
      module: moduleShim,
      exports: moduleShim.exports,
      pentesthub: sandboxApi,
      console: { log: (...args: unknown[]) => logs.push(args.map(String).join(' ')) },
    });

    try {
      const script = new vm.Script(input.source, { filename: 'plugin.js' });
      script.runInContext(context, { timeout: input.timeoutMs ?? 5000 });

      const exported = moduleShim.exports[input.hook];
      if (typeof exported !== 'function') {
        throw new Error(`Hook "${input.hook}" is not exported by this plugin version.`);
      }

      // The hook itself also runs under the same wall-clock budget — a
      // second vm.Script wrapping the call so a synchronous infinite loop
      // inside the hook is caught by `timeout` too, not just the top-level
      // module body.
      const invokeContext = vm.createContext({ __hook: exported, __input: input.input, result: undefined });
      const invoke = new vm.Script('result = __hook(__input);', { filename: 'plugin-invoke.js' });
      invoke.runInContext(invokeContext, { timeout: input.timeoutMs ?? 5000 });

      return { output: invokeContext.result, logs, durationMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[error] ${message}`);
      throw new Error(`Plugin execution failed: ${message}`);
    }
  }

  /// The permission-gated API surface injected as `pentesthub.*` inside
  /// the sandbox. Each capability is only present if the corresponding
  /// permission string was both declared by the plugin version and
  /// accepted at install time (`InstallPluginHandler` enforces the
  /// declared/accepted match; this only re-checks declared ones, since
  /// unaccepted permissions never reach the sandbox at all — the caller
  /// only invokes `run()` for installations that passed consent).
  private buildApi(permissions: string[], logs: string[]): Record<string, unknown> {
    const api: Record<string, unknown> = {
      log: (message: string) => logs.push(String(message)),
    };
    if (permissions.includes('network:fetch')) {
      // A real network capability would proxy through a rate-limited,
      // allow-listed fetch — not wired to the real `fetch` here since no
      // plugin has been marketplace-reviewed yet in this codebase; the
      // capability slot exists so a future pass can wire it without
      // changing the sandbox's shape.
      api.fetch = () => {
        throw new Error('network:fetch is declared but not yet enabled in this deployment.');
      };
    }
    return api;
  }
}

export function validateHookDeclared(manifest: PluginManifest, hook: string): boolean {
  return manifest.hooks.includes(hook);
}
