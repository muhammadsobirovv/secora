import type { PlanTier } from '@pentesthub/shared';

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

const HOST_PATTERN =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/// Hostnames only. Rejects anything that could read as a flag ("-x"), a URL
/// with credentials, whitespace, or shell metacharacters. The argv array
/// already prevents shell injection; this stops argument injection.
export function assertSafeHost(host: string): string {
  const normalized = host.trim().toLowerCase().replace(/\.$/, '');
  if (!HOST_PATTERN.test(normalized)) {
    throw new Error(`Refusing to run a tool against "${host}": not a valid hostname.`);
  }
  return normalized;
}

/// URL form used for httpx and nuclei: http(s) only, no credentials.
export function assertSafeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Refusing to run a tool against "${url}": not a URL.`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Refusing to run a tool against "${url}": only http(s) is allowed.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Refusing to run a tool against a URL that contains credentials.');
  }
  assertSafeHost(parsed.hostname);
  // Return the caller's own text (validated), not the normalized form, so the
  // argv is exactly what was verified.
  return url.trim();
}

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

export const NUCLEI_PROFILES: Record<ScanProfile, NucleiProfileSettings> = {
  QUICK: {
    tags: ['exposures'],
    rateLimit: 50,
    requestTimeoutSeconds: 10,
    stageTimeoutSeconds: 5 * 60,
  },
  STANDARD: {
    tags: ['exposures', 'misconfiguration', 'cves', 'technologies', 'ssl', 'takeovers', 'default-logins'],
    rateLimit: 30,
    requestTimeoutSeconds: 10,
    stageTimeoutSeconds: 30 * 60,
  },
  DEEP: {
    tags: ['exposures', 'misconfiguration', 'cves', 'technologies', 'ssl', 'takeovers', 'default-logins'],
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
}

const LEGACY_RATE_LIMIT = 30;
const LEGACY_REQUEST_TIMEOUT_SECONDS = 10;

/// nuclei argv. For a bare domain both the host and its https:// form are
/// given, because HTTP templates only run against URLs.
/// `-ni` disables the interactsh out-of-band server: no callbacks to a third
/// party, so a target can never make the scanner phone home elsewhere.
export function buildNucleiArgs(input: NucleiArgsInput): string[] {
  const settings = input.profile ? NUCLEI_PROFILES[input.profile] : undefined;
  const args: string[] = [];

  if (input.target.kind === 'URL') {
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
  if (tags && tags.length > 0) {
    args.push('-tags', tags.join(','));
  }
  if (input.severity && input.severity.length > 0) {
    args.push('-severity', input.severity.join(','));
  }
  if (input.templates && input.templates.length > 0) {
    args.push('-templates', input.templates.join(','));
  }
  return args;
}

export const HTTPX_RATE_LIMIT = 50;
export const HTTPX_TIMEOUT_SECONDS = 10;

export interface HttpxArgsInput {
  /// A URL or a bare hostname (httpx probes both schemes for a bare host).
  target: string;
}

/// httpx argv. Redirects are not followed (httpx's default; no -fr flag is
/// ever passed), so a redirect to another host is never fetched.
export function buildHttpxArgs(input: HttpxArgsInput): string[] {
  const target = input.target.includes('://')
    ? assertSafeUrl(input.target)
    : assertSafeHost(input.target);
  return [
    '-u',
    target,
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
  binaryEnvVar: 'RECON_TOOL_BIN_HTTPX' | 'VULN_TOOL_BIN_NUCLEI';
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
    binaryEnvVar: 'RECON_TOOL_BIN_HTTPX',
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
