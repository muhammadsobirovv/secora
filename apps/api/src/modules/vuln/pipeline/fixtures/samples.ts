/// SYNTHETIC edge-case inputs (a stray non-JSON line, empty fields, an unknown
/// severity, a redirect). They are not tool output. The real recorded output
/// is in recorded.ts and is what the main parser tests use.

export const HTTPX_SAMPLE = [
  '{"timestamp":"2026-10-21T10:00:01Z","url":"https://shop.example.org","status_code":200,"title":"Example Shop","webserver":"nginx/1.24.0","tech":["Nginx","PHP"],"port":"443","host":"203.0.113.10"}',
  '{"timestamp":"2026-10-21T10:00:02Z","url":"http://shop.example.org","status_code":301,"webserver":"nginx/1.24.0","location":"https://shop.example.org/","port":"80","host_ip":"203.0.113.10"}',
  'not json line that a tool printed to stdout',
  '{"timestamp":"2026-10-21T10:00:03Z","url":"https://api.shop.example.org","status_code":401,"title":"","tech":[],"port":"443"}',
].join('\n');

export const NUCLEI_SAMPLE = [
  '{"template-id":"git-config","info":{"name":"Git Config File Exposure","severity":"medium"},"type":"http","host":"https://shop.example.org","matched-at":"https://shop.example.org/.git/config","timestamp":"2026-10-21T10:05:12Z"}',
  '{"template-id":"tech-detect","info":{"name":"Wappalyzer Technology Detection","severity":"info"},"type":"http","host":"https://shop.example.org","matched-at":"https://shop.example.org"}',
  '{"template-id":"weird-template","info":{"name":"Unknown severity sample","severity":"catastrophic"},"matched-at":"https://shop.example.org/x"}',
  '{"template-id":"cve-2021-0000","info":{"name":"Sample CVE","severity":"HIGH"},"host":"https://shop.example.org"}',
  '[INF] Current nuclei version: v3.3.0',
].join('\n');
