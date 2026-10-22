import { isAbsolute } from 'node:path';
import { isIP } from 'node:net';
import type { PlanTier } from '@pentesthub/shared';
import { assertSafeHost, assertSafeUrl } from './safe-input.js';
import {
  pinnedHostArgs,
  pinnedSchemeUrls,
  pinUrl,
  type PinnedHost,
} from './pin.util.js';

/// Typed registry of the external tools the pentest pipeline may run.
///
/// Every entry is data plus pure argv builders. Nothing here spawns a process:
/// the adapters (ScannerRunner / ToolRunner) call `buildArgs` and hand the
/// array to the spawn utility, which never goes through a shell. The frontend
/// never supplies a command; it sends {targetId, profile} and the server picks
/// the tools from the profile below.

export type CatalogTargetKind = 'URL' | 'DOMAIN' | 'SUBDOMAIN';
export type ToolRiskLevel = 'PASSIVE' | 'SAFE_ACTIVE' | 'INTRUSIVE';
export type ScanProfile = 'QUICK' | 'STANDARD' | 'DEEP';

export const SCAN_PROFILES: readonly ScanProfile[] = ['QUICK', 'STANDARD', 'DEEP'];

/// DEEP is part of the model but disabled unless the operator turns it on
/// (SCAN_DEEP_PROFILE_ENABLED). INTRUSIVE tools are never in the catalog yet.
export const DEEP_PROFILE_FEATURE_FLAG = 'SCAN_DEEP_PROFILE_ENABLED';

export { assertSafeHost, assertSafeUrl } from './safe-input.js';

export interface NucleiProfileSettings {
  /// Template tags for this profile. No brute force, no fuzzing, no DoS.
  tags: string[];
  /// Requests per second handed to nuclei (-rl).
  rateLimit: number;
  /// Per-request timeout in seconds (-timeout).
  requestTimeoutSeconds: number;
  /// Overall stage timeout enforced by the spawn utility.
  stageTimeoutSeconds: number;
}

/// Tag names as they exist in the official nuclei-templates repository. They
/// were checked against a real checkout (14k templates): the singular forms
/// "exposure", "misconfig", "cve", "tech", "takeover" and "default-login" are
/// the real tags, while the plural forms an earlier draft used ("exposures",
/// "cves", "technologies", ...) match almost nothing. Do not rename them
/// without re-counting templates per tag.
const NUCLEI_STANDARD_TAGS = ['exposure', 'misconfig', 'cve', 'tech', 'ssl', 'takeover'];

/// Tags only the DEEP profile may run. "default-login" templates submit
/// vendor-default credentials to login forms, which is more than detection, so
/// they need DEEP: a verified target, the operator's SCAN_DEEP_PROFILE_ENABLED
/// flag and the caller's explicit confirmation (see CreateVulnScanJobHandler).
export const NUCLEI_DEEP_ONLY_TAGS = ['default-login'];

/// QUICK is the native TLS/header checks only and runs no nuclei, so it has no
/// entry here.
export type NucleiProfile = Exclude<ScanProfile, 'QUICK'>;

export const NUCLEI_PROFILES: Record<NucleiProfile, NucleiProfileSettings> = {
  STANDARD: {
    tags: [...NUCLEI_STANDARD_TAGS],
    rateLimit: 30,
    requestTimeoutSeconds: 10,
    stageTimeoutSeconds: 30 * 60,
  },
  DEEP: {
    tags: [...NUCLEI_STANDARD_TAGS, ...NUCLEI_DEEP_ONLY_TAGS],
    rateLimit: 30,
    requestTimeoutSeconds: 10,
    stageTimeoutSeconds: 60 * 60,
  },
};

