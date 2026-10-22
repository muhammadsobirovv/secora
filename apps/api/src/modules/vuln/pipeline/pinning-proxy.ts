import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import net, { type AddressInfo, type Socket } from 'node:net';
import { isIP } from 'node:net';
import {
  isPrivateIpv4,
  isPrivateIpv6,
} from '../../../common/utils/ssrf-guard.util.js';
import type { PinnedHost } from './pin.util.js';

/// A local forward proxy that is the only way the crawler, the content
/// fuzzer and the XSS checker reach the network.
///
/// Those tools resolve names themselves and follow links, so handing them a
/// hostname would let DNS (or a page) steer them anywhere. They are started
/// with `-proxy http://127.0.0.1:<port>` instead, and this proxy decides:
///  - the requested host must be one the ScopeGuard admitted (in scope, public
///    addresses), and the port must be allowed;
///  - it connects to the address pinned for that host, never to a fresh DNS
///    answer, so rebinding cannot redirect a connection;
///  - everything else (other hosts, IP literals, odd ports, redirects the tool
///    tries to follow to another host) gets a 403 and is reported.
/// HTTPS passes through as an opaque CONNECT tunnel, so the tool still does the
/// TLS handshake with the real hostname as SNI and verifies the real
/// certificate. The proxy sees only host and port.
export interface BlockedConnection {
  host: string;
  port: number | null;
  reason: string;
}

export interface PinningProxyOptions {
  /// Live view of admitted hosts (ScopeGuard.admittedPins). Hosts admitted
  /// after the proxy started are usable immediately.
  pins: () => PinnedHost[];
  allowedPorts: () => number[];
  onBlocked?: (info: BlockedConnection) => void;
  /// Lab/dev only: pinned addresses may be private.
  allowPrivateTargets?: boolean;
  maxConnections?: number;
  idleTimeoutMs?: number;
  /// Total bytes relayed in both directions before the proxy cuts everything.
  maxTotalBytes?: number;
}

const DEFAULT_MAX_CONNECTIONS = 64;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024;

const HOP_BY_HOP = new Set([
  'connection',
  'proxy-connection',
  'proxy-authorization',
  'keep-alive',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

export class PinningProxy {
  private readonly server: http.Server;
  private readonly sockets = new Set<Socket>();
  private totalBytes = 0;
  private port = 0;
  private closed = false;

  constructor(private readonly options: PinningProxyOptions) {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.on('connect', (req, socket, head) =>
      this.handleConnect(req, socket as Socket, head),
    );
    this.server.on('clientError', (_error, socket) => socket.destroy());
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', reject);
        this.port = (this.server.address() as AddressInfo).port;
        resolve();
      });
    });
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  get bytesRelayed(): number {
    return this.totalBytes;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /// null when the connection may go ahead, otherwise the reason it may not.
  private resolve(
    host: string,
    port: number,
  ): { ip: string; family: 4 | 6 } | string {
    const normalized = host
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/^\[|\]$/g, '');
    if (isIP(normalized) !== 0) return 'IP literal';
    if (!this.options.allowedPorts().includes(port))
      return `port ${port} not allowed`;
    const pin = this.options
      .pins()
      .find((candidate) => candidate.host === normalized);
    if (!pin) return 'host not admitted for this scan';
    if (!this.options.allowPrivateTargets && isPrivateAddress(pin.ip))
      return 'pinned address is not public';
    return { ip: pin.ip, family: pin.family };
  }

  private block(host: string, port: number | null, reason: string): void {
    this.options.onBlocked?.({ host, port, reason });
  }

  private track(socket: Socket): void {
    this.sockets.add(socket);
    socket.setTimeout(
      this.options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      () => socket.destroy(),
    );
    socket.once('close', () => this.sockets.delete(socket));
    socket.on('data', (chunk: Buffer) => {
      this.totalBytes += chunk.length;
      if (
        this.totalBytes >
        (this.options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES)
      ) {
        for (const open of this.sockets) open.destroy();
      }
    });
  }

  private atCapacity(): boolean {
    return (
      this.sockets.size >=
      (this.options.maxConnections ?? DEFAULT_MAX_CONNECTIONS)
    );
  }

  private handleConnect(
    req: IncomingMessage,
    client: Socket,
    head: Buffer,
  ): void {
    const target = req.url ?? '';
    const separator = target.lastIndexOf(':');
    const host = separator > 0 ? target.slice(0, separator) : target;
    const port = separator > 0 ? Number(target.slice(separator + 1)) : NaN;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      this.block(host, null, 'malformed CONNECT target');
      client.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    const resolved = this.resolve(host, port);
    if (typeof resolved === 'string') {
      this.block(host, port, resolved);
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    if (this.atCapacity()) {
      client.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      return;
    }

    this.track(client);
    const upstream = net.connect({
      host: resolved.ip,
      port,
      family: resolved.family,
    });
    this.track(upstream);
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    const teardown = (): void => {
      client.destroy();
      upstream.destroy();
    };
    upstream.once('error', () => {
      if (!client.destroyed && !client.writableEnded)
        client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      teardown();
    });
    client.once('error', teardown);
    client.once('close', teardown);
    upstream.once('close', teardown);
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    let url: URL;
    try {
      url = new URL(req.url ?? '');
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (url.protocol !== 'http:') {
      this.block(url.hostname, null, `scheme ${url.protocol} not proxied`);
      res.writeHead(403).end();
      return;
    }
    const port = url.port ? Number(url.port) : 80;
    const resolved = this.resolve(url.hostname, port);
    if (typeof resolved === 'string') {
      this.block(url.hostname, port, resolved);
      res.writeHead(403).end();
      return;
    }
    if (this.atCapacity()) {
      res.writeHead(503).end();
      return;
    }

    const headers: http.OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(name.toLowerCase())) headers[name] = value;
    }
    headers.host = url.host;
    const upstream = http.request(
      {
        host: resolved.ip,
        family: resolved.family,
        port,
        method: req.method,
        path: `${url.pathname}${url.search}`,
        headers,
        timeout: this.options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      },
      (response) => {
        const out: http.OutgoingHttpHeaders = {};
        for (const [name, value] of Object.entries(response.headers)) {
          if (!HOP_BY_HOP.has(name.toLowerCase())) out[name] = value;
        }
        res.writeHead(response.statusCode ?? 502, out);
        response.on('data', (chunk: Buffer) => {
          this.totalBytes += chunk.length;
          if (
            this.totalBytes >
            (this.options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES)
          ) {
            response.destroy();
            res.destroy();
          }
        });
        response.pipe(res);
      },
    );
    upstream.once('timeout', () => upstream.destroy());
    upstream.once('error', () => {
      if (!res.headersSent) res.writeHead(502).end();
      else res.destroy();
    });
    res.once('close', () => upstream.destroy());
    req.pipe(upstream);
  }
}
