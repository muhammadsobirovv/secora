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

export const NUCLEI_PROFILES: Record<ScanProfile, NucleiProfileSettings> = {
  QUICK: {
    tags: ['exposure'],
    rateLimit: 50,
    requestTimeoutSeconds: 10,
    stageTimeoutSeconds: 5 * 60,
  },
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
  profile?: ScanProfile;
  /// Optional narrowing from the job config. With a profile it can only narrow
  /// the profile tags; without one it is the tag list itself.
  severity?: string[];
  tags?: string[];
  /// Explicit template paths from the job config.
  templates?: string[];
  /// DNS pin for the target host. When set the tool connects to the pinned IP
  /// and sends the real name as Host header and SNI.
  pin?: PinnedHost;
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

  if (input.pin) {
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
  if (input.restrictLocalNetwork !== false) {
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

export interface ToolCatalogEntry {
  id: 'httpx' | 'nuclei';
  /// Env var that holds the binary path/name (see env.validation.ts).
  binaryEnvVar: 'VULN_TOOL_BIN_HTTPX' | 'VULN_TOOL_BIN_NUCLEI';
  allowedTargetKinds: CatalogTargetKind[];
  riskLevel: ToolRiskLevel;
  /// Lowest plan that may run this tool; enforced through QuotaService.
  minPlan: PlanTier;
  /// Profiles that include this tool.
  profiles: ScanProfile[];
}

export const TOOL_CATALOG: Record<'httpx' | 'nuclei', ToolCatalogEntry> = {
  httpx: {
    id: 'httpx',
    binaryEnvVar: 'VULN_TOOL_BIN_HTTPX',
    allowedTargetKinds: ['URL', 'DOMAIN', 'SUBDOMAIN'],
    riskLevel: 'SAFE_ACTIVE',
    minPlan: 'FREE',
    profiles: ['QUICK', 'STANDARD', 'DEEP'],
  },
  nuclei: {
    id: 'nuclei',
    binaryEnvVar: 'VULN_TOOL_BIN_NUCLEI',
    allowedTargetKinds: ['URL', 'DOMAIN', 'SUBDOMAIN'],
    riskLevel: 'SAFE_ACTIVE',
    minPlan: 'FREE',
    profiles: ['QUICK', 'STANDARD', 'DEEP'],
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
