import { describe, expect, it } from '@jest/globals';
import { FeroxbusterNormalizer } from './feroxbuster.normalizer.js';
import type { Normalizer } from './normalizer.interface.js';

// Typed as the `Normalizer` interface — see dirsearch.normalizer.spec.ts's
// identical comment.
const normalizer: Normalizer = new FeroxbusterNormalizer();

describe('FeroxbusterNormalizer', () => {
  it('parses ND-JSON "response" lines and skips other event types', () => {
    const raw = [
      JSON.stringify({ type: 'statistics', foo: 'bar' }),
      JSON.stringify({
        type: 'response',
        url: 'http://example.com/backup.zip',
        status: 200,
        content_length: 4096,
        word_count: 12,
        line_count: 3,
        method: 'GET',
      }),
      JSON.stringify({ type: 'state_change' }),
    ].join('\n');

    const findings = normalizer.normalize(raw, {
      scanner: 'FEROXBUSTER',
      targetValue: 'http://example.com',
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      path: '/backup.zip',
      severity: 'MEDIUM',
      vulnType: 'exposed-content',
      data: expect.objectContaining({ contentLength: 4096, method: 'GET' }),
    });
  });

  it('skips malformed JSON lines', () => {
    const raw = [
      'not json',
      JSON.stringify({
        type: 'response',
        status: 200,
        url: 'http://example.com/x',
      }),
    ].join('\n');
    const findings = normalizer.normalize(raw, {
      scanner: 'FEROXBUSTER',
      targetValue: 'x',
    });
    expect(findings).toHaveLength(1);
  });
});
