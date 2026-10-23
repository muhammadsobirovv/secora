import { isIP } from 'node:net';
import { ROE_ASSET_TYPES, ROE_LIMITS, type RoeAssetInputDto, type RoeAssetType } from '@pentesthub/shared';

/// The rules of a client engagement authorization, as pure functions: what an
/// asset may be, which mailbox may approve for it, how long it may last, and
/// which host an authorization covers. Nothing here touches a database or the
/// network, so every rule is covered by a unit test.

export type RoeRuleCode =
  | 'ROE_INVALID_REQUEST'
  | 'ROE_IP_NOT_SUPPORTED'
  | 'ROE_EMAIL_DOMAIN_MISMATCH'
  | 'ROE_EMAIL_BLOCKED';

export class RoeRuleError extends Error {
  constructor(
    readonly code: RoeRuleCode,
    message: string,
  ) {
    super(message);
    this.name = 'RoeRuleError';
  }
}

const HOST_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/// Two-label public suffixes the registrable-domain rule must know about. Not a
/// full public-suffix list: any suffix missing here is treated as one label, so
/// the email rule gets stricter (never looser) only where the list is incomplete
/// in the other direction; the limit is documented in the authorization model.
const TWO_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'net.nz', 'govt.nz',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'com.tr', 'org.tr', 'net.tr', 'gov.tr', 'edu.tr',
  'com.ua', 'org.ua', 'net.ua', 'gov.ua',
  'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in',
  'co.za', 'org.za', 'gov.za', 'ac.za',
  'com.mx', 'org.mx', 'gob.mx',
  'com.ar', 'org.ar', 'gob.ar',
  'com.sg', 'org.sg', 'edu.sg', 'gov.sg',
  'com.hk', 'org.hk', 'edu.hk', 'gov.hk',
  'com.tw', 'org.tw', 'edu.tw', 'gov.tw',
  'co.kr', 'or.kr', 'go.kr', 'ac.kr',
  'com.uz', 'org.uz', 'net.uz', 'gov.uz', 'edu.uz',
  'com.ru', 'org.ru', 'net.ru',
  'co.id', 'or.id', 'go.id', 'ac.id',
  'com.pl', 'org.pl', 'net.pl', 'edu.pl',
  'com.kz', 'org.kz', 'edu.kz', 'gov.kz',
  'com.pk', 'org.pk', 'gov.pk', 'com.eg', 'com.sa', 'com.ng', 'co.ke',
]);

/// Mailbox providers that anybody can open: never proof that a mailbox belongs
/// to a client's organisation.
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'outlook.com', 'hotmail.com',
  'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com',
  'pm.me', 'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru', 'ya.ru', 'mail.ru',
  'bk.ru', 'inbox.ru', 'list.ru', 'rambler.ru', 'ukr.net', 'qq.com', '163.com', '126.com', 'fastmail.com',
  'tutanota.com', 'tuta.io', 'hey.com', 'duck.com',
]);

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmailo.com',
  'yopmail.com', 'yopmail.net', 'trashmail.com', 'trashmail.net', 'getnada.com', 'nada.email', 'dispostable.com',
  'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'mailnesia.com', 'spamgourmet.com',
  'tempinbox.com', 'emailondeck.com', 'moakt.com', 'mohmal.com', 'burnermail.io', 'mailcatch.com', 'mytemp.email',
  'tmpmail.org', 'tmpmail.net', 'fakemail.net', 'getairmail.com', 'discard.email', 'spambox.us', 'grr.la',
]);

export function isPublicSuffix(host: string): boolean {
  const labels = host.split('.');
  return labels.length < 2 || TWO_LABEL_SUFFIXES.has(host);
}

/// The registrable domain ("apex") of a hostname: example.org for
/// shop.eu.example.org, example.co.uk for www.example.co.uk.
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split('.');
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return TWO_LABEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export interface NormalizedAsset {
  type: RoeAssetType;
  /// Normalised text: the hostname, or the origin of a URL.
  value: string;
  host: string;
  wildcard: boolean;
}

const ipLike = (text: string): boolean => isIP(text.replace(/^\[|\]$/g, '')) !== 0 || /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,3})?$/.test(text) || /^[0-9a-f:]+\/\d{1,3}$/i.test(text);

const IP_MESSAGE =
  'IP addresses and CIDR ranges cannot be authorized through a client engagement in this version. Use a domain, subdomain or URL, or prove ownership instead.';

function invalid(message: string): never {
  throw new RoeRuleError('ROE_INVALID_REQUEST', message);
}