export interface NucleiArgsInput {
  /// Verified target, already passed through the scope and network guard.
  target: { kind: CatalogTargetKind; value: string };
  /// Scan profile. When absent the job config is used as-is (legacy path).
  profile?: NucleiProfile;
  /// Optional narrowing from the job config. With a profile it can only narrow
  /// the profile tags; without one it is the tag list itself.
  severity?: string[];
  tags?: string[];
  /// Explicit template paths from the job config.
  templates?: string[];
  /// DNS pin for the target host. When set the tool connects to the pinned IP
  /// and sends the real name as Host header and SNI.
  pin?: PinnedHost;
  /// The pinning proxy. When set, nuclei is given the real hostnames and every
  /// HTTP request it makes (including the ones templates build themselves, to
  /// other ports or other hosts) goes through the proxy, which refuses anything
  /// that is not the verified host on an allowed port. This replaces the IP +
  /// Host-header pin, which cannot constrain such requests. Only HTTP templates
  /// run in this mode (-pt http): the other protocols connect directly and so
  /// cannot be held to the proxy.
  proxyUrl?: string;
  /// Live URLs on the pinned host found by the probe stage. When absent, both
  /// schemes of the host are used.
  urls?: string[];
  /// Absolute directory holding the pinned template set (nuclei -ud). From the
  /// operator's environment, never from a request.
  templatesDir?: string;
  /// Block nuclei's connections to local/private networks (-lna). On unless the
  /// operator allows private targets (dev/lab only; refused in production).
  restrictLocalNetwork?: boolean;
}

/// Protocol types excluded from every run (-ept). Checked against nuclei
/// v3.11.1 `-h`: these are the ones that can reach hosts other than the pinned
/// target (javascript, websocket, whois), run code or read files on the
/// worker (code, file) or drive a browser (headless). The http, ssl, tcp and
/// dns templates the profiles need are kept. nuclei has no flag that blocks
/// public hosts a template names itself, so this is the strictest restriction
/// available; the pin and -lna cover the rest.
export const NUCLEI_EXCLUDED_PROTOCOLS = [
  'code',
  'file',
  'headless',
  'javascript',
  'websocket',
  'whois',
];

const LEGACY_RATE_LIMIT = 30;
const LEGACY_REQUEST_TIMEOUT_SECONDS = 10;

/// nuclei argv. For a bare domain both the host and its https:// form are
/// given, because HTTP templates only run against URLs.
/// `-ni` disables the interactsh out-of-band server: no callbacks to a third
/// party, so a target can never make the scanner phone home elsewhere.
export function buildNucleiArgs(input: NucleiArgsInput): string[] {
  const settings = input.profile ? NUCLEI_PROFILES[input.profile] : undefined;
  const args: string[] = [];

  if (input.proxyUrl) {
    const urls = input.urls?.length
      ? input.urls.map((url) => assertSafeUrl(url))
      : input.target.kind === 'URL'
        ? [assertSafeUrl(input.target.value)]
        : [`https://${assertSafeHost(input.target.value)}`, `http://${assertSafeHost(input.target.value)}`];
    for (const url of urls) args.push('-u', url);
    args.push('-proxy', assertLocalProxyUrl(input.proxyUrl), '-pt', 'http');
  } else if (input.pin) {
    const urls = input.urls?.length
      ? input.urls.map((url) => pinUrl(assertSafeUrl(url), input.pin!))
      : input.target.kind === 'URL'
        ? [pinUrl(assertSafeUrl(input.target.value), input.pin)]
        : pinnedSchemeUrls(input.pin);
    for (const url of urls) args.push('-u', url);
    args.push(...pinnedHostArgs(input.pin));
  } else if (input.target.kind === 'URL') {
    args.push('-u', assertSafeUrl(input.target.value));
  } else {
    const host = assertSafeHost(input.target.value);
    args.push('-u', host, '-u', `https://${host}`);
  }

  let tags: string[] | undefined;
  if (settings) {
    // The profile tags are the ceiling; a job config can only narrow them.
    tags = input.tags?.length
      ? settings.tags.filter((tag) => input.tags!.includes(tag))
      : settings.tags;
    // An empty tag list would make nuclei run every template. Refuse instead.
    if (tags.length === 0) {
      throw new Error('No nuclei template tags remain for this profile selection.');
    }
  } else {
    tags = input.tags?.length ? input.tags : undefined;
  }

  args.push(
    '-jsonl',
    '-no-color',
    '-stats',
    '-stats-interval',
    '5',
    '-ni',
    '-duc',
    '-rl',
    String(settings?.rateLimit ?? LEGACY_RATE_LIMIT),
    '-timeout',
    String(settings?.requestTimeoutSeconds ?? LEGACY_REQUEST_TIMEOUT_SECONDS),
    '-retries',
    '1',
  );
  // Strict by default: only an explicit false lifts the local-network block.
  // Behind the pinning proxy -lna is omitted on purpose: the proxy itself is on
  // loopback, so nuclei would refuse to talk to it. The proxy enforces the same
  // rule (it only connects to the pinned public address of an admitted host,
  // and refuses a private one unless a lab opted in).
  if (input.restrictLocalNetwork !== false && !input.proxyUrl) {
    args.push('-lna');
  }
  args.push('-ept', NUCLEI_EXCLUDED_PROTOCOLS.join(','));
  if (tags && tags.length > 0) {
    args.push('-tags', tags.join(','));
  }
  if (input.severity && input.severity.length > 0) {
    args.push('-severity', input.severity.join(','));
  }
  if (input.templates && input.templates.length > 0) {
    args.push('-templates', input.templates.join(','));
  }
  if (input.templatesDir && input.templatesDir.startsWith('/')) {
    args.push('-ud', input.templatesDir);
  }
  return args;
}

