import { describe, expect, it } from '@jest/globals';
import { NaabuNormalizer } from './naabu.normalizer.js';

describe('NaabuNormalizer', () => {
  it('parses one JSON object per open port into OPEN_PORT findings', () => {
    const raw = [
      '{"ip":"93.184.216.34","port":80,"host":"example.com","protocol":"tcp"}',
      '{"ip":"93.184.216.34","port":443,"host":"example.com","protocol":"tcp"}',
    ].join('\n');

    const findings = new NaabuNormalizer().normalize(raw);

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      type: 'OPEN_PORT',
      value: '93.184.216.34:80',
      dedupKey: '93.184.216.34:80/tcp',
    });
  });

  it('defaults protocol to tcp when omitted', () => {
    const raw = '{"ip":"1.2.3.4","port":22}';
    const findings = new NaabuNormalizer().normalize(raw);
    expect(findings[0]?.data.protocol).toBe('tcp');
  });
});
