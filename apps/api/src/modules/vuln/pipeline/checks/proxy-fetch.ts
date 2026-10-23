import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import type { Duplex } from 'node:stream';
import { assertLocalProxyUrl } from '../tool-catalog.js';
import type { FetchedResponse, FetchOnce } from '../reverify.js';
import { CHECK_USER_AGENT } from './pinned-io.js';

/// One GET through the pinning proxy, for the re-verification stage. http goes
/// to the proxy as an absolute-URI request; https is a CONNECT tunnel with the
/// TLS handshake done here, so the real hostname is the SNI. Certificate errors
/// are ignored on purpose (a broken certificate is a finding in its own right,
/// not a reason to skip re-checking a header). Redirects are never followed and
/// at most `maxBytes` of the body are read.
const TIMEOUT_MS = 10_000;

function collect(
  response: http.IncomingMessage,
  maxBytes: number,
): Promise<FetchedResponse> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(response.headers)) {
        headers[name] = Array.isArray(value) ? value.join(', ') : (value ?? '');
      }
      response.destroy();
      resolve({
        status: response.statusCode ?? 0,
        headers,
        body: Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8'),
      });
    };
    response.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size >= maxBytes) finish();
    });
    response.once('end', finish);
    response.once('close', finish);
    response.once('error', (error) => (done ? undefined : reject(error)));
  });
}

export function createProxyFetch(proxyUrl: string): FetchOnce {
  const proxy = new URL(assertLocalProxyUrl(proxyUrl));
  const headers = { 'user-agent': CHECK_USER_AGENT, accept: '*/*' };

  return (rawUrl, { maxBytes }) =>
    new Promise<FetchedResponse>((resolve, reject) => {
      const target = new URL(rawUrl);
      const timer = setTimeout(
        () => reject(new Error('Request timed out.')),
        TIMEOUT_MS,
      );
      const settle =
        <T>(fn: (value: T) => void) =>
        (value: T) => {
          clearTimeout(timer);
          fn(value);
        };
      const ok = settle(resolve);
      const fail = settle(reject);

      if (target.protocol === 'http:') {
        const req = http.request(
          {
            host: proxy.hostname,
            port: Number(proxy.port),
            method: 'GET',
            path: target.toString(),
            headers: { ...headers, host: target.host },
            agent: false,
          },
          (response) => collect(response, maxBytes).then(ok, fail),
        );
        req.once('error', fail);
        req.end();
        return;
      }

      const port = target.port || '443';
      const connect = http.request({
        host: proxy.hostname,
        port: Number(proxy.port),
        method: 'CONNECT',
        path: `${target.hostname}:${port}`,
        agent: false,
      });
      connect.once('error', fail);
      connect.once('connect', (response, socket: Duplex) => {
        if (response.statusCode !== 200) {
          socket.destroy();
          fail(
            new Error(
              `The pinning proxy refused ${target.host} (HTTP ${response.statusCode}).`,
            ),
          );
          return;
        }
        const secure = tls.connect({
          socket,
          servername: target.hostname,
          rejectUnauthorized: false,
        });
        secure.once('error', fail);
        const req = https.request(
          {
            host: target.hostname,
            port: Number(port),
            method: 'GET',
            path: `${target.pathname}${target.search}`,
            headers,
            // No agent: Node only uses createConnection when none is involved.
            createConnection: () => secure,
          },
          (res) => collect(res, maxBytes).then(ok, fail),
        );
        req.once('error', fail);
        req.end();
      });
      connect.end();
    });
}
