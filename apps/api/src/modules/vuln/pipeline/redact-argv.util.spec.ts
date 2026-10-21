import { describe, expect, it } from '@jest/globals';
import { redactArgv } from './redact-argv.util.js';

describe('redactArgv', () => {
  it('leaves an ordinary scan argv unchanged', () => {
    const argv = ['-u', 'https://shop.example.org', '-jsonl', '-rl', '50', '-tags', 'exposure'];
    expect(redactArgv(argv)).toEqual(argv);
  });

  it('keeps the pinning Host header (it is not a secret)', () => {
    expect(redactArgv(['-H', 'Host: shop.example.org', '-sni', 'shop.example.org'])).toEqual([
      '-H',
      'Host: shop.example.org',
      '-sni',
      'shop.example.org',
    ]);
  });

  it('redacts the value of sensitive headers but keeps the header name', () => {
    expect(
      redactArgv([
        '-H',
        'Authorization: Bearer abcdefghijklmnop',
        '-H',
        'Cookie: session=abc123',
        '-H',
        'X-Api-Key: 9f8e7d6c5b4a',
        '-H',
        'Accept: text/html',
      ]),
    ).toEqual([
      '-H',
      'Authorization: [REDACTED]',
      '-H',
      'Cookie: [REDACTED]',
      '-H',
      'X-Api-Key: [REDACTED]',
      '-H',
      'Accept: text/html',
    ]);
  });

  it('redacts the value that follows a secret flag, and the -flag=value form', () => {
    expect(redactArgv(['-password', 'hunter2', '-u', 'x'])).toEqual(['-password', '[REDACTED]', '-u', 'x']);
    expect(redactArgv(['--token=abc123def456'])).toEqual(['--token=[REDACTED]']);
  });

  it('redacts credentials inside URLs and token-like query parameters', () => {
    expect(redactArgv(['-u', 'https://admin:s3cret@shop.example.org/x'])).toEqual([
      '-u',
      'https://[REDACTED]@shop.example.org/x',
    ]);
    expect(redactArgv(['-u', 'https://shop.example.org/cb?code=1&token=abc.def&page=2'])).toEqual([
      '-u',
      'https://shop.example.org/cb?code=1&token=[REDACTED]&page=2',
    ]);
  });

  it('redacts well-known secret formats wherever they appear', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.c2lnbmF0dXJlMTIz';
    const out = redactArgv([
      `x=${jwt}`,
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'AKIAABCDEFGHIJKLMNOP',
      'xoxb-1234567890-abcdefghij',
      'sk_live_abcdefghijklmnop1234',
    ]);
    expect(out).toEqual(['x=[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]']);
  });

  it('does not change the input array', () => {
    const argv = ['-H', 'Authorization: Bearer abcdefghijklmnop'];
    redactArgv(argv);
    expect(argv[1]).toBe('Authorization: Bearer abcdefghijklmnop');
  });
});
