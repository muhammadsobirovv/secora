import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { PipelineStage } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { VulnScanner } from '../../../prisma-types.js';
import type { VulnFindingInput } from '../scanner-runners/normalizers/normalizer.interface.js';
import type {
  ScannerProcessSpawner,
  SpawnScannerProcessOptions,
} from '../scanner-runners/process/spawn-scanner-process.util.js';
import type {
  NativeChecks,
  NativeChecksInput,
} from './checks/native-checks.js';
import {
  DALFOX_RECORDED_VULNERABLE,
  FFUF_RECORDED,
  KATANA_RECORDED,
  NAABU_RECORDED,
} from './fixtures/recorded-stage3.js';
import type { PinnedHost, AddressLookup } from './pin.util.js';
import type { PinningProxy, BlockedConnection } from './pinning-proxy.js';
import type { FetchOnce, VerificationOutcome, VerifiableFinding } from './reverify.js';
import {
  PipelineOrchestrator,
  type PipelineHost,
  type PipelineRunInput,
} from './pipeline-orchestrator.service.js';
import type { PipelineProbeStage } from './probe-stage.service.js';
import { ScopeGuard, type ScopeGuardOptions } from './scope-guard.js';
import type { ScopeRule } from './scope.util.js';
import { makeFinding } from './stage-findings.js';
import { ToolUnavailableError } from './tool-preflight.js';

const PUBLIC_IP = '93.184.216.34';
const pin: PinnedHost = { host: 'shop.example.org', ip: PUBLIC_IP, family: 4 };
const APEX: ScopeRule = { root: 'shop.example.org', includeSubdomains: true };
const HOST_ONLY: ScopeRule = {
  root: 'shop.example.org',
  includeSubdomains: false,
};

const dnsTable: Record<string, { address: string; family: number }[]> = {
  'shop.example.org': [{ address: PUBLIC_IP, family: 4 }],
  'www.shop.example.org': [{ address: PUBLIC_IP, family: 4 }],
  'api.shop.example.org': [{ address: '93.184.216.35', family: 4 }],
  'internal.shop.example.org': [{ address: '10.0.0.5', family: 4 }],
  'rebind.shop.example.org': [{ address: '93.184.216.36', family: 4 }],
  'evil.test': [{ address: '93.184.216.99', family: 4 }],
};

const katanaLine = (url: string) =>
  JSON.stringify({
    request: { method: 'GET', endpoint: url },
    response: { status_code: 200 },
  });
const dnsxLine = (host: string, a: string[], internal = false) =>
  JSON.stringify({
    host,
    a,
    aaaa: [],
    has_internal_ips: internal,
    status_code: 'NOERROR',
  });

interface Scenario {
  findings?: VerifiableFinding[];
  fetch?: FetchOnce;
  rule?: ScopeRule;
  profile?: 'QUICK' | 'STANDARD' | 'DEEP';
  liveUrls?: string[];
  tools?: Record<
    string,
    (
      options: SpawnScannerProcessOptions,
    ) =>
      { stdout?: string; exitCode?: number | null; timedOut?: boolean } | Error
  >;
  checksFindings?: VulnFindingInput[];
  checksReachable?: string[];
  toolRunStatus?: Record<string, string>;
  nuclei?: { failed?: boolean; partial?: boolean };
  signal?: AbortSignal;
  stopAfterStages?: number;
  target?: PipelineRunInput['target'];
  allowPrivate?: boolean;
  lookup?: AddressLookup;
  /// Client-engagement scans: why the authorization is gone, or null while it holds.
  authorizationLost?: () => Promise<string | null>;
  /// The nuclei stage blocks until the scan's own signal is aborted.
  nucleiWaitsForAbort?: boolean;
  /// The probe (httpx) cannot run at all, e.g. the binary is missing.
  probeError?: Error;
  /// A tool of the pipeline (by binary name) that is missing.
  missingTools?: string[];
}

