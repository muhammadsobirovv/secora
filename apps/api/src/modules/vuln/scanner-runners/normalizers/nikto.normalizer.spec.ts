import { describe, expect, it } from '@jest/globals';
import { NiktoNormalizer } from './nikto.normalizer.js';
import type { Normalizer } from './normalizer.interface.js';

// Typed as the `Normalizer` interface — see dirsearch.normalizer.spec.ts's
// identical comment.
const normalizer: Normalizer = new NiktoNormalizer();

const XML = `<?xml version="1.0"?>
<niktoscan>
<scandetails targetip="93.184.216.34" targethostname="example.com" targetport="80">
<item id="999986" osvdbid="0" method="GET">
<description>The X-Content-Type-Options header is not set.</description>
<uri>/</uri>
<namelink>http://example.com/</namelink>
</item>
<item id="999987" osvdbid="3092" osvdblink="https://vulners.com/osvdb/OSVDB:3092" method="GET">
<description>/admin/: This might be interesting, directory listing found.</description>
<uri>/admin/</uri>
<namelink>http://example.com/admin/</namelink>
</item>
</scandetails>
</niktoscan>`;

describe('NiktoNormalizer', () => {
  it('parses <item> entries into findings, using osvdbid as the signature when present', () => {
    const findings = normalizer.normalize(XML, {
      scanner: 'NIKTO',
      targetValue: 'http://example.com',
    });

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ signature: 'nikto-999986', path: '/' });
    expect(findings[1]).toMatchObject({
      signature: 'osvdb-3092',
      path: '/admin/',
      severity: 'MEDIUM',
      references: ['https://vulners.com/osvdb/OSVDB:3092'],
    });
  });

  it('returns no findings for unparseable XML', () => {
    expect(
      normalizer.normalize('not xml at all {{{', {
        scanner: 'NIKTO',
        targetValue: 'x',
      }),
    ).toEqual([]);
  });
});