/// The recon (httpx) stage is one short probe; this bounds it.
export const HTTPX_STAGE_TIMEOUT_SECONDS = 120;
export const HTTPX_RATE_LIMIT = 50;
export const HTTPX_TIMEOUT_SECONDS = 10;

export interface HttpxArgsInput {
  /// A URL or a bare hostname (httpx probes both schemes for a bare host).
  target: string;
  /// DNS pin: connect to this IP, send the real name as Host header and SNI.
  pin?: PinnedHost;
}

/// httpx argv. Redirects are not followed (httpx's default; no -fr flag is
/// ever passed), so a redirect to another host is never fetched.
export function buildHttpxArgs(input: HttpxArgsInput): string[] {
  const targetArgs: string[] = [];
  if (input.pin) {
    const urls = input.target.includes('://')
      ? [pinUrl(assertSafeUrl(input.target), input.pin)]
      : pinnedSchemeUrls(input.pin);
    for (const url of urls) targetArgs.push('-u', url);
    targetArgs.push(...pinnedHostArgs(input.pin));
  } else {
    const target = input.target.includes('://')
      ? assertSafeUrl(input.target)
      : assertSafeHost(input.target);
    targetArgs.push('-u', target);
  }
  return [
    ...targetArgs,
    '-silent',
    '-json',
    '-title',
    '-tech-detect',
    '-status-code',
    '-server',
    '-rl',
    String(HTTPX_RATE_LIMIT),
    '-timeout',
    String(HTTPX_TIMEOUT_SECONDS),
  ];
}

// ---------------------------------------------------------------------------
// Stage 3 tools. Flags below were read from each pinned binary's -h (katana
// v1.7.0, subfinder v2.16.0, dnsx v1.3.1, naabu v2.6.1, ffuf v2.3.0, dalfox
// v3.2.3) and the exact runs were recorded against the local lab; see
// docs/operations/pentest-tools.md. Nothing here ever receives a raw string
// from a request: hosts, URLs, IPs, the proxy address and the wordlist path
// are validated, and only the catalog decides which flags exist.
// ---------------------------------------------------------------------------

const PROXY_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d{1,5}$/;

/// The pinning proxy is the only proxy a tool may be given: loopback, plain
/// http, a port. Anything else would let a tool be pointed somewhere else.
export function assertLocalProxyUrl(url: string): string {
  if (!PROXY_URL_PATTERN.test(url)) {
    throw new Error('Refusing to use a proxy that is not the local pinning proxy.');
  }
  return url;
}

function assertPublicIp(ip: string): string {
  if (isIP(ip) === 0) {
    throw new Error(`Refusing to run a tool against "${ip}": not an IP address.`);
  }
  return ip;
}

