import { describe, expect, it } from '@jest/globals';
import { parseHttpxJsonl, parseNucleiJsonl } from './parsers.js';
import { HTTPX_SAMPLE, NUCLEI_SAMPLE } from './fixtures/samples.js';

describe('parseHttpxJsonl', () => {
  it('reads the stored fields and skips non-JSON lines', () => {
    expect(parseHttpxJsonl(HTTPX_SAMPLE)).toEqual([
      {
        url: 'https://shop.example.org',
        statusCode: 200,
        title: 'Example Shop',
        webServer: 'nginx/1.24.0',
        technologies: ['Nginx', 'PHP'],
      },
      { url: 'http://shop.example.org', statusCode: 301, title: null, webServer: 'nginx/1.24.0', technologies: [] },
      { url: 'https://api.shop.example.org', statusCode: 401, title: null, webServer: null, technologies: [] },
    ]);
  });
});

describe('parseNucleiJsonl', () => {
  it('maps matches, normalizes severity and ignores log lines', () => {
    expect(parseNucleiJsonl(NUCLEI_SAMPLE).map((m) => [m.templateId, m.severity, m.matchedAt])).toEqual([
      ['git-config', 'medium', 'https://shop.example.org/.git/config'],
      ['tech-detect', 'info', 'https://shop.example.org'],
      ['weird-template', 'unknown', 'https://shop.example.org/x'],
      ['cve-2021-0000', 'high', 'https://shop.example.org'],
    ]);
  });

  it('never throws on garbage input', () => {
    expect(parseNucleiJsonl('{not json\n{"info":{}}\n')).toEqual([]);
  });
});
