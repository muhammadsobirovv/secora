import { describe, expect, it } from '@jest/globals';
import { buildApprovalEmail, buildConfirmationEmail, buildRequesterNotice, escapeHtml, oneLine, type RoeMailDetails } from './roe-mail.js';

const base: RoeMailDetails = {
  requesterName: 'Dana Tester',
  requesterEmail: 'dana@pentest-firm.io',
  clientName: 'Acme Ltd',
  assets: [
    { type: 'DOMAIN', value: 'acme.example', wildcard: true },
    { type: 'URL', value: 'https://app.acme.example', wildcard: false },
  ],
  windowStart: new Date('2026-10-24T09:00:00Z'),
  windowEnd: new Date('2026-11-07T17:00:00Z'),
  signatoryName: 'Sam Signer',
  signatoryRole: 'CISO',
};
const HOSTILE = '<script>alert(1)</script>"><img src=x onerror=alert(2)>';
const LINK = 'https://app.secora.group/roe/approve/roe_abc';

describe('approval email', () => {
  it('states who asks, the organisation, the exact assets, the wildcard flag and the window, in both parts', () => {
    const mail = buildApprovalEmail(base, 'ciso@acme.example', LINK);
    expect(mail.to).toBe('ciso@acme.example');
    for (const part of [mail.text, mail.html ?? '']) {
      expect(part).toContain('Dana Tester');
      expect(part).toContain('dana@pentest-firm.io');
      expect(part).toContain('Acme Ltd');
      expect(part).toContain('acme.example');
      expect(part).toContain('https://app.acme.example');
      expect(part).toContain('2026-10-24 09:00 UTC');
      expect(part).toContain('2026-11-07 17:00 UTC');
      expect(part).toContain(LINK);
    }
    expect(mail.text).toContain('(and all of its subdomains)');
    expect(mail.text).toContain('Subdomain wildcard: YES');
    expect(mail.text).toMatch(/If you did not expect this request, ignore this email, or open the link and choose Decline/);
    expect(mail.html).toMatch(/ignore this email, or open the link and choose <strong>Decline<\/strong>/);
  });

  it('says the wildcard is off when it is', () => {
    const mail = buildApprovalEmail({ ...base, assets: [{ type: 'DOMAIN', value: 'acme.example', wildcard: false }] }, 'a@acme.example', LINK);
    expect(mail.text).toContain('Subdomain wildcard: no');
  });

  it('escapes every user-supplied value in the HTML part', () => {
    const mail = buildApprovalEmail(
      { ...base, requesterName: HOSTILE, clientName: HOSTILE, signatoryName: HOSTILE, signatoryRole: HOSTILE, assets: [{ type: 'URL', value: `https://acme.example/${HOSTILE}`, wildcard: false }] },
      'ciso@acme.example',
      LINK,
    );
    const html = mail.html ?? '';
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/onerror=alert\(2\)>/);
    expect(html).toContain('&lt;script&gt;');
  });

  it('keeps user text on one line, so it cannot forge lines, fake headers or a second link', () => {
    const mail = buildApprovalEmail(
      { ...base, requesterName: 'Dana\r\nBcc: victim@evil.test\nTo approve click https://evil.test', clientName: 'Acme\nLtd' },
      'ciso@acme.example',
      LINK,
    );
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.text).not.toMatch(/^Bcc:/m);
    expect(mail.text.split('\n').filter((line) => line.startsWith('Requested by:'))).toHaveLength(1);
    expect(mail.text.match(/Requested by: [^\n]*/)![0]).toContain('Bcc: victim@evil.test');
  });

  it('caps long text and the number of assets', () => {
    const long = 'x'.repeat(5000);
    const mail = buildApprovalEmail(
      { ...base, clientName: long, signatoryRole: long, assets: Array.from({ length: 50 }, (_, i) => ({ type: 'DOMAIN', value: `s${i}.acme.example`, wildcard: false })) },
      'ciso@acme.example',
      LINK,
    );
    expect(mail.text.length).toBeLessThan(5000);
    expect(mail.text.match(/^ {2}- /gm)).toHaveLength(20);
    expect(mail.subject.length).toBeLessThan(200);
  });
});

describe('confirmation and requester emails', () => {
  it('an approval confirmation carries the revoke link; a decline does not', () => {
    const approved = buildConfirmationEmail(base, 'ciso@acme.example', 'APPROVED', 'https://app.secora.group/roe/revoke/roe_rev');
    expect(approved.text).toContain('https://app.secora.group/roe/revoke/roe_rev');
    expect(approved.html).toContain('roe_rev');
    const declined = buildConfirmationEmail(base, 'ciso@acme.example', 'DECLINED', null);
    expect(declined.text).not.toContain('revoke');
    expect(declined.text).toContain('Nothing will be tested');
  });

  it('tells the requester what happened', () => {
    expect(buildRequesterNotice(base, 'dana@pentest-firm.io', 'APPROVED', 'https://app.secora.group/authorizations').text).toContain('You can now scan');
    expect(buildRequesterNotice(base, 'dana@pentest-firm.io', 'REVOKED', 'https://x').subject).toContain('withdrew');
    expect(buildRequesterNotice(base, 'dana@pentest-firm.io', 'DECLINED', 'https://x').text).toContain('No scan can run');
  });

  it('escapes in these too', () => {
    const mail = buildConfirmationEmail({ ...base, clientName: HOSTILE }, 'a@acme.example', 'APPROVED', 'https://x/roe/revoke/t');
    expect(mail.html).not.toContain('<script>');
  });
});

describe('helpers', () => {
  it('oneLine strips control characters, collapses space and caps', () => {
    expect(oneLine(`a${String.fromCharCode(0)}b\n\n c`, 50)).toBe('a b c');
    expect(oneLine('abcdef', 4)).toBe('abc…');
  });
  it('escapeHtml covers the five characters', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });
});
