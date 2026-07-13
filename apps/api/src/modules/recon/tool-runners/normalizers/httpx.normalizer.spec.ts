import { describe, expect, it } from '@jest/globals';
import { HttpxNormalizer } from './httpx.normalizer.js';

describe('HttpxNormalizer', () => {
  it('parses one probed URL into a URL finding, an HTTP_HEADER finding for the server header, and TECHNOLOGY findings', () => {
    const raw = JSON.stringify({
      url: 'https://example.com',
      status_code: 200,
      title: 'Example Domain',
      webserver: 'nginx',
      tech: ['nginx', 'PHP:7.4'],
      content_length: 1256,
    });

    const findings = new HttpxNormalizer().normalize(raw);

    expect(findings).toContainEqual(
      expect.objectContaining({
        type: 'URL',
        value: 'https://example.com',
        dedupKey: 'https://example.com/',
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        type: 'HTTP_HEADER',
        value: 'Server: nginx',
        dedupKey: 'example.com:server',
      }),
    );
    expect(findings.filter((f) => f.type === 'TECHNOLOGY')).toHaveLength(2);
  });

  it('omits the HTTP_HEADER finding when no webserver is reported', () => {
    const raw = JSON.stringify({
      url: 'https://example.com',
      status_code: 200,
    });
    const findings = new HttpxNormalizer().normalize(raw);
    expect(findings.filter((f) => f.type === 'HTTP_HEADER')).toHaveLength(0);
  });
});
