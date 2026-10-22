import { isIP } from 'node:net';
import {
  isPrivateIpv4,
  isPrivateIpv6,
} from '../../../common/utils/ssrf-guard.util.js';
import {
  PinBlockedError,
  resolvePinnedHost,
  type AddressLookup,
  type PinnedHost,
} from './pin.util.js';
import { assertSafeHost } from './safe-input.js';
import { isInScope, type ScopeRule } from './scope.util.js';

export { isInScope, type ScopeRule };

/// What the user proved they control, and therefore what a scan may touch.
///
///  - DNS TXT verification of a DOMAIN target (the apex) covers the apex and
///    every subdomain of it: whoever edits the zone controls the names under it.
///  - HTTP-file and meta-tag verification prove control of one web server,
///    nothing more, so they cover exactly the verified host.
///  - A DNS TXT record on a SUBDOMAIN target is treated like the file methods
///    (exact host only): it proves control of that one name, not of the zone.
export type OwnershipMethodName = 'DNS_TXT' | 'HTTP_FILE' | 'META_TAG';

export function scopeRuleFor(input: {
  host: string;
  targetType: string;
  method: OwnershipMethodName | null;
}): ScopeRule {
  const root = assertSafeHost(input.host);
  return {
    root,
    includeSubdomains:
      input.method === 'DNS_TXT' && input.targetType === 'DOMAIN',
  };
}

export type AdmitFailureReason =
  | 'INVALID_HOST'
  | 'OUT_OF_SCOPE'
  | 'NO_ADDRESS'
  | 'PRIVATE_ADDRESS'
  | 'BAD_URL'
  | 'BAD_SCHEME'
  | 'CREDENTIALS'
  | 'BAD_PORT'
  | 'IP_LITERAL';

export type HostAdmission =
  | { ok: true; pin: PinnedHost }
  | { ok: false; reason: AdmitFailureReason; detail: string };

export type UrlAdmission =
  | { ok: true; url: string; pin: PinnedHost; port: number }
  | { ok: false; reason: AdmitFailureReason; detail: string };

export interface ScopeGuardOptions {
  /// Lab/dev only (the env validation refuses it in production).
  allowPrivateTargets?: boolean;
  lookupAddresses?: AddressLookup;
  /// Ports a discovered URL may use. 80 and 443 are always allowed.
  extraPorts?: number[];
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true; // not an IP: fail closed
}

/// The single gate every host, URL and IP passes before a tool may touch it.
/// The target host is admitted first; everything a tool DISCOVERS afterwards
/// (crawled URLs, subdomains, resolved addresses, redirect targets) goes through
/// the same checks again: in scope for the ownership method, public addresses
/// only, http(s) on an allowed port.
///
/// Each host is resolved exactly once; the first answer is cached and is what
/// every later stage connects to (through the pinning proxy). A name that
/// starts answering with an internal address afterwards (DNS rebinding) cannot
/// change where a tool connects, and an answer that mixes public and internal
/// addresses is refused outright.
export class ScopeGuard {
  private readonly pins = new Map<string, HostAdmission>();
  private readonly ports: Set<number>;

  constructor(
    readonly rule: ScopeRule,
    private readonly options: ScopeGuardOptions = {},
  ) {
    this.ports = new Set([80, 443, ...(options.extraPorts ?? [])]);
  }

  isInScope(host: string): boolean {
    return isInScope(host, this.rule);
  }

  /// Registers a host that was already resolved and checked (the target's own pin).
  register(pin: PinnedHost): void {
    this.pins.set(pin.host, { ok: true, pin });
  }

  allowedPorts(): number[] {
    return [...this.ports];
  }

  /// Every host admitted so far, with the address it is pinned to.
  admittedPins(): PinnedHost[] {
    const result: PinnedHost[] = [];
    for (const admission of this.pins.values()) {
      if (admission.ok) result.push(admission.pin);
    }
    return result;
  }

  async admitHost(host: string): Promise<HostAdmission> {
    let normalized: string;
    if (isIP(host.trim().replace(/^\[|\]$/g, '')) !== 0) {
      return {
        ok: false,
        reason: 'IP_LITERAL',
        detail: `${host} is an IP address, not a hostname.`,
      };
    }
    try {
      normalized = assertSafeHost(host);
    } catch {
      return {
        ok: false,
        reason: 'INVALID_HOST',
        detail: `${host} is not a valid hostname.`,
      };
    }
    if (!isInScope(normalized, this.rule)) {
      return {
        ok: false,
        reason: 'OUT_OF_SCOPE',
        detail: `${normalized} is outside the verified scope (${this.describeScope()}).`,
      };
    }
    const cached = this.pins.get(normalized);
    if (cached) return cached;

    let admission: HostAdmission;
    try {
      const pin = await resolvePinnedHost(normalized, {
        allowPrivateTargets: this.options.allowPrivateTargets,
        lookupAddresses: this.options.lookupAddresses,
      });
      admission = { ok: true, pin };
    } catch (error) {
      admission =
        error instanceof PinBlockedError
          ? {
              ok: false,
              reason:
                error.reason === 'NO_ADDRESS'
                  ? 'NO_ADDRESS'
                  : 'PRIVATE_ADDRESS',
              detail: error.message,
            }
          : {
              ok: false,
              reason: 'INVALID_HOST',
              detail: `${normalized} could not be checked.`,
            };
    }
    this.pins.set(normalized, admission);
    return admission;
  }

  /// A URL found by a tool (or a redirect `Location`, resolved against `base`).
  async admitUrl(raw: string, base?: string): Promise<UrlAdmission> {
    let parsed: URL;
    try {
      parsed = new URL(raw, base);
    } catch {
      return { ok: false, reason: 'BAD_URL', detail: `${raw} is not a URL.` };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        ok: false,
        reason: 'BAD_SCHEME',
        detail: `${parsed.protocol} URLs are not scanned.`,
      };
    }
    if (parsed.username || parsed.password) {
      return {
        ok: false,
        reason: 'CREDENTIALS',
        detail: 'URLs with credentials are not scanned.',
      };
    }
    const port = parsed.port
      ? Number(parsed.port)
      : parsed.protocol === 'https:'
        ? 443
        : 80;
    if (!this.ports.has(port)) {
      return {
        ok: false,
        reason: 'BAD_PORT',
        detail: `Port ${port} is not allowed for this scan.`,
      };
    }
    const host = await this.admitHost(parsed.hostname.replace(/^\[|\]$/g, ''));
    if (!host.ok) return host;
    parsed.hash = '';
    return { ok: true, url: parsed.toString(), pin: host.pin, port };
  }

  /// An address a tool reported (dnsx answer, naabu target). Public only.
  admitIp(
    address: string,
  ): { ok: true } | { ok: false; reason: AdmitFailureReason; detail: string } {
    if (isIP(address) === 0) {
      return {
        ok: false,
        reason: 'INVALID_HOST',
        detail: `${address} is not an IP address.`,
      };
    }
    if (!this.options.allowPrivateTargets && isPrivateAddress(address)) {
      return {
        ok: false,
        reason: 'PRIVATE_ADDRESS',
        detail: `${address} is a private, internal or reserved address.`,
      };
    }
    return { ok: true };
  }

  private describeScope(): string {
    return this.rule.includeSubdomains
      ? `${this.rule.root} and its subdomains`
      : this.rule.root;
  }
}
