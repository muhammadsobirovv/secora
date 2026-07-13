import { describe, expect, it } from '@jest/globals';
import { DirsearchNormalizer } from './dirsearch.normalizer.js';
import type { Normalizer } from './normalizer.interface.js';

// Typed as the `Normalizer` interface (not the concrete class) so these
// tests call normalize() exactly the way VulnScanJobExecutionService does
// in production — with the (rawOutput, ctx) contract — even though this
// particular normalizer's implementation doesn't currently read `ctx`.
const normalizer: Normalizer = new DirsearchNormalizer();

describe('DirsearchNormalizer', () => {
  it('parses dirsearch stdout table lines into findings', () => {
    const raw = [
      '[10:20:30] 200 -    1KB - /robots.txt',
      '[10:20:31] 301 -    0B  - /admin  ->  /admin/',
      'Task Completed',
    ].join('\n');

    const findings = normalizer.normalize(raw, {
      scanner: 'DIRSEARCH',
      targetValue: 'http://example.com',
    });

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      path: '/robots.txt',
      vulnType: 'exposed-content',
      severity: 'LOW',
    });
    expect(findings[1]).toMatchObject({
      path: '/admin',
      vulnType: 'exposed-redirect',
      data: expect.objectContaining({ redirectTo: '/admin/' }),
    });
  });

  it('ignores lines that do not match the expected format', () => {
    const raw = 'Extensions: php, html | HTTP method: GET';
    expect(
      normalizer.normalize(raw, {
        scanner: 'DIRSEARCH',
        targetValue: 'x',
      }),
    ).toEqual([]);
  });

  it('flags a sensitive path as MEDIUM severity', () => {
    const raw = '[10:20:30] 200 -    2KB - /admin/config.php';
    const [finding] = normalizer.normalize(raw, {
      scanner: 'DIRSEARCH',
      targetValue: 'x',
    });
    expect(finding.severity).toBe('MEDIUM');
  });
});
