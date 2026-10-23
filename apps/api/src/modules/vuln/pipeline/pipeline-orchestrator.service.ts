import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PROFILE_STAGES,
  formatStageMarker,
  type PipelineStage,
} from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import type {
  VulnScanJobLogLevel,
  VulnScanner,
} from '../../../prisma-types.js';
import type { VulnFindingInput } from '../scanner-runners/normalizers/normalizer.interface.js';
import type { ToolCommandInfo } from '../scanner-runners/scanner-runner.interface.js';
import { ScannerProcessSpawner } from '../scanner-runners/process/spawn-scanner-process.util.js';
import { NativeChecks } from './checks/native-checks.js';
import { writeWordlistFile } from './content-wordlist.js';
import {
  parseDalfoxJsonl,
  parseDnsxJsonl,
  parseFfufJsonl,
  parseKatanaJsonl,
  parseNaabuJsonl,
  parseSubfinderLines,
} from './parsers.js';
import type { PinnedHost } from './pin.util.js';
import { PinningProxy, type BlockedConnection } from './pinning-proxy.js';
import { createProxyFetch } from './checks/proxy-fetch.js';
import {
  createVerifyContext,
  planVerification,
  verifyFinding,
  type FetchOnce,
  type VerificationOutcome,
  type VerifiableFinding,
} from './reverify.js';
import { PipelineProbeStage } from './probe-stage.service.js';
import { redactArgv } from './redact-argv.util.js';
import { redactSecrets } from '../report/redact.util.js';
import { ScopeGuard, type ScopeGuardOptions } from './scope-guard.js';
import { partitionByScope, type ScopeRule } from './scope.util.js';
import {
  normalizeDalfox,
  normalizeFfuf,
  normalizeNaabu,
  normalizeSubdomains,
  type ResolvedSubdomain,
} from './stage-findings.js';
import {
  DALFOX_MAX_URLS,
  DALFOX_STAGE_TIMEOUT_SECONDS,
  DNSX_MAX_HOSTS,
  DNSX_STAGE_TIMEOUT_SECONDS,
  FFUF_STAGE_TIMEOUT_SECONDS,
  KATANA_MAX_URLS,
  KATANA_STAGE_TIMEOUT_SECONDS,
  NAABU_MAX_IPS,
  NAABU_STAGE_TIMEOUT_SECONDS,
  SUBFINDER_MAX_RESULTS,
  SUBFINDER_STAGE_TIMEOUT_SECONDS,
  buildDalfoxArgs,
  buildDnsxArgs,
  buildFfufArgs,
  buildKatanaArgs,
  buildNaabuArgs,
  buildSubfinderArgs,
  type CatalogToolId,
  type NucleiProfile,
  type ScanProfile,
} from './tool-catalog.js';

/// Runs the stages of a scan profile in order and keeps the scan going when a
/// stage breaks.
///
///   QUICK     checks
///   STANDARD  recon -> checks -> crawl -> scan
///   DEEP      recon -> subdomains -> resolve -> ports -> checks -> crawl -> scan -> content -> xss
///
/// What it guarantees, and where each rule is enforced:
///  - Every host, URL or address a tool DISCOVERS is checked again before
///    anything is sent to it: the ScopeGuard (ownership scope, public
///    addresses, http(s), allowed ports, one resolution per host) for hosts and
///    URLs, and for the crawler, content fuzzer and XSS checker also the
///    pinning proxy, which refuses any connection the guard did not admit.
///  - A stage that fails or times out is logged ("[stage] <name> failed"), its
///    tool run is closed as FAILED, and the next stage still runs. Whatever the
///    stage found before it stopped is kept.
///  - Tools run one after another, so a job never runs more than one tool;
///    the worker's concurrency cap of 2 jobs is unchanged.
///  - Every command is written to the job log and audited (argv redacted)
///    before it starts.

export interface NucleiStageResult {
  /// The runner could not start, or crashed.
  failed: boolean;
  /// The stage's own time limit was reached; findings so far were kept.
  partial: boolean;
  message: string | null;
}