export function normalizeAsset(input: RoeAssetInputDto): NormalizedAsset {
  if (!ROE_ASSET_TYPES.includes(input.type)) {
    // "IP", "IP_ADDRESS", "CIDR" and anything else that is not a supported type.
    if (/^(IP|IP_ADDRESS|CIDR)$/i.test(String(input.type))) throw new RoeRuleError('ROE_IP_NOT_SUPPORTED', IP_MESSAGE);
    invalid(`Unsupported asset type "${String(input.type).slice(0, 20)}". Use a domain, subdomain or URL.`);
  }
  const raw = (input.value ?? '').trim();
  if (raw === '' || raw.length > 300) invalid('Each asset needs a value (at most 300 characters).');
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\s\u0000-\u001f]/.test(raw)) invalid(`"${raw.slice(0, 60)}" contains spaces or control characters.`);

  if (input.type === 'URL') {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return invalid(`"${raw.slice(0, 60)}" is not a valid URL. Include http:// or https://.`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') invalid('Only http and https URLs are supported.');
    if (url.username || url.password) invalid('A URL must not contain credentials.');
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (ipLike(hostname)) throw new RoeRuleError('ROE_IP_NOT_SUPPORTED', IP_MESSAGE);
    if (!HOST_PATTERN.test(hostname)) invalid(`"${hostname.slice(0, 60)}" is not a valid hostname.`);
    return { type: 'URL', value: url.origin, host: hostname, wildcard: false };
  }

  if (ipLike(raw)) throw new RoeRuleError('ROE_IP_NOT_SUPPORTED', IP_MESSAGE);
  let host = raw.toLowerCase().replace(/\.$/, '');
  let wildcard = input.wildcard === true;
  if (host.startsWith('*.')) {
    host = host.slice(2);
    wildcard = true;
  }
  if (host.includes('/') || host.includes(':') || host.includes('@')) {
    invalid(`"${raw.slice(0, 60)}" must be a plain hostname, without http://, a path or a port. Use the URL type for those.`);
  }
  if (!HOST_PATTERN.test(host)) invalid(`"${raw.slice(0, 60)}" is not a valid hostname.`);
  if (isPublicSuffix(host)) invalid(`"${host}" is a public suffix, not a site. Enter the site's own domain.`);
  return { type: input.type, value: host, host, wildcard };
}

export function normalizeAssets(inputs: RoeAssetInputDto[]): NormalizedAsset[] {
  if (!Array.isArray(inputs) || inputs.length === 0) invalid('Add at least one asset to the scope.');
  if (inputs.length > ROE_LIMITS.maxAssets) invalid(`A request can list at most ${ROE_LIMITS.maxAssets} assets.`);
  const seen = new Set<string>();
  const out: NormalizedAsset[] = [];
  for (const input of inputs) {
    const asset = normalizeAsset(input);
    const key = `${asset.type}|${asset.value}|${asset.wildcard}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Client mailbox
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[a-z0-9._%+-]{1,64}@([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

/// The mailbox that approves must belong to the organisation whose assets are
/// being tested: its domain has to be the registrable domain of EVERY asset, or
/// a subdomain of it. That stops a requester approving their own request from a
/// personal address. Free-mail, disposable domains and the requester's own
/// account mailbox are refused outright.
export function validateClientEmail(
  email: string,
  assets: NormalizedAsset[],
  requesterEmail: string,
): { email: string; domain: string } {
  const normalized = (email ?? '').trim().toLowerCase();
  if (normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    invalid('Enter a valid client contact email address.');
  }
  const domain = normalized.split('@')[1];
  if (normalized === requesterEmail.trim().toLowerCase()) {
    throw new RoeRuleError('ROE_EMAIL_BLOCKED', 'The client contact cannot be your own account email.');
  }
  if (FREE_MAIL.has(domain)) {
    throw new RoeRuleError('ROE_EMAIL_BLOCKED', 'Use the client\'s own organisation email address, not a free personal mailbox.');
  }
  if (DISPOSABLE.has(domain)) {
    throw new RoeRuleError('ROE_EMAIL_BLOCKED', 'Disposable email domains cannot approve a client engagement.');
  }
  if (isPublicSuffix(domain)) {
    throw new RoeRuleError('ROE_EMAIL_BLOCKED', 'That email domain is not an organisation domain.');
  }
  for (const asset of assets) {
    const apex = registrableDomain(asset.host);
    if (domain !== apex && !domain.endsWith(`.${apex}`)) {
      throw new RoeRuleError(
        'ROE_EMAIL_DOMAIN_MISMATCH',
        `The client's email domain (${domain}) must be ${apex} or one of its subdomains, because ${asset.host} is in the scope. Use an address at the client's own domain.`,
      );
    }
  }
  return { email: normalized, domain };
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export function validateWindow(startIso: string, endIso: string, now: Date): { start: Date; end: Date } {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) invalid('Enter a valid test window (start and end).');
  if (end <= start) invalid('The test window must end after it starts.');
  if (end <= now) invalid('The test window must end in the future.');
  if (start.getTime() < now.getTime() - 60 * 60 * 1000) invalid('The test window cannot start more than an hour in the past.');
  if (start.getTime() > now.getTime() + 60 * DAY_MS) invalid('The test window cannot start more than 60 days from now.');
  if (end.getTime() - start.getTime() > ROE_LIMITS.maxWindowDays * DAY_MS) {
    invalid(`The test window can be at most ${ROE_LIMITS.maxWindowDays} days long.`);
  }
  return { start, end };
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export interface CoverageAsset {
  type: string;
  host: string;
  wildcard: boolean;
}

/// Whether an asset covers a hostname: the host itself, and its subdomains only
/// when the wildcard flag is on. A lookalike ("evilexample.org") is never covered.
export function assetCoversHost(asset: CoverageAsset, host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h === asset.host) return true;
  return asset.wildcard && asset.type !== 'URL' && h.endsWith(`.${asset.host}`);
}

/// The hostname a scan target points at, or null for a target type an
/// engagement cannot cover (IP addresses, CIDR ranges, anything else).
export function targetHost(type: string, value: string): string | null {
  if (type === 'DOMAIN' || type === 'SUBDOMAIN') {
    const host = value.trim().toLowerCase().replace(/\.$/, '');
    return HOST_PATTERN.test(host) ? host : null;
  }
  if (type === 'URL') {
    try {
      const hostname = new URL(value).hostname.replace(/^\[|\]$/g, '').toLowerCase();
      return HOST_PATTERN.test(hostname) && !ipLike(hostname) ? hostname : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function findCoveringAsset<T extends CoverageAsset>(assets: T[], type: string, value: string): T | null {
  const host = targetHost(type, value);
  if (!host) return null;
  return assets.find((asset) => assetCoversHost(asset, host)) ?? null;
}