/// Wall-clock budget of a whole profile job: the sum of its stage limits plus
/// slack (QUICK 2 min; STANDARD 2 + 8 + 30 min of recon, crawl and nuclei; DEEP
/// adds 4 + 2 + 5 + 4 + 5 min). The job-wide timeout must not be shorter, or it
/// would cut off the stages after a slow one, which is exactly what stage
/// limits exist to prevent. VULN_JOB_TIMEOUT_SECONDS still applies when larger.
export const PROFILE_JOB_TIMEOUT_SECONDS: Record<ScanProfile, number> = {
  QUICK: 5 * 60,
  STANDARD: 50 * 60,
  DEEP: 100 * 60,
};

export const KATANA_MAX_URLS = 200;
export const KATANA_DEPTH = 2;
export const KATANA_STAGE_TIMEOUT_SECONDS = 4 * 60;

export interface KatanaArgsInput {
  /// The verified origin or URL to start from (real hostname, not the pinned IP).
  url: string;
  proxyUrl: string;
}

/// katana argv. Crawl scope is the start URL's own FQDN (-fs fqdn); redirects
/// are not followed (-dr); headless modes are never passed; JS files are
/// parsed for endpoints (-jc) but every request still goes through the pinning
/// proxy, which refuses any host that was not admitted. Verified in the lab:
/// links to another host reached the proxy and were blocked.
export function buildKatanaArgs(input: KatanaArgsInput): string[] {
  return [
    '-u',
    assertSafeUrl(input.url),
    '-d',
    String(KATANA_DEPTH),
    '-jc',
    '-fs',
    'fqdn',
    '-dr',
    '-c',
    '5',
    '-p',
    '1',
    '-rl',
    '20',
    '-timeout',
    '10',
    '-retry',
    '1',
    '-ct',
    `${KATANA_STAGE_TIMEOUT_SECONDS - 60}s`,
    '-mdp',
    String(KATANA_MAX_URLS),
    '-jsonl',
    '-or',
    '-ob',
    '-silent',
    '-nc',
    '-duc',
    '-proxy',
    assertLocalProxyUrl(input.proxyUrl),
  ];
}

export const SUBFINDER_STAGE_TIMEOUT_SECONDS = 4 * 60;
export const SUBFINDER_MAX_RESULTS = 150;

/// subfinder argv: passive sources only. -nW/-active (which resolves names) and
/// -all (every slow source) are never passed; sources are subfinder's own
/// default passive set.
export function buildSubfinderArgs(input: { domain: string }): string[] {
  return [
    '-d',
    assertSafeHost(input.domain),
    '-silent',
    '-nc',
    '-duc',
    '-rl',
    '10',
    '-timeout',
    '30',
    '-max-time',
    '3',
  ];
}

export const DNSX_STAGE_TIMEOUT_SECONDS = 2 * 60;
export const DNSX_MAX_HOSTS = 150;

/// dnsx argv: resolve the given hosts (comma separated, accepted by -l) to A
/// and AAAA. The system hosts file is never used (-hf is not passed).
export function buildDnsxArgs(input: { hosts: string[] }): string[] {
  const hosts = input.hosts.map((host) => assertSafeHost(host));
  if (hosts.length === 0) throw new Error('No hosts to resolve.');
  if (hosts.length > DNSX_MAX_HOSTS) throw new Error('Too many hosts for one dnsx run.');
  return [
    '-l',
    hosts.join(','),
    '-a',
    '-aaaa',
    '-j',
    '-or',
    '-silent',
    '-nc',
    '-duc',
    '-rl',
    '20',
    '-t',
    '10',
    '-retry',
    '2',
    '-timeout',
    '3s',
  ];
}

export const NAABU_STAGE_TIMEOUT_SECONDS = 5 * 60;
export const NAABU_MAX_IPS = 20;