function build(scenario: Scenario = {}) {
  const logs: { level: string; message: string }[] = [];
  const audits: { tool: string; argv: string[]; stage: PipelineStage }[] = [];
  const persisted: {
    scanner: VulnScanner;
    findings: VulnFindingInput[];
    raw: string;
  }[] = [];
  const closed: { scanner: VulnScanner; outcome: string; message: string }[] =
    [];
  const nucleiCalls: { urls: string[]; profile: string }[] = [];
  const statuses = new Map<string, string>(
    Object.entries(scenario.toolRunStatus ?? {}),
  );
  let stagesStarted = 0;
  const verifications: ({ findingId: string } & VerificationOutcome)[] = [];

  const host: PipelineHost = {
    log: (level, message) => {
      logs.push({ level, message });
      if (/^\[stage\] \w+ start$/.test(message)) stagesStarted += 1;
    },
    audit: (info, stage) =>
      audits.push({ tool: info.tool, argv: info.argv, stage }),
    persist: async (scanner, result) => {
      persisted.push({ scanner, ...result });
      statuses.set(scanner, 'COMPLETED');
    },
    closeToolRun: async (scanner, outcome, message) => {
      closed.push({ scanner, outcome, message });
      statuses.set(scanner, outcome);
    },
    toolRunStatus: (scanner) => statuses.get(scanner) ?? 'PENDING',
    listFindings: async () => scenario.findings ?? [],
    recordVerification: async (findingId, outcome) => {
      verifications.push({ findingId, ...outcome });
    },
    ...(scenario.authorizationLost ? { authorizationLost: scenario.authorizationLost } : {}),
    runNuclei: async (input) => {
      nucleiCalls.push({ urls: input.urls, profile: input.profile });
      if (scenario.nucleiWaitsForAbort) {
        await new Promise<void>((resolve) => {
          if (input.signal.aborted) resolve();
          input.signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return { failed: true, partial: false, message: 'aborted' };
      }
      statuses.set('NUCLEI', 'COMPLETED');
      return {
        failed: scenario.nuclei?.failed ?? false,
        partial: scenario.nuclei?.partial ?? false,
        message: scenario.nuclei?.failed ? 'nuclei crashed' : null,
      };
    },
    shouldStop: async () =>
      scenario.stopAfterStages !== undefined &&
      stagesStarted >= scenario.stopAfterStages,
  };

  const spawned: { tool: string; options: SpawnScannerProcessOptions }[] = [];
  const spawner = {
    spawn: jest.fn(async (options: SpawnScannerProcessOptions) => {
      const tool = options.command.split('/').pop() ?? options.command;
      spawned.push({ tool, options });
      if (scenario.missingTools?.includes(tool)) throw new ToolUnavailableError(tool, 'not found');
      const handler = scenario.tools?.[tool];
      const out = handler ? handler(options) : { stdout: '' };
      if (out instanceof Error) throw out;
      return {
        exitCode: out.exitCode ?? 0,
        stdout: out.stdout ?? '',
        timedOut: out.timedOut ?? false,
      };
    }),
  } as unknown as ScannerProcessSpawner;

  const probe = {
    run: jest.fn(
      async (input: {
        onCommand?: (i: {
          tool: string;
          command: string;
          argv: string[];
        }) => void;
      }) => {
        if (scenario.probeError) throw scenario.probeError;
        input.onCommand?.({
          tool: 'httpx',
          command: '/bin/httpx',
          argv: ['-u', 'http://93.184.216.34'],
        });
        return {
          outcome: 'OK' as const,
          liveUrls: scenario.liveUrls ?? ['https://shop.example.org'],
        };
      },
    ),
  } as unknown as PipelineProbeStage;

  const config = {
    get: (key: string) =>
      key === 'ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS'
        ? (scenario.allowPrivate ?? false)
        : key.startsWith('VULN_TOOL_BIN_')
          ? `/bin/${key.replace('VULN_TOOL_BIN_', '').toLowerCase()}`
          : undefined,
  } as unknown as ConfigService<EnvConfig, true>;

  const proxyInstance = {
    url: 'http://127.0.0.1:45678',
    close: jest.fn(async () => undefined),
  };
  const blockedCallbacks: ((info: BlockedConnection) => void)[] = [];
  let guardRef: ScopeGuard | undefined;
  const checksRun = jest.fn(async (input: NativeChecksInput) => ({
    findings: scenario.checksFindings ?? [
      makeFinding({
        title: 'Missing CSP',
        description: 'd',
        severity: 'LOW',
        vulnType: 'header-csp-missing',
        signature: 'sig',
        path: '/',
        matchedAt: input.origins[0] ?? '',
        remediation: 'fix',
      }),
    ],
    reachable: scenario.checksReachable ?? input.origins.slice(0, 1),
    raw: 'raw checks output',
  }));
  const wordlistCleanup = jest.fn(async () => undefined);
  const lookupAddresses: AddressLookup =
    scenario.lookup ?? (async (name) => dnsTable[name] ?? []);

  class TestOrchestrator extends PipelineOrchestrator {
    protected override createNativeChecks(): NativeChecks {
      return { run: checksRun } as unknown as NativeChecks;
    }
    protected override createScopeGuard(
      rule: ScopeRule,
      options: ScopeGuardOptions,
    ): ScopeGuard {
      guardRef = new ScopeGuard(rule, { ...options, lookupAddresses });
      return guardRef;
    }
    protected override async startProxy(
      _guard: ScopeGuard,
      onBlocked: (info: BlockedConnection) => void,
    ): Promise<PinningProxy> {
      blockedCallbacks.push(onBlocked);
      return proxyInstance as unknown as PinningProxy;
    }
    protected override pause(): Promise<void> {
      return Promise.resolve();
    }
    protected override watchIntervalMs(): number {
      return 10;
    }
    protected override createFetch(): FetchOnce {
      return scenario.fetch ?? (async () => ({ status: 200, headers: {}, body: '' }));
    }
    protected override writeWordlist() {
      return Promise.resolve({
        path: '/tmp/secora-wordlist-x/words.txt',
        cleanup: wordlistCleanup,
      });
    }
  }
  const orchestrator = new TestOrchestrator(config, spawner, probe);

  const run = (
    profile: 'QUICK' | 'STANDARD' | 'DEEP' = scenario.profile ?? 'STANDARD',
  ) =>
    orchestrator.run({
      profile,
      target: scenario.target ?? {
        id: 't1',
        type: 'DOMAIN',
        value: 'shop.example.org',
      },
      rule: scenario.rule ?? HOST_ONLY,
      pin,
      signal: scenario.signal ?? new AbortController().signal,
      host,
    });

  const messages = () => logs.map((entry) => entry.message);
  const markers = () =>
    messages()
      .filter((message) => message.startsWith('[stage]'))
      .map((m) => m.split(' - ')[0]);
  return {
    run,
    logs,
    messages,
    markers,
    audits,
    persisted,
    closed,
    nucleiCalls,
    spawned,
    proxyInstance,
    verifications,
    blockedCallbacks,
    checksRun,
    wordlistCleanup,
    probe,
    guard: () => guardRef,
  };
}

describe('PipelineOrchestrator — QUICK', () => {
  it('runs only the native checks, with no external binary', async () => {
    const h = build({ profile: 'QUICK' });
    await h.run('QUICK');

    expect(h.markers()).toEqual([
      '[stage] checks start',
      '[stage] checks done',
      '[stage] verify start',
      '[stage] verify skipped',
    ]);
    expect(h.spawned).toEqual([]);
    expect(h.probe.run).not.toHaveBeenCalled();
    expect(h.persisted.map((entry) => entry.scanner)).toEqual([
      'SECORA_CHECKS',
    ]);
    expect(h.checksRun.mock.calls[0][0].origins).toEqual([
      'https://shop.example.org',
      'http://shop.example.org',
    ]);
    expect(h.nucleiCalls).toEqual([]);
  });

  it('uses the origin of a URL target as given, including its port', async () => {
    const h = build({
      profile: 'QUICK',
      target: {
        id: 't1',
        type: 'URL',
        value: 'http://shop.example.org:8443/app',
      },
    });
    await h.run('QUICK');
    expect(h.checksRun.mock.calls[0][0].origins).toEqual([
      'http://shop.example.org:8443',
    ]);
  });

  it('a host that answers nothing marks the stage failed, and the scan is not killed', async () => {
    const h = build({ profile: 'QUICK', checksReachable: [] });
    await h.run('QUICK');
    expect(h.markers()).toEqual([
      '[stage] checks start',
      '[stage] checks failed',
      '[stage] verify start',
      '[stage] verify skipped',
    ]);
  });
});

describe('PipelineOrchestrator — STANDARD', () => {
  const crawl = (urls: string[]) => (_: SpawnScannerProcessOptions) => ({
    stdout: urls.map(katanaLine).join('\n'),
  });

  it('recon -> checks -> crawl -> scan, nuclei on the crawled URLs only', async () => {
    const h = build({
      tools: {
        katana: crawl([
          'https://shop.example.org/',
          'https://shop.example.org/products?id=3',
          'https://shop.example.org/app.js',
          'https://shop.example.org/api/users',
        ]),
      },
    });
    await h.run('STANDARD');

    expect(h.markers()).toEqual([
      '[stage] recon start',
      '[stage] recon done',
      '[stage] checks start',
      '[stage] checks done',
      '[stage] crawl start',
      '[stage] crawl done',
      '[stage] scan start',
      '[stage] scan done',
      '[stage] verify start',
      '[stage] verify skipped',
    ]);
    expect(h.nucleiCalls).toHaveLength(1);
    expect(h.nucleiCalls[0].profile).toBe('STANDARD');
    // The origin, the page and the API URL; the script is a static asset.
    expect(h.nucleiCalls[0].urls.sort()).toEqual(
      [
        'https://shop.example.org/',
        'https://shop.example.org/api/users',
        'https://shop.example.org/products?id=3',
      ].sort(),
    );
    expect(h.proxyInstance.close).toHaveBeenCalledTimes(1);
  });

  it('starts katana through the proxy with the catalog argv and audits the command', async () => {
    const h = build({
      tools: { katana: crawl(['https://shop.example.org/']) },
    });
    await h.run('STANDARD');
    const katana = h.spawned.find((call) => call.tool === 'katana');
    expect(katana?.options.args).toEqual(
      expect.arrayContaining([
        '-proxy',
        'http://127.0.0.1:45678',
        '-fs',
        'fqdn',
        '-dr',
      ]),
    );
    expect(h.audits.map((entry) => `${entry.stage}:${entry.tool}`)).toEqual([
      'recon:httpx',
      'crawl:katana',
    ]);
  });

  it('re-validates every discovered URL: other hosts, private IPs, odd ports, IP literals and redirects are dropped', async () => {
    const h = build({
      tools: {
        katana: crawl([
          'https://shop.example.org/ok?x=1',
          'https://evil.test/phish', // another host
          'http://127.0.0.1/admin', // IP literal
          'http://169.254.169.254/latest/meta-data', // cloud metadata
          'https://shop.example.org:6379/', // port not allowed
          'https://internal.shop.example.org/', // subdomain of a host-only verification
          'ftp://shop.example.org/file',
          'https://user:pw@shop.example.org/',
          'https://shop.example.org/ok?x=1', // duplicate
        ]),
      },
    });
    await h.run('STANDARD');

    expect(h.nucleiCalls[0].urls.sort()).toEqual(
      ['https://shop.example.org/', 'https://shop.example.org/ok?x=1'].sort(),
    );
    const drops = h
      .messages()
      .filter((message) => message.startsWith('Crawl: dropped'));
    expect(drops.length).toBe(7);
    expect(drops.join('\n')).toContain('evil.test');
    expect(drops.join('\n')).toContain('169.254.169.254');
    expect(drops.join('\n')).toContain('Port 6379');
  });

  it('DNS rebinding: a host that resolves to a private address is dropped even when it is in scope', async () => {
    const h = build({
      rule: APEX,
      tools: {
        katana: crawl([
          'https://internal.shop.example.org/admin',
          'https://shop.example.org/home',
        ]),
      },
    });
    await h.run('STANDARD');
    expect(h.nucleiCalls[0].urls).not.toContain(
      'https://internal.shop.example.org/admin',
    );
    expect(
      h
        .messages()
        .some(
          (m) =>
            m.includes('internal.shop.example.org') && m.includes('private'),
        ),
    ).toBe(true);
  });

  it('a subdomain URL under a DNS-verified apex is admitted by the guard but never crawled or scanned (different host)', async () => {
    const h = build({
      rule: APEX,
      tools: {
        katana: crawl([
          'https://www.shop.example.org/page',
          'https://shop.example.org/page',
        ]),
      },
    });
    await h.run('STANDARD');
    expect(h.nucleiCalls[0].urls).toEqual(
      expect.arrayContaining(['https://shop.example.org/page']),
    );
    expect(h.nucleiCalls[0].urls.some((url) => url.includes('www.'))).toBe(
      false,
    );
    expect(
      h.messages().some((m) => m.includes('not on the crawl target')),
    ).toBe(true);
  });

  it('a crawl that fails does not stop the scan: nuclei still runs on the live origin', async () => {
    const h = build({
      tools: { katana: () => new Error('spawn katana ENOENT') },
    });
    await h.run('STANDARD');
    expect(h.markers()).toContain('[stage] crawl failed');
    expect(h.markers()).toContain('[stage] scan done');
    expect(h.nucleiCalls[0].urls).toEqual(['https://shop.example.org/']);
  });

  it('a crawl that times out keeps the URLs found before the limit', async () => {
    const h = build({
      tools: {
        katana: () => ({
          stdout: katanaLine('https://shop.example.org/found'),
          timedOut: true,
          exitCode: null,
        }),
      },
    });
    await h.run('STANDARD');
    expect(h.markers()).toContain('[stage] crawl failed');
    expect(h.messages().some((m) => m.includes('partial'))).toBe(true);
    expect(h.nucleiCalls[0].urls).toContain('https://shop.example.org/found');
  });

  it('nothing live: recon is skipped, the scan has nothing to test, checks still try the host', async () => {
    const h = build({ liveUrls: [], tools: { katana: crawl([]) } });
    await h.run('STANDARD');
    expect(h.markers()).toEqual(
      expect.arrayContaining([
        '[stage] recon skipped',
        '[stage] crawl skipped',
        '[stage] scan skipped',
      ]),
    );
    expect(h.nucleiCalls).toEqual([]);
    expect(h.closed.find((entry) => entry.scanner === 'NUCLEI')).toMatchObject({
      outcome: 'COMPLETED',
    });
  });

  it('a nuclei failure or time limit is reported and does not throw', async () => {
    const failed = build({ nuclei: { failed: true } });
    await expect(failed.run('STANDARD')).resolves.toMatchObject({ authorizationLost: null });
    expect(failed.markers()).toContain('[stage] scan failed');

    const partial = build({ nuclei: { partial: true } });
    await partial.run('STANDARD');
    expect(partial.markers()).toContain('[stage] scan failed');
  });

  it('logs requests the proxy refused, once per destination', async () => {
    const h = build({
      tools: { katana: crawl(['https://shop.example.org/']) },
    });
    const running = h.run('STANDARD');
    await running;
    h.blockedCallbacks[0]({
      host: 'burpsuite',
      port: 80,
      reason: 'host not admitted for this scan',
    });
    h.blockedCallbacks[0]({
      host: 'burpsuite',
      port: 80,
      reason: 'host not admitted for this scan',
    });
    expect(
      h
        .messages()
        .filter((m) =>
          m.startsWith('Blocked a request from a tool to burpsuite:80'),
        ),
    ).toHaveLength(1);
  });
});

describe('PipelineOrchestrator — DEEP', () => {
  const deepTools = {
    katana: () => ({
      stdout: [
        'https://shop.example.org/',
        'https://shop.example.org/search?q=test',
        'https://shop.example.org/item?id=7&ref=a',
        'https://shop.example.org/static/app.js?v=3',
        'https://evil.test/x?y=1',
      ]
        .map(katanaLine)
        .join('\n'),
    }),
    subfinder: () => ({
      stdout: [
        'api.shop.example.org',
        'www.shop.example.org',
        'internal.shop.example.org',
        'evilshop.example.org',
        'mail.other.com',
        'shop.example.org',
      ].join('\n'),
    }),
    dnsx: (options: SpawnScannerProcessOptions) => {
      const hosts = (options.args[options.args.indexOf('-l') + 1] ?? '').split(
        ',',
      );
      return {
        stdout: [
          hosts.includes('api.shop.example.org')
            ? dnsxLine('api.shop.example.org', ['93.184.216.35'])
            : '',
          hosts.includes('www.shop.example.org')
            ? dnsxLine('www.shop.example.org', [PUBLIC_IP])
            : '',
          // dnsx answered with an internal address for a name that looked public to the guard
          hosts.includes('internal.shop.example.org')
            ? dnsxLine('internal.shop.example.org', ['10.0.0.5'], true)
            : '',
          // an answer for a name nobody asked about
          dnsxLine('surprise.shop.example.org', ['93.184.216.40']),
        ]
          .filter(Boolean)
          .join('\n'),
      };
    },
    naabu: (options: SpawnScannerProcessOptions) => {
      const ips = (options.args[options.args.indexOf('-host') + 1] ?? '').split(
        ',',
      );
      return {
        stdout: [
          JSON.stringify({ ip: ips[0], port: 6379, protocol: 'tcp' }),
          JSON.stringify({ ip: ips[0], port: 6379, protocol: 'tcp' }),
          // an address naabu was never given
          JSON.stringify({ ip: '8.8.8.8', port: 53, protocol: 'tcp' }),
        ].join('\n'),
      };
    },
    ffuf: () => ({
      stdout: [
        JSON.stringify({
          url: 'https://shop.example.org/.git/HEAD',
          status: 200,
          length: 23,
          words: 2,
          lines: 1,
          'content-type': 'text/plain',
          redirectlocation: '',
        }),
        JSON.stringify({
          url: 'https://evil.test/admin',
          status: 200,
          length: 5,
          words: 1,
          lines: 1,
          redirectlocation: '',
        }),
      ].join('\n'),
    }),
    dalfox: () => ({
      stdout: DALFOX_RECORDED_VULNERABLE.replace(
        /http:\/\/127\.0\.0\.1:3001/g,
        'https://shop.example.org',
      ),
      exitCode: 1,
    }),
  };

  it('runs every stage in order and persists each scanner', async () => {
    const h = build({ rule: APEX, profile: 'DEEP', tools: deepTools });
    await h.run('DEEP');

    expect(h.markers().filter((m) => m.endsWith('start'))).toEqual([
      '[stage] recon start',
      '[stage] subdomains start',
      '[stage] resolve start',
      '[stage] ports start',
      '[stage] checks start',
      '[stage] crawl start',
      '[stage] scan start',
      '[stage] content start',
      '[stage] xss start',
      '[stage] verify start',
    ]);
    expect(h.markers().filter((m) => m.endsWith('failed'))).toEqual([]);
    expect(h.persisted.map((entry) => entry.scanner)).toEqual([
      'SUBFINDER',
      'NAABU',
      'SECORA_CHECKS',
      'FFUF',
      'DALFOX',
    ]);
    expect(h.audits.map((entry) => entry.tool)).toEqual([
      'httpx',
      'subfinder',
      'dnsx',
      'naabu',
      'katana',
      'ffuf',
      'dalfox',
    ]);
  });

  it('subdomains: only names inside the verified apex are resolved; lookalikes and other domains are dropped', async () => {
    const h = build({ rule: APEX, profile: 'DEEP', tools: deepTools });
    await h.run('DEEP');
    const dnsx = h.spawned.find((call) => call.tool === 'dnsx');
    const asked = dnsx?.options.args[dnsx.options.args.indexOf('-l') + 1]
      .split(',')
      .sort();
    expect(asked).toEqual([
      'api.shop.example.org',
      'internal.shop.example.org',
      'www.shop.example.org',
    ]);
    const dropped = h
      .messages()
      .filter((m) => m.startsWith('Subdomains: dropped'));
    expect(dropped.join('\n')).toContain('evilshop.example.org');
    expect(dropped.join('\n')).toContain('mail.other.com');
  });

  it('resolve: a name that resolves to a private address is dropped; an unasked-for answer is ignored', async () => {
    const h = build({ rule: APEX, profile: 'DEEP', tools: deepTools });
    await h.run('DEEP');
    const subdomains = h.persisted
      .find((entry) => entry.scanner === 'SUBFINDER')!
      .findings.map((f) => f.matchedAt)
      .sort();
    expect(subdomains).toEqual([
      'api.shop.example.org',
      'www.shop.example.org',
    ]);
    expect(
      h
        .messages()
        .some(
          (m) =>
            m.includes('internal.shop.example.org') &&
            m.includes('private or reserved'),
        ),
    ).toBe(true);
  });

  it('ports: naabu gets only the admitted public addresses, and an address it was not given is ignored', async () => {
    const h = build({ rule: APEX, profile: 'DEEP', tools: deepTools });
    await h.run('DEEP');
    const naabu = h.spawned.find((call) => call.tool === 'naabu')!;
    const ips = naabu.options.args[naabu.options.args.indexOf('-host') + 1]
      .split(',')
      .sort();
    expect(ips).toEqual([PUBLIC_IP, '93.184.216.35']);
    for (const ip of ips)
      expect(ip).not.toMatch(/^(10\.|127\.|192\.168\.|169\.254\.)/);
    const findings = h.persisted.find(
      (entry) => entry.scanner === 'NAABU',
    )!.findings;
    expect(findings).toHaveLength(1);
    expect(findings[0].matchedAt).toBe(`shop.example.org:6379`);
    expect(findings[0].severity).toBe('MEDIUM');
  });

  it('a host-only ownership proof skips subdomain discovery but still scans the verified host', async () => {
    const h = build({ rule: HOST_ONLY, profile: 'DEEP', tools: deepTools });
    await h.run('DEEP');
    expect(h.markers()).toContain('[stage] subdomains skipped');
    expect(h.spawned.some((call) => call.tool === 'subfinder')).toBe(false);
    expect(h.spawned.some((call) => call.tool === 'dnsx')).toBe(false);
    const naabu = h.spawned.find((call) => call.tool === 'naabu')!;
    expect(naabu.options.args[naabu.options.args.indexOf('-host') + 1]).toBe(
      PUBLIC_IP,
    );
    expect(h.messages().some((m) => m.includes('DNS TXT'))).toBe(true);
  });

  it('content discovery: the wordlist is removed afterwards and findings off the verified host are dropped', async () => {
    const h = build({ rule: APEX, profile: 'DEEP', tools: deepTools });
    await h.run('DEEP');
    expect(h.wordlistCleanup).toHaveBeenCalledTimes(1);
    const ffuf = h.spawned.find((call) => call.tool === 'ffuf')!;
    expect(ffuf.options.args).toEqual(
      expect.arrayContaining([
        '-w',
        '/tmp/secora-wordlist-x/words.txt',
        '-x',
        'http://127.0.0.1:45678',
      ]),
    );
    const findings = h.persisted.find(
      (entry) => entry.scanner === 'FFUF',
    )!.findings;
    expect(findings.map((f) => f.path)).toEqual(['/.git/HEAD']);
    expect(findings[0].severity).toBe('HIGH');
  });

  it('xss: dalfox only gets crawled GET URLs with parameters on the verified host, and exit status 1 is not a failure', async () => {
    const h = build({ rule: APEX, profile: 'DEEP', tools: deepTools });
    await h.run('DEEP');
    const dalfox = h.spawned.find((call) => call.tool === 'dalfox')!;
    expect(dalfox.options.args.slice(-2)).toEqual([
      'https://shop.example.org/search?q=test',
      'https://shop.example.org/item?id=7&ref=a',
    ]);
    expect(dalfox.options.args).not.toContain('https://evil.test/x?y=1');
    expect(dalfox.options.args).not.toContain(
      'https://shop.example.org/static/app.js?v=3',
    );
    expect(h.markers()).toContain('[stage] xss done');
    const findings = h.persisted.find(
      (entry) => entry.scanner === 'DALFOX',
    )!.findings;
    expect(findings[0]).toMatchObject({ vulnType: 'xss', severity: 'HIGH' });
  });

  it('xss is skipped when the crawl found no URL with parameters', async () => {
    const h = build({
      rule: APEX,
      profile: 'DEEP',
      tools: {
        ...deepTools,
        katana: () => ({ stdout: katanaLine('https://shop.example.org/') }),
      },
    });
    await h.run('DEEP');
    expect(h.markers()).toContain('[stage] xss skipped');
    expect(h.spawned.some((call) => call.tool === 'dalfox')).toBe(false);
    expect(h.closed.find((entry) => entry.scanner === 'DALFOX')).toMatchObject({
      outcome: 'COMPLETED',
    });
  });

  it('a failed port scan does not stop content discovery or XSS checks, and the tool run is closed as FAILED', async () => {
    const h = build({
      rule: APEX,
      profile: 'DEEP',
      tools: {
        ...deepTools,
        naabu: () => new Error('naabu: permission denied'),
      },
    });
    await h.run('DEEP');
    expect(h.markers()).toContain('[stage] ports failed');
    expect(h.markers()).toContain('[stage] content done');
    expect(h.markers()).toContain('[stage] xss done');
    expect(h.closed.find((entry) => entry.scanner === 'NAABU')).toMatchObject({
      outcome: 'FAILED',
      message: 'naabu: permission denied',
    });
  });

  it('a stage that times out keeps its partial results and the scan carries on', async () => {
    const h = build({
      rule: APEX,
      profile: 'DEEP',
      tools: {
        ...deepTools,
        ffuf: () => ({
          stdout: deepTools.ffuf().stdout.split('\n')[0],
          timedOut: true,
          exitCode: null,
        }),
      },
    });
    await h.run('DEEP');
    expect(h.markers()).toContain('[stage] content failed');
    expect(
      h.persisted.find((entry) => entry.scanner === 'FFUF')!.findings,
    ).toHaveLength(1);
    expect(h.markers()).toContain('[stage] xss done');
  });

  it('a non-lab scan never hands a private address to a tool even if the lab flag is off', async () => {
    const h = build({
      rule: APEX,
      profile: 'DEEP',
      tools: {
        ...deepTools,
        dnsx: () => ({
          stdout: dnsxLine('api.shop.example.org', ['127.0.0.1']),
        }),
      },
    });
    await h.run('DEEP');
    const naabu = h.spawned.find((call) => call.tool === 'naabu')!;
    expect(naabu.options.args[naabu.options.args.indexOf('-host') + 1]).toBe(
      PUBLIC_IP,
    );
  });
});

describe('PipelineOrchestrator — recorded lab output (Juice Shop)', () => {
  it('crawls, discovers content and port-scans the lab with the real recorded output', async () => {
    const lab: PinnedHost = {
      host: 'juice.lab.test',
      ip: '127.0.0.1',
      family: 4,
    };
    const logs: string[] = [];
    const persisted: { scanner: VulnScanner; findings: VulnFindingInput[] }[] =
      [];
    const nuclei: string[][] = [];
    const host: PipelineHost = {
      log: (_level, message) => logs.push(message),
      audit: () => undefined,
      persist: async (scanner, result) =>
        void persisted.push({ scanner, findings: result.findings }),
      closeToolRun: async () => undefined,
      toolRunStatus: () => 'PENDING',
      listFindings: async () => [],
      recordVerification: async () => undefined,
      runNuclei: async (input) => {
        nuclei.push(input.urls);
        return { failed: false, partial: false, message: null };
      },
      shouldStop: async () => false,
    };
    const spawner = {
      spawn: jest.fn(async (options: SpawnScannerProcessOptions) => {
        const tool = options.command.split('/').pop();
        const rogue = [
          katanaLine('http://evil.test/steal'),
          katanaLine('http://127.0.0.1:3000/'), // the same machine by IP literal
        ].join('\n');
        const stdout =
          {
            katana: `${KATANA_RECORDED}\n${rogue}`,
            ffuf: FFUF_RECORDED,
            naabu: NAABU_RECORDED.replace(/172\.24\.0\.2/g, '127.0.0.1'),
          }[tool ?? ''] ?? '';
        return { exitCode: 0, stdout, timedOut: false };
      }),
    } as unknown as ScannerProcessSpawner;
    const config = {
      get: (key: string) =>
        key === 'ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS'
          ? true
          : `/bin/${key.replace('VULN_TOOL_BIN_', '').toLowerCase()}`,
    } as unknown as ConfigService<EnvConfig, true>;
    const probe = {
      run: jest.fn(async () => ({
        outcome: 'OK' as const,
        liveUrls: ['http://juice.lab.test:3000'],
      })),
    } as unknown as PipelineProbeStage;

    class LabOrchestrator extends PipelineOrchestrator {
      protected override createScopeGuard(
        rule: ScopeRule,
        options: ScopeGuardOptions,
      ): ScopeGuard {
        return new ScopeGuard(rule, {
          ...options,
          lookupAddresses: async () => [{ address: '127.0.0.1', family: 4 }],
        });
      }
      protected override async startProxy(): Promise<PinningProxy> {
        return {
          url: 'http://127.0.0.1:50000',
          close: async () => undefined,
        } as unknown as PinningProxy;
      }
      protected override writeWordlist() {
        return Promise.resolve({
          path: '/tmp/w.txt',
          cleanup: async () => undefined,
        });
      }
    }
    await new LabOrchestrator(config, spawner, probe).run({
      profile: 'DEEP',
      target: { id: 't', type: 'URL', value: 'http://juice.lab.test:3000' },
      rule: { root: 'juice.lab.test', includeSubdomains: false },
      pin: lab,
      signal: new AbortController().signal,
      host,
    });

    // The crawl found only the application's own files; the rogue links were dropped.
    expect(nuclei[0]).toEqual(['http://juice.lab.test:3000/']);
    expect(
      logs.filter((m) => m.startsWith('Crawl: dropped')).join('\n'),
    ).toMatch(/evil\.test/);
    expect(
      logs.some(
        (m) => m.startsWith('Crawl: dropped') && m.includes('127.0.0.1'),
      ),
    ).toBe(true);
    expect(logs).toContain(
      '[stage] xss skipped - the crawl found no URL with query parameters on the verified host',
    );
    const content = persisted.find(
      (entry) => entry.scanner === 'FFUF',
    )!.findings;
    expect(content.find((f) => f.path === '/metrics')).toMatchObject({
      severity: 'MEDIUM',
    });
    expect(
      persisted.find((entry) => entry.scanner === 'NAABU')!.findings,
    ).toHaveLength(1);
  });
});

describe('PipelineOrchestrator — tools that cannot run', () => {
  const unavailable = () => new ToolUnavailableError('httpx', 'not found');

  it('a missing httpx fails the recon stage with the reason, never "no live web service"', async () => {
    const h = build({ probeError: unavailable(), tools: { katana: () => ({ stdout: '' }) } });
    const result = await h.run('STANDARD');

    expect(h.messages()).toContain('[stage] recon failed - tool httpx is not available on this worker (not found)');
    expect(h.messages().join('\n')).not.toMatch(/no live web service/);
    expect(result.failedStages[0]).toEqual({ stage: 'recon', note: 'tool httpx is not available on this worker (not found)' });
  });

  it('the stages that need recon fail too, with the real reason, and nothing is sent to the target by them', async () => {
    const h = build({ probeError: unavailable(), tools: { katana: () => ({ stdout: '' }) } });
    const result = await h.run('STANDARD');

    for (const stage of ['crawl', 'scan']) {
      expect(h.messages().find((m) => m.startsWith(`[stage] ${stage} failed`))).toMatch(
        /not run: the recon stage could not run \(tool httpx is not available/,
      );
    }
    expect(h.spawned.some((call) => call.tool === 'katana')).toBe(false);
    expect(h.nucleiCalls).toHaveLength(0);
    expect(result.failedStages.map((item) => item.stage)).toEqual(expect.arrayContaining(['recon', 'crawl', 'scan']));
    // the scanner's tool run is FAILED, not "completed with nothing to scan"
    expect(h.closed.find((entry) => entry.scanner === 'NUCLEI')).toMatchObject({ outcome: 'FAILED' });
  });

  it('the native checks still run, so what could be tested is reported', async () => {
    const h = build({ probeError: unavailable() });
    await h.run('STANDARD');
    expect(h.markers()).toContain('[stage] checks done');
    expect(h.persisted.map((entry) => entry.scanner)).toContain('SECORA_CHECKS');
  });

  it('a missing tool in a later stage fails that stage only, and the scan carries on', async () => {
    const h = build({ missingTools: ['katana'], liveUrls: ['https://shop.example.org'] });
    const result = await h.run('STANDARD');
    expect(h.messages()).toContain('[stage] crawl failed - tool katana is not available on this worker (not found)');
    expect(h.markers()).toContain('[stage] scan done');
    expect(result.failedStages.map((item) => item.stage)).toEqual(['crawl']);
  });

  it('a probe that really finds nothing stays "skipped" and is not an error', async () => {
    const h = build({ liveUrls: [], tools: { katana: () => ({ stdout: '' }) } });
    const result = await h.run('STANDARD');
    expect(h.messages()).toContain('[stage] recon skipped - no live web service was found on the host');
    expect(result.failedStages).toEqual([]);
  });

  it('a clean run reports no failed stages', async () => {
    const h = build({ tools: { katana: () => ({ stdout: '' }) } });
    expect((await h.run('STANDARD')).failedStages).toEqual([]);
  });
});

describe('PipelineOrchestrator — client engagement authorization', () => {
  it('a scan whose authorization holds runs normally and reports nothing lost', async () => {
    const check = jest.fn(async () => null);
    const h = build({ authorizationLost: check, tools: { katana: () => ({ stdout: '' }) } });
    const result = await h.run('STANDARD');
    expect(result.authorizationLost).toBeNull();
    expect(check.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(h.markers()).toContain('[stage] scan done');
  });

  it('is checked before every stage: a withdrawal stops the scan at the next stage and keeps earlier results', async () => {
    let calls = 0;
    const h = build({
      // fine for the first two stages (recon, checks), gone before the third
      authorizationLost: async () => (++calls > 2 ? 'The client withdrew their approval.' : null),
      tools: { katana: () => ({ stdout: '' }) },
    });
    const result = await h.run('STANDARD');
    expect(result.authorizationLost).toBe('The client withdrew their approval.');
    expect(h.persisted.map((p) => p.scanner)).toContain('SECORA_CHECKS');
    expect(h.markers()).not.toContain('[stage] crawl start');
    expect(h.spawned.some((call) => call.tool === 'katana')).toBe(false);
    expect(h.nucleiCalls).toHaveLength(0);
    expect(h.messages()).toContain('The client withdrew their approval.');
    expect(h.proxyInstance.close).toHaveBeenCalledTimes(1);
  });

  it('a scan whose authorization is already gone runs no stage at all', async () => {
    const h = build({ authorizationLost: async () => 'The test window ended.' });
    const result = await h.run('STANDARD');
    expect(result.authorizationLost).toBe('The test window ended.');
    expect(h.markers()).toEqual([]);
    expect(h.spawned).toEqual([]);
    expect(h.checksRun).not.toHaveBeenCalled();
  });

  it('stops a stage that is already running when the authorization ends', async () => {
    let gone = false;
    const h = build({
      nucleiWaitsForAbort: true,
      authorizationLost: async () => (gone ? 'The test window ended.' : null),
      tools: { katana: () => ({ stdout: '' }) },
    });
    // flip to "gone" once the scan stage is running
    const original = h.nucleiCalls.push.bind(h.nucleiCalls);
    h.nucleiCalls.push = (...items) => {
      setTimeout(() => (gone = true), 20);
      return original(...items);
    };
    const result = await h.run('STANDARD');
    expect(result.authorizationLost).toBe('The test window ended.');
    expect(h.markers()).not.toContain('[stage] verify start');
  });

  it('fails closed when the authorization cannot be re-checked', async () => {
    const h = build({
      authorizationLost: async () => {
        throw new Error('database down');
      },
    });
    const result = await h.run('STANDARD');
    expect(result.authorizationLost).toMatch(/could not be re-checked/);
    expect(h.markers()).toEqual([]);
  });

  it('an ordinary (ownership) scan has no authorization check', async () => {
    const h = build({ tools: { katana: () => ({ stdout: '' }) } });
    const result = await h.run('STANDARD');
    expect(result.authorizationLost).toBeNull();
  });
});

describe('PipelineOrchestrator — job control', () => {
  it('stops between stages when the job is cancelled', async () => {
    const controller = new AbortController();
    const h = build({
      signal: controller.signal,
      tools: { katana: () => ({ stdout: '' }) },
    });
    h.checksRun.mockImplementationOnce(async () => {
      controller.abort();
      return { findings: [], reachable: ['https://shop.example.org'], raw: '' };
    });
    await h.run('STANDARD');
    expect(h.markers()).not.toContain('[stage] crawl start');
    expect(h.spawned.some((call) => call.tool === 'katana')).toBe(false);
    expect(h.proxyInstance.close).toHaveBeenCalled();
  });

  it('stops between stages when a pause is requested, and closes the proxy', async () => {
    const h = build({
      stopAfterStages: 2,
      tools: { katana: () => ({ stdout: '' }) },
    });
    await h.run('STANDARD');
    expect(h.markers().filter((m) => m.endsWith('start'))).toEqual([
      '[stage] recon start',
      '[stage] checks start',
    ]);
    expect(h.proxyInstance.close).toHaveBeenCalledTimes(1);
  });

  it('on resume, stages whose tool run already completed are not repeated', async () => {
    const h = build({
      toolRunStatus: { SECORA_CHECKS: 'COMPLETED' },
      tools: { katana: () => ({ stdout: '' }) },
    });
    await h.run('STANDARD');
    expect(h.checksRun).not.toHaveBeenCalled();
    expect(
      h
        .messages()
        .some((m) => m.startsWith('[stage] checks skipped (already completed')),
    ).toBe(true);
    expect(h.markers()).toContain('[stage] scan done');
  });

  it('every command is audited once, with the stage it belongs to', async () => {
    const h = build({ tools: { katana: () => ({ stdout: '' }) } });
    await h.run('STANDARD');
    expect(h.audits).toEqual([
      { tool: 'httpx', argv: ['-u', 'http://93.184.216.34'], stage: 'recon' },
      expect.objectContaining({ tool: 'katana', stage: 'crawl' }),
    ]);
  });

  it('the command line in the job log is redacted', async () => {
    const h = build({ tools: { katana: () => ({ stdout: '' }) } });
    await h.run('STANDARD');
    expect(h.messages().find((m) => m.startsWith('$ /bin/katana'))).toContain(
      '-proxy http://127.0.0.1:45678',
    );
  });
});

describe('PipelineOrchestrator — safe re-verification', () => {
  const headerFinding = (id: string, vulnType: string, matchedAt = 'https://shop.example.org') => ({
    id,
    scanner: 'SECORA_CHECKS',
    vulnType,
    signature: 's',
    path: '/',
    matchedAt,
    tags: [],
    data: {},
  });
  const fileFinding = (id: string, matchedAt: string) => ({
    id,
    scanner: 'FFUF',
    vulnType: 'exposed-content',
    signature: 's',
    path: null,
    matchedAt,
    tags: [],
    data: { status: 200 },
  });

  it('re-checks supported classes with one GET each through the fetch it is given, and records the result', async () => {
    const urls: string[] = [];
    const h = build({
      profile: 'QUICK',
      findings: [
        headerFinding('h1', 'header-csp-missing'),
        { ...headerFinding('c1', 'cors-reflected-credentials') }, // not a re-checkable class
        fileFinding('x1', 'https://shop.example.org/.env'),
      ],
      fetch: async (url) => {
        urls.push(url);
        return url.includes('baseline') ? { status: 404, headers: {}, body: 'nf' } : { status: 200, headers: {}, body: 'APP_ENV=lab' };
      },
    });
    await h.run('QUICK');

    expect(h.verifications.map((v) => [v.findingId, v.status])).toEqual([
      ['h1', 'REPRODUCED'],
      ['x1', 'REPRODUCED'],
    ]);
    expect(urls).toEqual([
      'https://shop.example.org/',
      'https://shop.example.org/.env',
      expect.stringMatching(/^https:\/\/shop\.example\.org\/secora-baseline-/),
    ]);
    expect(h.markers()).toContain('[stage] verify done');
    expect(h.audits.filter((a) => a.tool === 'secora-verify').map((a) => a.argv[1])).toEqual(['missing-header', 'exposed-file']);
  });

  it('never fetches a URL outside the verified scope; it records a failed re-check instead', async () => {
    const urls: string[] = [];
    const h = build({
      profile: 'QUICK',
      findings: [headerFinding('h1', 'header-csp-missing', 'https://evil.test')],
      fetch: async (url) => {
        urls.push(url);
        return { status: 200, headers: {}, body: '' };
      },
    });
    await h.run('QUICK');
    expect(urls).toEqual([]);
    expect(h.verifications[0]).toMatchObject({ findingId: 'h1', status: 'FAILED' });
    expect(h.verifications[0].detail).toContain('outside the verified scope');
  });

  it('a re-check that does not reproduce is recorded as such; severity is not part of the result', async () => {
    const h = build({
      profile: 'QUICK',
      findings: [headerFinding('h1', 'header-hsts-missing')],
      fetch: async () => ({ status: 200, headers: { 'strict-transport-security': 'max-age=31536000' }, body: '' }),
    });
    await h.run('QUICK');
    expect(h.verifications[0].status).toBe('NOT_REPRODUCED');
    expect(h.verifications[0]).not.toHaveProperty('severity');
  });

  it('caps the number of re-checks per scan', async () => {
    let calls = 0;
    const many = Array.from({ length: 70 }, (_, i) => headerFinding(`h${i}`, 'header-csp-missing', `https://shop.example.org/p${i}`));
    const h = build({ profile: 'QUICK', findings: many, fetch: async () => (calls++, { status: 200, headers: {}, body: '' }) });
    await h.run('QUICK');
    expect(h.verifications.length).toBeLessThanOrEqual(40);
  });

  it('a failing fetch does not break the scan', async () => {
    const h = build({
      profile: 'QUICK',
      findings: [headerFinding('h1', 'header-csp-missing')],
      fetch: async () => {
        throw new Error('proxy refused');
      },
    });
    await h.run('QUICK');
    expect(h.verifications[0].status).toBe('FAILED');
    expect(h.markers()).toContain('[stage] verify done');
  });
});