/// What the orchestrator needs from the execution service. Kept as an interface
/// so the orchestration can be tested without a database.
export interface PipelineHost {
  log(level: VulnScanJobLogLevel, message: string): void;
  audit(info: ToolCommandInfo, stage: PipelineStage): void;
  /// Saves the findings and raw output of a scanner's tool run and completes it.
  persist(
    scanner: VulnScanner,
    result: { findings: VulnFindingInput[]; raw: string },
  ): Promise<void>;
  /// Closes a tool run that produced nothing (skipped or failed).
  closeToolRun(
    scanner: VulnScanner,
    outcome: 'COMPLETED' | 'FAILED',
    message: string,
  ): Promise<void>;
  /// Status of the job's tool run for this scanner, or null if the job has none.
  toolRunStatus(scanner: VulnScanner): string | null;
  /// Runs nuclei through the existing scanner runner, pinned, on the given URLs.
  runNuclei(input: {
    profile: NucleiProfile;
    pin: PinnedHost;
    urls: string[];
    /// The pinning proxy nuclei must use (null only when none is running).
    proxyUrl: string | null;
    signal: AbortSignal;
  }): Promise<NucleiStageResult>;
  /// True when the user asked to pause or cancel the job; checked between stages.
  shouldStop(): Promise<boolean>;
  /// Client-engagement scans only: why the authorization the scan runs under
  /// no longer holds (withdrawn, window ended), or null while it still does.
  /// Absent for scans of verified targets.
  authorizationLost?(): Promise<string | null>;
  /// The findings this job has saved so far (for the re-verification stage).
  listFindings(): Promise<VerifiableFinding[]>;
  /// Saves the result of a re-check on a finding and sets its confidence.
  recordVerification(findingId: string, outcome: VerificationOutcome): Promise<void>;
}

/// How often a running engagement scan re-checks its authorization, between
/// the checks made before every stage.
export const AUTHORIZATION_WATCH_INTERVAL_MS = 15_000;

export interface PipelineRunResult {
  /// Set when the scan was stopped because its authorization ended.
  authorizationLost: string | null;
}

export interface PipelineRunInput {
  profile: ScanProfile;
  target: { id: string; type: string; value: string };
  /// What the ownership proof covers.
  rule: ScopeRule;
  /// The target host, resolved once and checked.
  pin: PinnedHost;
  signal: AbortSignal;
  host: PipelineHost;
}

type StageState = 'done' | 'skipped' | 'failed';
interface StageOutcome {
  state: StageState;
  /// Why it was skipped or how it failed; shown in the job log.
  note?: string;
}

/// Everything the stages hand to each other.
interface PipelineState {
  liveOrigins: string[];
  candidateSubdomains: string[];
  resolved: ResolvedSubdomain[];
  scanIps: string[];
  hostsByIp: Map<string, string>;
  crawledUrls: string[];
}

const STAGE_SCANNER: Partial<Record<PipelineStage, VulnScanner>> = {
  checks: 'SECORA_CHECKS',
  scan: 'NUCLEI',
  content: 'FFUF',
  xss: 'DALFOX',
  ports: 'NAABU',
  resolve: 'SUBFINDER',
};

/// Stages that only consume earlier results. On a resumed job (after a pause)
/// they are skipped when their tool run already completed; the discovery stages
/// always re-run because the later stages need what they find.
const SKIP_WHEN_COMPLETE = new Set<PipelineStage>([
  'checks',
  'scan',
  'content',
  'xss',
  'ports',
]);

const STATIC_ASSET =
  /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|eot|otf|mp[34]|webm|pdf)$/i;
const MAX_LOGGED_DROPS = 10;
/// At most this many re-checks per scan, five per second.
const MAX_VERIFICATIONS = 40;
const VERIFY_DELAY_MS = 200;