/// naabu argv: top 100 ports, TCP connect scan (-s c, no raw sockets), low
/// rate, IPv4 only, no host discovery pings (-Pn), CDN/WAF addresses get 80 and
/// 443 only (-exclude-cdn). Only IP addresses the ScopeGuard admitted are
/// passed; -passive (a third-party database), -nmap and service detection are
/// never used.
export function buildNaabuArgs(input: { ips: string[] }): string[] {
  const ips = input.ips.map((ip) => assertPublicIp(ip));
  if (ips.length === 0) throw new Error('No addresses to scan.');
  if (ips.length > NAABU_MAX_IPS) throw new Error('Too many addresses for one naabu run.');
  return [
    '-host',
    ips.join(','),
    '-top-ports',
    '100',
    '-s',
    'c',
    '-Pn',
    '-exclude-cdn',
    '-iv',
    '4',
    '-rate',
    '50',
    '-c',
    '10',
    '-retries',
    '1',
    '-timeout',
    '1000',
    '-json',
    '-silent',
    '-duc',
    '-no-stdin',
  ];
}

export const FFUF_STAGE_TIMEOUT_SECONDS = 4 * 60;
export const FFUF_MAX_SECONDS = 180;

export interface FfufArgsInput {
  /// Origin of the verified host, e.g. "https://shop.example.org".
  origin: string;
  /// Absolute path of the built-in wordlist file the worker wrote.
  wordlistPath: string;
  proxyUrl: string;
}

/// ffuf argv: one FUZZ position at the path root, built-in wordlist, 20 req/s
/// on 5 threads, auto-calibration (-ac), a hard time limit (-maxtime), stop when
/// nearly everything answers 403 (-sf). Recursion (-recursion) and redirect
/// following (-r) are never passed.
export function buildFfufArgs(input: FfufArgsInput): string[] {
  if (!isAbsolute(input.wordlistPath) || input.wordlistPath.startsWith('-')) {
    throw new Error('The ffuf wordlist must be an absolute path.');
  }
  const parsed = new URL(assertSafeUrl(input.origin));
  const base = `${parsed.protocol}//${parsed.host}`;
  return [
    '-u',
    `${base}/FUZZ`,
    '-w',
    input.wordlistPath,
    '-x',
    assertLocalProxyUrl(input.proxyUrl),
    '-ac',
    '-sf',
    '-rate',
    '20',
    '-t',
    '5',
    '-timeout',
    '10',
    '-mc',
    '200,204,301,302,307,401,403',
    '-maxtime',
    String(FFUF_MAX_SECONDS),
    '-noninteractive',
    '-json',
    '-s',
  ];
}

export const DALFOX_STAGE_TIMEOUT_SECONDS = 5 * 60;
export const DALFOX_MAX_URLS = 25;

export interface DalfoxArgsInput {
  /// GET URLs with a query string, on the verified host, found by the crawl.
  urls: string[];
  proxyUrl: string;
}

/// dalfox argv: reflected/DOM XSS detection on the given URLs only. No blind
/// XSS (-b, --blind-oob), no remote payload or wordlist providers
/// (--remote-payloads, --remote-wordlists), no custom payload files, no
/// redirect following (-F), no parameter mining (--skip-mining), no stored-XSS
/// mode. 5 requests/second overall, one target at a time, 90 s per target.
export function buildDalfoxArgs(input: DalfoxArgsInput): string[] {
  if (input.urls.length === 0) throw new Error('No URLs to test.');
  if (input.urls.length > DALFOX_MAX_URLS) throw new Error('Too many URLs for one dalfox run.');
  const urls = input.urls.map((url) => {
    const checked = assertSafeUrl(url);
    if (!new URL(checked).search) throw new Error('dalfox is only given URLs with query parameters.');
    return checked;
  });
  return [
    'scan',
    '-i',
    'url',
    '--format',
    'jsonl',
    '--silence',
    '--no-color',
    '--include-request',
    '--skip-mining',
    '--rate-limit',
    '5',
    '--workers',
    '3',
    '--max-concurrent-targets',
    '1',
    '--max-payloads-per-param',
    '100',
    '--timeout',
    '10',
    '--scan-timeout',
    '90',
    '--proxy',
    assertLocalProxyUrl(input.proxyUrl),
    ...urls,
  ];
}

export type CatalogToolId =
  | 'httpx'
  | 'nuclei'
  | 'katana'
  | 'subfinder'
  | 'dnsx'
  | 'naabu'
  | 'ffuf'
  | 'dalfox';

