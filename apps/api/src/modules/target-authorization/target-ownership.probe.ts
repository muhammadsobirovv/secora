import { isIP } from 'node:net';
import { lookup, Resolver } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import {
  isPrivateIpv4,
  isPrivateIpv6,
} from '../../common/utils/ssrf-guard.util.js';

/// Network side of the ownership check, behind an interface so the decision
/// logic in TargetOwnershipService is unit-tested without the network.
export const OWNERSHIP_PROBE = Symbol('OWNERSHIP_PROBE');

export interface OwnershipProbe {
  /// Addresses the host resolves to (used by the network guard).
  resolveAddresses(host: string): Promise<string[]>;
  /// TXT record values at `name` (chunks already joined). Empty when none.
  dnsTxtValues(name: string): Promise<string[]>;
  /// GET https://<host><path>. Redirects are never followed.
  fetchText(
    host: string,
    path: string,
    maxBytes: number,
  ): Promise<{ status: number; body: string }>;
}

/// Thrown when the host resolves to a private, loopback, link-local or
/// metadata address. Checked for every resolved address, before connecting.
export class OwnershipNetworkBlockedError extends Error {
  constructor() {
    super('The host resolves to a private, internal or reserved address.');
    this.name = 'OwnershipNetworkBlockedError';
  }
}

function isPrivate(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true; // not an IP: fail closed
}

const FETCH_TIMEOUT_MS = 8000;

/// Production probe. Two protections against DNS rebinding and SSRF:
///  - every address the name resolves to must be public, otherwise nothing is
///    fetched;
///  - the connection is pinned to the single address that was checked (the
///    `lookup` override), so a second resolution cannot point it elsewhere.
/// Redirects are not followed: a 3xx answer means "not verified" rather than
/// a hop to a host that was never checked.
export type AddressLookup = (
  host: string,
) => Promise<{ address: string; family: number }[]>;

/// The `lookup` option that pins a connection to one address. Node (20 and later,
/// "happy eyeballs") calls it with `all: true` and then expects a LIST of addresses;
/// answering with a bare address makes every connection fail with
/// ERR_INVALID_IP_ADDRESS. Both call styles are answered here.
export function pinnedLookup(pinned: { address: string; family: number }) {
  return (
    _hostname: string,
    options: { all?: boolean } | undefined,
    callback: (
      error: Error | null,
      address: string | { address: string; family: number }[],
      family?: number,
    ) => void,
  ): void => {
    if (options?.all) callback(null, [{ address: pinned.address, family: pinned.family }]);
    else callback(null, pinned.address, pinned.family);
  };
}

export class NetworkOwnershipProbe implements OwnershipProbe {
  constructor(
    private readonly lookupAddresses: AddressLookup = (host) =>
      lookup(host, { all: true, verbatim: true }),
  ) {}

  async resolveAddresses(host: string): Promise<string[]> {
    return (await this.lookupAddresses(host)).map((a) => a.address);
  }

  async dnsTxtValues(name: string): Promise<string[]> {
    const query = async (servers?: string[]): Promise<string[]> => {
      const resolver = new Resolver({ timeout: 5000, tries: 2 });
      if (servers) resolver.setServers(servers);
      const records = await resolver.resolveTxt(name);
      return records.map((chunks) => chunks.join(''));
    };
    const isEmpty = (error: unknown): boolean => {
      const code = (error as NodeJS.ErrnoException).code;
      return code === 'ENODATA' || code === 'ENOTFOUND';
    };
    try {
      return await query();
    } catch (error) {
      if (isEmpty(error)) return [];
      // The system resolver failed (timeout, refused, SERVFAIL). Retry once
      // against public resolvers; a TXT proof is public data, so this leaks nothing.
      try {
        return await query(['1.1.1.1', '8.8.8.8']);
      } catch (fallbackError) {
        if (isEmpty(fallbackError)) return [];
        throw fallbackError;
      }
    }
  }

  async fetchText(
    host: string,
    path: string,
    maxBytes: number,
  ): Promise<{ status: number; body: string }> {
    const addresses = await this.lookupAddresses(host);
    if (addresses.length === 0) {
      throw new Error('UNREACHABLE');
    }
    if (addresses.some((a) => isPrivate(a.address))) {
      throw new OwnershipNetworkBlockedError();
    }
    const pinned = addresses[0];

    return new Promise((resolve, reject) => {
      const req = httpsRequest(
        {
          host,
          servername: host,
          path,
          method: 'GET',
          port: 443,
          timeout: FETCH_TIMEOUT_MS,
          headers: {
            host,
            'user-agent': 'SecoraOwnershipCheck/1.0',
            accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
          },
          lookup: pinnedLookup(pinned) as never,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            res.resume();
            resolve({ status, body: '' });
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
              req.destroy();
              resolve({ status, body: Buffer.concat(chunks).toString('utf8') });
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () =>
            resolve({ status, body: Buffer.concat(chunks).toString('utf8') }),
          );
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error('UNREACHABLE')));
      req.on('error', reject);
      req.end();
    });
  }
}