@Injectable()
export class PipelineOrchestrator {
  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly spawner: ScannerProcessSpawner,
    private readonly probeStage: PipelineProbeStage,
  ) {}

  // Overridable seams, so the worker specs can run the stages without real
  // sockets, binaries or temp files.
  protected createNativeChecks(): NativeChecks {
    return new NativeChecks();
  }

  protected createScopeGuard(
    rule: ScopeRule,
    options: ScopeGuardOptions,
  ): ScopeGuard {
    return new ScopeGuard(rule, options);
  }

  protected async startProxy(
    guard: ScopeGuard,
    onBlocked: (info: BlockedConnection) => void,
  ): Promise<PinningProxy> {
    const proxy = new PinningProxy({
      pins: () => guard.admittedPins(),
      allowedPorts: () => guard.allowedPorts(),
      allowPrivateTargets: this.allowPrivateTargets(),
      onBlocked,
    });
    await proxy.start();
    return proxy;
  }

  /// Spacing between re-checks (five per second); a seam so specs do not wait.
  protected pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected createFetch(proxyUrl: string): FetchOnce {
    return createProxyFetch(proxyUrl);
  }

  protected writeWordlist(): Promise<{
    path: string;
    cleanup: () => Promise<void>;
  }> {
    return writeWordlistFile();
  }

  private allowPrivateTargets(): boolean {
    return (
      this.configService.get('ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS', {
        infer: true,
      }) === true
    );
  }

  async run(input: PipelineRunInput): Promise<PipelineRunResult> {
    const { host } = input;
    let lost: string | null = null;
    const stopper = new AbortController();
    const signal = AbortSignal.any([input.signal, stopper.signal]);
    const checkAuthorization = async (): Promise<boolean> => {
      if (lost !== null || !host.authorizationLost) return lost === null;
      try {
        lost = await host.authorizationLost();
      } catch {
        // Cannot confirm the authorization still holds: fail closed.
        lost = 'The client authorization could not be re-checked, so the scan was stopped.';
      }
      if (lost !== null) {
        host.log('ERROR', lost);
        stopper.abort();
      }
      return lost === null;
    };
    const watcher = host.authorizationLost
      ? setInterval(() => void checkAuthorization(), this.watchIntervalMs())
      : null;
    watcher?.unref?.();
    try {
      await this.runStages({ ...input, signal }, checkAuthorization);
    } finally {
      if (watcher) clearInterval(watcher);
    }
    return { authorizationLost: lost };
  }

  protected watchIntervalMs(): number {
    return AUTHORIZATION_WATCH_INTERVAL_MS;
  }

  private async runStages(
    input: PipelineRunInput,
    checkAuthorization: () => Promise<boolean>,
  ): Promise<void> {
    const { profile, host, signal } = input;
    const stages = PROFILE_STAGES[profile];
    const targetUrl =
      input.target.type === 'URL' ? safeUrl(input.target.value) : null;
    const guard = this.createScopeGuard(input.rule, {
      allowPrivateTargets: this.allowPrivateTargets(),
      extraPorts: targetUrl?.port ? [Number(targetUrl.port)] : [],
    });
    guard.register(input.pin);

    const state: PipelineState = {
      liveOrigins: [],
      candidateSubdomains: [],
      resolved: [],
      scanIps: [],
      hostsByIp: new Map(),
      crawledUrls: [],
    };

    // Every profile ends with the re-verification stage, which also goes through the proxy.
    const needsProxy = stages.length > 0;
    const blocked = new Map<string, number>();
    let proxy: PinningProxy | null = null;
    try {
      if (needsProxy) {
        proxy = await this.startProxy(guard, (info) => {
          const key = `${info.host}:${info.port ?? ''} ${info.reason}`;
          const count = (blocked.get(key) ?? 0) + 1;
          blocked.set(key, count);
          if (count === 1 && blocked.size <= 25) {
            host.log(
              'WARN',
              `Blocked a request from a tool to ${info.host}${info.port ? `:${info.port}` : ''}: ${info.reason}.`,
            );
          }
        });
      }

      const ctx: StageContext = {
        ...input,
        guard,
        state,
        proxyUrl: proxy?.url ?? null,
        targetUrl,
      };
      for (const stage of stages) {
        if (signal.aborted) break;
        if (!(await checkAuthorization())) break;
        if (await host.shouldStop()) break;
        await this.runStage(stage, ctx);
      }
    } finally {
      await proxy?.close();
      if (blocked.size > 0) {
        const total = [...blocked.values()].reduce((sum, n) => sum + n, 0);
        host.log(
          'INFO',
          `The pinning proxy refused ${total} request(s) to hosts or ports outside this scan's scope.`,
        );
      }
    }
  }

  private async runStage(
    stage: PipelineStage,
    ctx: StageContext,
  ): Promise<void> {
    const { host, signal } = ctx;
    const scanner = STAGE_SCANNER[stage];
    if (
      scanner &&
      SKIP_WHEN_COMPLETE.has(stage) &&
      host.toolRunStatus(scanner) === 'COMPLETED'
    ) {
      host.log(
        'INFO',
        `${formatStageMarker(stage, 'skipped')} (already completed before the job was resumed)`,
      );
      return;
    }

    host.log('INFO', formatStageMarker(stage, 'start'));
    let outcome: StageOutcome;
    try {
      outcome = await this.executeStage(stage, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      outcome = { state: 'failed', note: message };
    }
    // The job itself was cancelled or timed out mid-stage: the caller handles it.
    if (signal.aborted && outcome.state === 'failed') {
      host.log(
        'WARN',
        `Stage "${stage}" stopped: the job was cancelled or timed out.`,
      );
      return;
    }

    host.log(
      outcome.state === 'failed' ? 'ERROR' : 'INFO',
      formatStageMarker(stage, outcome.state) +
        (outcome.note ? ` - ${outcome.note}` : ''),
    );
    if (
      scanner &&
      host.toolRunStatus(scanner) !== 'COMPLETED' &&
      host.toolRunStatus(scanner) !== 'FAILED'
    ) {
      if (outcome.state === 'failed') {
        await host.closeToolRun(
          scanner,
          'FAILED',
          outcome.note ?? 'The stage failed.',
        );
      } else if (outcome.state === 'skipped') {
        await host.closeToolRun(
          scanner,
          'COMPLETED',
          outcome.note ?? 'The stage was skipped.',
        );
      }
    }
  }

  private executeStage(
    stage: PipelineStage,
    ctx: StageContext,
  ): Promise<StageOutcome> {
    switch (stage) {
      case 'recon':
        return this.reconStage(ctx);
      case 'subdomains':
        return this.subdomainsStage(ctx);
      case 'resolve':
        return this.resolveStage(ctx);
      case 'ports':
        return this.portsStage(ctx);
      case 'checks':
        return this.checksStage(ctx);
      case 'crawl':
        return this.crawlStage(ctx);
      case 'scan':
        return this.scanStage(ctx);
      case 'content':
        return this.contentStage(ctx);
      case 'xss':
        return this.xssStage(ctx);
      case 'verify':
        return this.verifyStage(ctx);
    }
  }

  // -------------------------------------------------------------------------
  // Shared helpers
  // -------------------------------------------------------------------------

  /// Starts one catalog tool: log the redacted command, audit it, run it under
  /// the stage time limit. Returns what the spawner returned.
  private async runTool(
    ctx: StageContext,
    stage: PipelineStage,
    tool: CatalogToolId,
    args: string[],
    timeoutSeconds: number,
  ) {
    const bin = this.configService.get(
      `VULN_TOOL_BIN_${tool.toUpperCase()}` as 'VULN_TOOL_BIN_KATANA',
      { infer: true },
    );
    ctx.host.log('INFO', `$ ${bin} ${redactArgv(args).join(' ')}`);
    ctx.host.audit({ tool, command: bin, argv: args }, stage);
    const stageSignal = AbortSignal.any([
      ctx.signal,
      AbortSignal.timeout(timeoutSeconds * 1000),
    ]);
    const result = await this.spawner.spawn({
      command: bin,
      args,
      signal: stageSignal,
      onStderrLine: (line) =>
        ctx.host.log(
          /\b(ERR|FTL|WRN|error|fatal)\b/i.test(line) ? 'WARN' : 'DEBUG',
          line,
        ),
    });
    if (result.stdoutTruncated) {
      ctx.host.log(
        'WARN',
        `${tool} printed more output than is kept; the rest was dropped.`,
      );
    }
    if (result.timedOut) {
      ctx.host.log(
        'WARN',
        `${tool} reached its ${timeoutSeconds}s limit; the results below are partial.`,
      );
    }
    return result;
  }

  /// Applies the same checks to a list of URLs a tool reported. Out-of-scope,
  /// private, off-port and malformed ones are dropped and logged.
  private async admitUrls(
    ctx: StageContext,
    urls: string[],
    label: string,
  ): Promise<string[]> {
    const admitted: string[] = [];
    const seen = new Set<string>();
    let dropped = 0;
    for (const raw of urls) {
      const result = await ctx.guard.admitUrl(raw);
      if (!result.ok) {
        dropped += 1;
        if (dropped <= MAX_LOGGED_DROPS)
          ctx.host.log(
            'WARN',
            `${label}: dropped ${shorten(raw)} - ${result.detail}`,
          );
        continue;
      }
      if (result.pin.host !== ctx.pin.host) {
        dropped += 1;
        if (dropped <= MAX_LOGGED_DROPS) {
          ctx.host.log(
            'WARN',
            `${label}: dropped ${shorten(raw)} - it is not on the crawl target (${ctx.pin.host}).`,
          );
        }
        continue;
      }
      if (seen.has(result.url)) continue;
      seen.add(result.url);
      admitted.push(result.url);
    }
    if (dropped > MAX_LOGGED_DROPS) {
      ctx.host.log(
        'WARN',
        `${label}: ${dropped - MAX_LOGGED_DROPS} more dropped URL(s) not listed.`,
      );
    }
    return admitted;
  }

  private preferredOrigin(origins: string[]): string | null {
    return (
      origins.find((origin) => origin.startsWith('https://')) ??
      origins[0] ??
      null
    );
  }

  // -------------------------------------------------------------------------
  // Stages
  // -------------------------------------------------------------------------

  private async reconStage(ctx: StageContext): Promise<StageOutcome> {
    // The existing httpx probe writes its own start/done markers; this stage
    // wraps it so a failure is reported like any other stage.
    const probe = await this.probeStage.run({
      pin: ctx.pin,
      signal: ctx.signal,
      rule: ctx.rule,
      url: ctx.targetUrl ? ctx.target.value : undefined,
      onLog: (level, message) => {
        if (!message.startsWith('[stage] recon')) ctx.host.log(level, message);
      },
      onCommand: (info) => ctx.host.audit(info, 'recon'),
    });
    ctx.state.liveOrigins = probe.liveUrls;
    if (probe.outcome === 'TIMED_OUT')
      return { state: 'failed', note: 'the probe timed out' };
    if (probe.liveUrls.length === 0) {
      return {
        state: 'skipped',
        note: 'no live web service was found on the host',
      };
    }
    return { state: 'done', note: `${probe.liveUrls.length} live origin(s)` };
  }

  private async subdomainsStage(ctx: StageContext): Promise<StageOutcome> {
    if (!ctx.rule.includeSubdomains) {
      return {
        state: 'skipped',
        note: `ownership was verified for ${ctx.rule.root} only (file or meta-tag method), so its subdomains are not scanned; verify the domain with a DNS TXT record to include them`,
      };
    }
    const result = await this.runTool(
      ctx,
      'subdomains',
      'subfinder',
      buildSubfinderArgs({ domain: ctx.rule.root }),
      SUBFINDER_STAGE_TIMEOUT_SECONDS,
    );
    const found = parseSubfinderLines(result.stdout);
    const split = partitionByScope(found, ctx.rule);
    for (const skipped of split.skipped.slice(0, MAX_LOGGED_DROPS)) {
      ctx.host.log(
        'WARN',
        `Subdomains: dropped ${skipped.host} - outside the verified scope.`,
      );
    }
    const candidates = split.inScope
      .filter((name) => name !== ctx.pin.host)
      .slice(0, SUBFINDER_MAX_RESULTS);
    ctx.state.candidateSubdomains = candidates;
    ctx.host.log(
      'INFO',
      `Subdomains: ${candidates.length} in scope, ${split.skipped.length} dropped.`,
    );
    if (result.timedOut)
      return {
        state: 'failed',
        note: `partial: ${candidates.length} subdomain(s) found before the time limit`,
      };
    if (candidates.length === 0)
      return { state: 'skipped', note: 'no subdomains found' };
    return { state: 'done', note: `${candidates.length} subdomain(s)` };
  }

  private async resolveStage(ctx: StageContext): Promise<StageOutcome> {
    const { state, guard } = ctx;
    const resolved: ResolvedSubdomain[] = [];
    if (state.candidateSubdomains.length > 0) {
      const hosts = state.candidateSubdomains.slice(0, DNSX_MAX_HOSTS);
      const result = await this.runTool(
        ctx,
        'resolve',
        'dnsx',
        buildDnsxArgs({ hosts }),
        DNSX_STAGE_TIMEOUT_SECONDS,
      );
      for (const record of parseDnsxJsonl(result.stdout)) {
        if (!hosts.includes(record.host)) continue; // an answer for a name we did not ask about
        if (!guard.isInScope(record.host)) {
          ctx.host.log(
            'WARN',
            `Resolve: dropped ${record.host} - outside the verified scope.`,
          );
          continue;
        }
        const addresses = [...record.a, ...record.aaaa];
        if (addresses.length === 0) continue;
        const bad = addresses.find((address) => !guard.admitIp(address).ok);
        if (bad !== undefined || record.hasInternalIps) {
          ctx.host.log(
            'WARN',
            `Resolve: dropped ${record.host} - it resolves to a private or reserved address (${bad ?? 'internal'}).`,
          );
          continue;
        }
        resolved.push({ host: record.host, addresses });
      }
      if (result.timedOut)
        ctx.host.log(
          'WARN',
          'Resolve: stopped at the time limit; the names resolved so far are kept.',
        );
    }
    state.resolved = resolved;

    // Addresses the port scan may touch: the target's own and every resolved
    // subdomain's, public IPv4 only, never an address the guard did not admit.
    const ips = new Map<string, string>();
    const consider = (ip: string, host: string) => {
      if (
        ctx.guard.admitIp(ip).ok &&
        /^\d+\.\d+\.\d+\.\d+$/.test(ip) &&
        !ips.has(ip)
      )
        ips.set(ip, host);
    };
    consider(ctx.pin.ip, ctx.pin.host);
    for (const entry of resolved)
      for (const address of entry.addresses) consider(address, entry.host);
    state.scanIps = [...ips.keys()].slice(0, NAABU_MAX_IPS);
    state.hostsByIp = new Map(
      state.scanIps.map((ip) => [ip, ips.get(ip) ?? ip]),
    );
    if (ips.size > NAABU_MAX_IPS) {
      ctx.host.log(
        'WARN',
        `Resolve: ${ips.size - NAABU_MAX_IPS} address(es) beyond the first ${NAABU_MAX_IPS} will not be port-scanned.`,
      );
    }

    const findings = normalizeSubdomains(resolved);
    await ctx.host.persist('SUBFINDER', {
      findings,
      raw: resolved
        .map((entry) => `${entry.host} ${entry.addresses.join(',')}`)
        .join('\n'),
    });
    return resolved.length === 0 && state.candidateSubdomains.length === 0
      ? { state: 'skipped', note: 'nothing to resolve' }
      : {
          state: 'done',
          note: `${resolved.length} subdomain(s) resolve to public addresses`,
        };
  }

  private async portsStage(ctx: StageContext): Promise<StageOutcome> {
    const ips = ctx.state.scanIps;
    if (ips.length === 0)
      return { state: 'skipped', note: 'no public IPv4 address to scan' };
    const result = await this.runTool(
      ctx,
      'ports',
      'naabu',
      buildNaabuArgs({ ips }),
      NAABU_STAGE_TIMEOUT_SECONDS,
    );
    // A scanner must only report addresses it was given.
    const records = parseNaabuJsonl(result.stdout).filter((record) =>
      ips.includes(record.ip),
    );
    const findings = normalizeNaabu(records, ctx.state.hostsByIp);
    await ctx.host.persist('NAABU', { findings, raw: result.stdout });
    if (result.timedOut)
      return {
        state: 'failed',
        note: `partial: ${records.length} open port(s) found before the time limit`,
      };
    return {
      state: 'done',
      note: `${records.length} open port(s) on ${ips.length} address(es)`,
    };
  }

  private async checksStage(ctx: StageContext): Promise<StageOutcome> {
    const origins =
      ctx.state.liveOrigins.length > 0
        ? ctx.state.liveOrigins
        : this.defaultOrigins(ctx);
    // httpx may have answered for a name that is not the target host; only the
    // pinned host is checked.
    const onTarget = origins.filter(
      (origin) => safeUrl(origin)?.hostname === ctx.pin.host,
    );
    const result = await this.createNativeChecks().run({
      pin: ctx.pin,
      origins: onTarget,
      signal: ctx.signal,
      onLog: (level, message) => ctx.host.log(level, message),
    });
    await ctx.host.persist('SECORA_CHECKS', {
      findings: result.findings,
      raw: result.raw,
    });
    if (result.reachable.length === 0) {
      return {
        state: 'failed',
        note: 'the host did not answer on any web port',
      };
    }
    return {
      state: 'done',
      note: `${result.findings.length} finding(s) on ${result.reachable.length} origin(s)`,
    };
  }

  /// The origins to check when no probe ran (QUICK): the target URL's own
  /// origin, or https and http for a bare host.
  private defaultOrigins(ctx: StageContext): string[] {
    if (ctx.targetUrl) {
      const url = ctx.targetUrl;
      const origins = [url.origin];
      if (!url.port)
        origins.push(
          url.protocol === 'https:'
            ? `http://${url.host}`
            : `https://${url.host}`,
        );
      return origins;
    }
    return [`https://${ctx.pin.host}`, `http://${ctx.pin.host}`];
  }

  private async crawlStage(ctx: StageContext): Promise<StageOutcome> {
    const proxyUrl = ctx.proxyUrl;
    if (!proxyUrl)
      return { state: 'failed', note: 'the pinning proxy is not running' };
    const origins = ctx.state.liveOrigins
      .filter((origin) => safeUrl(origin)?.hostname === ctx.pin.host)
      .slice(0, 2);
    if (origins.length === 0)
      return { state: 'skipped', note: 'no live origin to crawl' };

    const discovered: string[] = [...origins];
    let timedOut = false;
    for (const origin of origins) {
      if (ctx.signal.aborted) break;
      const result = await this.runTool(
        ctx,
        'crawl',
        'katana',
        buildKatanaArgs({ url: origin, proxyUrl }),
        KATANA_STAGE_TIMEOUT_SECONDS,
      );
      timedOut ||= result.timedOut;
      for (const record of parseKatanaJsonl(result.stdout))
        discovered.push(record.url);
    }
    const admitted = await this.admitUrls(ctx, discovered, 'Crawl');
    ctx.state.crawledUrls = admitted.slice(0, KATANA_MAX_URLS);
    const withParams = ctx.state.crawledUrls.filter(
      (url) => safeUrl(url)?.search,
    ).length;
    ctx.host.log(
      'INFO',
      `Crawl: ${ctx.state.crawledUrls.length} URL(s) in scope (${withParams} with query parameters)` +
        (admitted.length > KATANA_MAX_URLS
          ? `, capped at ${KATANA_MAX_URLS}`
          : '') +
        '.',
    );
    if (timedOut)
      return {
        state: 'failed',
        note: 'partial: the crawl reached its time limit',
      };
    return { state: 'done', note: `${ctx.state.crawledUrls.length} URL(s)` };
  }

  private async scanStage(ctx: StageContext): Promise<StageOutcome> {
    if (ctx.profile === 'QUICK')
      return { state: 'skipped', note: 'the QUICK profile runs no scanner' };
    if (ctx.state.liveOrigins.length === 0) {
      return {
        state: 'skipped',
        note: 'no live web service was found, so there is nothing to scan',
      };
    }
    // Crawled pages and API URLs; static assets are not worth template runs.
    const crawled = ctx.state.crawledUrls.filter((url) => {
      const parsed = safeUrl(url);
      return (
        parsed !== null &&
        parsed.hostname === ctx.pin.host &&
        !STATIC_ASSET.test(parsed.pathname)
      );
    });
    // One spelling per URL ("https://x" and "https://x/" are the same page).
    const urls = [
      ...new Set(
        [
          ...ctx.state.liveOrigins.filter(
            (o) => safeUrl(o)?.hostname === ctx.pin.host,
          ),
          ...crawled,
        ].map(normalizeUrl),
      ),
    ].slice(0, KATANA_MAX_URLS);
    ctx.host.log('INFO', `Scan: running templates on ${urls.length} URL(s).`);
    const result = await ctx.host.runNuclei({
      profile: ctx.profile,
      pin: ctx.pin,
      urls,
      proxyUrl: ctx.proxyUrl,
      signal: ctx.signal,
    });
    if (result.failed)
      return { state: 'failed', note: result.message ?? 'nuclei failed' };
    if (result.partial)
      return {
        state: 'failed',
        note: 'partial: the scan reached its time limit',
      };
    return { state: 'done' };
  }

  private async contentStage(ctx: StageContext): Promise<StageOutcome> {
    const proxyUrl = ctx.proxyUrl;
    if (!proxyUrl)
      return { state: 'failed', note: 'the pinning proxy is not running' };
    const origin = this.preferredOrigin(
      ctx.state.liveOrigins.filter(
        (o) => safeUrl(o)?.hostname === ctx.pin.host,
      ),
    );
    if (!origin)
      return { state: 'skipped', note: 'no live origin on the verified host' };

    const wordlist = await this.writeWordlist();
    try {
      const result = await this.runTool(
        ctx,
        'content',
        'ffuf',
        buildFfufArgs({ origin, wordlistPath: wordlist.path, proxyUrl }),
        FFUF_STAGE_TIMEOUT_SECONDS,
      );
      if (
        !result.timedOut &&
        result.exitCode !== 0 &&
        result.stdout.trim() === ''
      ) {
        throw new Error(`ffuf exited with status ${result.exitCode}`);
      }
      const records = parseFfufJsonl(result.stdout);
      // Every URL ffuf reports must still be on the verified host.
      const admitted = await this.admitUrls(
        ctx,
        records.map((record) => record.url),
        'Content discovery',
      );
      const findings = normalizeFfuf(
        records.filter((record) => admitted.includes(normalizeUrl(record.url))),
      );
      await ctx.host.persist('FFUF', { findings, raw: result.stdout });
      if (result.timedOut)
        return {
          state: 'failed',
          note: `partial: ${findings.length} path(s) found before the time limit`,
        };
      return { state: 'done', note: `${findings.length} path(s)` };
    } finally {
      await wordlist.cleanup();
    }
  }

  /// Re-checks findings of four classes (exposed file, missing header, open
  /// redirect, reflected XSS marker) with one GET each through the pinning
  /// proxy. See reverify.ts for what each check sends. Only a reproduced result
  /// makes a finding CONFIRMED; severity is never touched.
  private async verifyStage(ctx: StageContext): Promise<StageOutcome> {
    const proxyUrl = ctx.proxyUrl;
    if (!proxyUrl) return { state: 'failed', note: 'the pinning proxy is not running' };
    const findings = await ctx.host.listFindings();
    const plans = findings
      .map((finding) => planVerification(finding))
      .filter((plan): plan is NonNullable<typeof plan> => plan !== null)
      .slice(0, MAX_VERIFICATIONS);
    if (plans.length === 0) return { state: 'skipped', note: 'no finding is of a class that can be re-checked safely' };

    const verifyContext = createVerifyContext(this.createFetch(proxyUrl));
    let reproduced = 0;
    let checked = 0;
    for (const plan of plans) {
      if (ctx.signal.aborted) break;
      const admitted = await ctx.guard.admitUrl(plan.url);
      const outcome: VerificationOutcome = admitted.ok
        ? await verifyFinding(plan, verifyContext)
        : {
            status: 'FAILED',
            method: plan.kind,
            checkedAt: new Date().toISOString(),
            detail: `Not re-checked: ${admitted.detail}`,
          };
      if (admitted.ok) {
        ctx.host.audit({ tool: 'secora-verify', command: 'internal', argv: ['GET', plan.kind, plan.url] }, 'verify');
        checked += 1;
      }
      if (outcome.status === 'REPRODUCED') reproduced += 1;
      ctx.host.log('INFO', `Verify: ${plan.kind} ${shorten(redactSecrets(plan.url))} -> ${outcome.status}`);
      await ctx.host.recordVerification(plan.findingId, outcome);
      await this.pause(VERIFY_DELAY_MS);
    }
    return { state: 'done', note: `${checked} re-checked, ${reproduced} reproduced` };
  }

  private async xssStage(ctx: StageContext): Promise<StageOutcome> {
    const proxyUrl = ctx.proxyUrl;
    if (!proxyUrl)
      return { state: 'failed', note: 'the pinning proxy is not running' };
    const urls = ctx.state.crawledUrls
      .filter((url) => {
        const parsed = safeUrl(url);
        return (
          parsed !== null &&
          parsed.hostname === ctx.pin.host &&
          parsed.search !== '' &&
          !STATIC_ASSET.test(parsed.pathname)
        );
      })
      .slice(0, DALFOX_MAX_URLS);
    if (urls.length === 0) {
      return {
        state: 'skipped',
        note: 'the crawl found no URL with query parameters on the verified host',
      };
    }
    const result = await this.runTool(
      ctx,
      'xss',
      'dalfox',
      buildDalfoxArgs({ urls, proxyUrl }),
      DALFOX_STAGE_TIMEOUT_SECONDS,
    );
    // dalfox exits with status 1 when it reports a finding; that is not a failure.
    const records = parseDalfoxJsonl(result.stdout);
    if (
      !result.timedOut &&
      result.exitCode !== 0 &&
      result.exitCode !== 1 &&
      records.length === 0
    ) {
      throw new Error(`dalfox exited with status ${result.exitCode}`);
    }
    const findings = normalizeDalfox(records);
    await ctx.host.persist('DALFOX', { findings, raw: result.stdout });
    if (result.timedOut)
      return {
        state: 'failed',
        note: `partial: ${findings.length} finding(s) before the time limit`,
      };
    return {
      state: 'done',
      note: `${findings.length} finding(s) on ${urls.length} URL(s)`,
    };
  }
}

interface StageContext extends PipelineRunInput {
  guard: ScopeGuard;
  state: PipelineState;
  proxyUrl: string | null;
  targetUrl: URL | null;
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeUrl(value: string): string {
  const parsed = safeUrl(value);
  if (!parsed) return value;
  parsed.hash = '';
  return parsed.toString();
}

function shorten(value: string): string {
  return value.length > 120 ? `${value.slice(0, 120)}…` : value;
}