export interface ToolCatalogEntry {
  id: CatalogToolId;
  /// Env var that holds the binary path/name (see env.validation.ts).
  binaryEnvVar: `VULN_TOOL_BIN_${Uppercase<CatalogToolId>}`;
  allowedTargetKinds: CatalogTargetKind[];
  riskLevel: ToolRiskLevel;
  /// Lowest plan that may run this tool; enforced through QuotaService.
  minPlan: PlanTier;
  /// Profiles that include this tool.
  profiles: ScanProfile[];
}

const WEB_TARGETS: CatalogTargetKind[] = ['URL', 'DOMAIN', 'SUBDOMAIN'];

/// QUICK runs no external binary (native TypeScript checks), so it appears in
/// no entry. PASSIVE = never contacts the target (third-party data sources or
/// DNS only); SAFE_ACTIVE = sends bounded, non-destructive requests.
export const TOOL_CATALOG: Record<CatalogToolId, ToolCatalogEntry> = {
  httpx: {
    id: 'httpx',
    binaryEnvVar: 'VULN_TOOL_BIN_HTTPX',
    allowedTargetKinds: WEB_TARGETS,
    riskLevel: 'SAFE_ACTIVE',
    minPlan: 'FREE',
    profiles: ['STANDARD', 'DEEP'],
  },
  nuclei: {
    id: 'nuclei',
    binaryEnvVar: 'VULN_TOOL_BIN_NUCLEI',
    allowedTargetKinds: WEB_TARGETS,
    riskLevel: 'SAFE_ACTIVE',
    minPlan: 'FREE',
    profiles: ['STANDARD', 'DEEP'],
  },
  katana: {
    id: 'katana',
    binaryEnvVar: 'VULN_TOOL_BIN_KATANA',
    allowedTargetKinds: WEB_TARGETS,
    riskLevel: 'SAFE_ACTIVE',
    minPlan: 'FREE',
    profiles: ['STANDARD', 'DEEP'],
  },
  subfinder: {
    id: 'subfinder',
    binaryEnvVar: 'VULN_TOOL_BIN_SUBFINDER',
    allowedTargetKinds: ['DOMAIN'],
    riskLevel: 'PASSIVE',
    minPlan: 'FREE',
    profiles: ['DEEP'],
  },
  dnsx: {
    id: 'dnsx',
    binaryEnvVar: 'VULN_TOOL_BIN_DNSX',
    allowedTargetKinds: ['DOMAIN', 'SUBDOMAIN'],
    riskLevel: 'PASSIVE',
    minPlan: 'FREE',
    profiles: ['DEEP'],
  },
  naabu: {
    id: 'naabu',
    binaryEnvVar: 'VULN_TOOL_BIN_NAABU',
    allowedTargetKinds: ['DOMAIN', 'SUBDOMAIN'],
    riskLevel: 'SAFE_ACTIVE',
    minPlan: 'FREE',
    profiles: ['DEEP'],
  },
  ffuf: {
    id: 'ffuf',
    binaryEnvVar: 'VULN_TOOL_BIN_FFUF',
    allowedTargetKinds: WEB_TARGETS,
    riskLevel: 'SAFE_ACTIVE',
    minPlan: 'FREE',
    profiles: ['DEEP'],
  },
  dalfox: {
    id: 'dalfox',
    binaryEnvVar: 'VULN_TOOL_BIN_DALFOX',
    allowedTargetKinds: WEB_TARGETS,
    riskLevel: 'SAFE_ACTIVE',
    minPlan: 'FREE',
    profiles: ['DEEP'],
  },
};

/// Tools a profile runs. DEEP is refused unless its feature flag is on.
export function toolsForProfile(
  profile: ScanProfile,
  flags: { deepEnabled: boolean },
): ToolCatalogEntry[] {
  if (profile === 'DEEP' && !flags.deepEnabled) {
    throw new Error('The DEEP scan profile is not enabled on this deployment.');
  }
  return Object.values(TOOL_CATALOG).filter((tool) => tool.profiles.includes(profile));
}
