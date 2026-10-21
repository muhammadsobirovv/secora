import { describe, expect, it } from '@jest/globals';
import { parseHttpxJsonl, parseNucleiJsonl } from './parsers.js';
import { HTTPX_SAMPLE, NUCLEI_SAMPLE } from './fixtures/samples.js';
import { HTTPX_RECORDED, NUCLEI_RECORDED } from './fixtures/recorded.js';

describe('parseHttpxJsonl — real recorded output (httpx v1.12.0, local lab target)', () => {
  it('reads the stored fields from a real httpx line', () => {
    expect(parseHttpxJsonl(HTTPX_RECORDED)).toEqual([
      {
        url: 'http://shop.lab.test',
        statusCode: 200,
        title: 'Lab Shop',
        webServer: expect.stringMatching(/^nginx/),
        technologies: [expect.stringMatching(/^Nginx/)],
        location: null,
        hostIp: expect.stringMatching(/^\d+\.\d+\.\d+\.\d+$/),
      },
    ]);
  });
});

describe('parseNucleiJsonl — real recorded output (nuclei v3.11.1, local lab target)', () => {
  const matches = parseNucleiJsonl(NUCLEI_RECORDED);

  it('finds the exposed .env and .git/config the lab target serves', () => {
    expect(matches.map((m) => m.matchedAt).sort()).toEqual([
      'http://shop.lab.test/.env',
      'http://shop.lab.test/.env',
      'http://shop.lab.test/.env',
      'http://shop.lab.test/.git/config',
    ]);
    expect(matches.find((m) => m.templateId === 'git-config')?.severity).toBe('medium');
    expect(matches.filter((m) => m.severity === 'high')).toHaveLength(3);
  });

  it('only returns template matches, not stats or log lines', () => {
    expect(matches.every((m) => m.templateId.length > 0)).toBe(true);
  });
});

describe('parsers — edge cases (synthetic inputs)', () => {
  it('httpx: skips non-JSON lines, keeps empty fields null and reads a redirect location', () => {
    expect(parseHttpxJsonl(HTTPX_SAMPLE)).toEqual([
      {
        url: 'https://shop.example.org',
        statusCode: 200,
        title: 'Example Shop',
        webServer: 'nginx/1.24.0',
        technologies: ['Nginx', 'PHP'],
        location: null,
        hostIp: null,
      },
      {
        url: 'http://shop.example.org',
        statusCode: 301,
        title: null,
        webServer: 'nginx/1.24.0',
        technologies: [],
        location: 'https://shop.example.org/',
        hostIp: '203.0.113.10',
      },
      {
        url: 'https://api.shop.example.org',
        statusCode: 401,
        title: null,
        webServer: null,
        technologies: [],
        location: null,
        hostIp: null,
      },
    ]);
  });

  it('nuclei: normalizes severity (case, unknown) and ignores log lines', () => {
    expect(parseNucleiJsonl(NUCLEI_SAMPLE).map((m) => [m.templateId, m.severity, m.matchedAt])).toEqual([
      ['git-config', 'medium', 'https://shop.example.org/.git/config'],
      ['tech-detect', 'info', 'https://shop.example.org'],
      ['weird-template', 'unknown', 'https://shop.example.org/x'],
      ['cve-2021-0000', 'high', 'https://shop.example.org'],
    ]);
  });

  it('never throws on garbage input', () => {
    expect(parseNucleiJsonl('{not json\n{"info":{}}\n')).toEqual([]);
    expect(parseHttpxJsonl('{not json\n[]\n')).toEqual([]);
  });
});
