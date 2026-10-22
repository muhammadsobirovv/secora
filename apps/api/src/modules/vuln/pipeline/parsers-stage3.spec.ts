import { describe, expect, it } from '@jest/globals';
import {
  DALFOX_RECORDED_CLEAN,
  DALFOX_RECORDED_VULNERABLE,
  DNSX_RECORDED_INTERNAL,
  FFUF_RECORDED,
  KATANA_RECORDED,
  NAABU_RECORDED,
} from './fixtures/recorded-stage3.js';
import {
  parseDalfoxJsonl,
  parseDnsxJsonl,
  parseFfufJsonl,
  parseKatanaJsonl,
  parseNaabuJsonl,
  parseSubfinderLines,
} from './parsers.js';

describe('parsers on output recorded from the pinned binaries', () => {
  it('katana: one record per crawled URL', () => {
    const records = parseKatanaJsonl(KATANA_RECORDED);
    expect(records).toHaveLength(9);
    expect(records[0]).toEqual({
      url: 'http://juice.lab.test:3000',
      method: 'GET',
      statusCode: 200,
    });
    expect(records.map((r) => r.url)).toContain(
      'http://juice.lab.test:3000/main.js',
    );
    expect(records.every((r) => r.method === 'GET')).toBe(true);
  });

  it('ffuf: matches with status, size and redirect target', () => {
    const records = parseFfufJsonl(FFUF_RECORDED);
    // ffuf prints matches in completion order, so compare as a set.
    expect(records.map((r) => new URL(r.url).pathname).sort()).toEqual([
      '/assets',
      '/ftp',
      '/metrics',
      '/robots.txt',
    ]);
    expect(records.find((r) => r.url.endsWith('/assets'))).toMatchObject({
      status: 301,
      redirectLocation: '/assets/',
    });
    expect(records.find((r) => r.url.endsWith('/metrics'))).toMatchObject({
      status: 200,
    });
  });

  it('dnsx: A and AAAA answers and the internal-address flag', () => {
    expect(parseDnsxJsonl(DNSX_RECORDED_INTERNAL)).toEqual([
      {
        host: 'localhost',
        a: ['127.0.0.1'],
        aaaa: ['::1'],
        hasInternalIps: true,
        status: 'NOERROR',
      },
    ]);
  });

  it('naabu: the duplicate line for the same port collapses', () => {
    expect(NAABU_RECORDED.split('\n')).toHaveLength(2);
    expect(parseNaabuJsonl(NAABU_RECORDED)).toEqual([
      { ip: '172.24.0.2', port: 3000, protocol: 'tcp' },
    ]);
  });

  it('dalfox: a clean run has no findings, a vulnerable page has one verified finding', () => {
    expect(parseDalfoxJsonl(DALFOX_RECORDED_CLEAN)).toEqual([]);
    const [finding, ...rest] = parseDalfoxJsonl(DALFOX_RECORDED_VULNERABLE);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({
      type: 'V',
      severity: 'High',
      param: 'q',
      method: 'GET',
      cwe: 'CWE-79',
    });
    expect(finding.payload).toContain('alert(1)');
    expect(finding.request).toContain('GET /search?q=');
  });
});

describe('parsers never throw on bad input', () => {
  const junk = 'not json\n{"truncated": \n{}\n\n[1,2]\n';
  it.each([
    ['katana', parseKatanaJsonl],
    ['ffuf', parseFfufJsonl],
    ['dnsx', parseDnsxJsonl],
    ['naabu', parseNaabuJsonl],
    ['dalfox', parseDalfoxJsonl],
  ] as const)('%s ignores junk lines', (_name, parse) => {
    expect(parse(junk)).toEqual([]);
    expect(parse('')).toEqual([]);
  });

  it('naabu rejects out-of-range ports', () => {
    expect(
      parseNaabuJsonl(
        '{"ip":"1.2.3.4","port":0}\n{"ip":"1.2.3.4","port":70000}\n{"ip":"1.2.3.4","port":22}',
      ),
    ).toEqual([{ ip: '1.2.3.4', port: 22, protocol: 'tcp' }]);
  });
});

describe('parseSubfinderLines', () => {
  // No recording exists (subfinder queries third-party sources about a domain);
  // these lines follow subfinder's documented `-silent` output.
  it('keeps hostnames, lower-cases and de-duplicates, drops everything else', () => {
    const out = parseSubfinderLines(
      [
        'API.example.org',
        'api.example.org',
        'www.example.org',
        '[INF] Enumerating subdomains',
        '*.example.org',
        'bad host.example.org',
        '',
      ].join('\n'),
    );
    expect(out).toEqual(['api.example.org', 'www.example.org']);
  });
});
