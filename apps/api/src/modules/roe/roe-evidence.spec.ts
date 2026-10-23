import { describe, expect, it } from '@jest/globals';
import { ROE_LIMITS } from '@pentesthub/shared';
import { safeEvidenceName, sniffEvidence } from './roe-evidence.js';
import { generateRoeToken, hashRoeToken, looksLikeRoeToken } from './roe-token.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

describe('sniffEvidence', () => {
  it('accepts a PDF, PNG, JPEG and a saved email by their own bytes', () => {
    expect(sniffEvidence(Buffer.from('%PDF-1.7\n...'), 'a.bin')).toMatchObject({ ok: true, evidence: { mime: 'application/pdf' } });
    expect(sniffEvidence(PNG, 'a.txt')).toMatchObject({ ok: true, evidence: { mime: 'image/png' } });
    expect(sniffEvidence(JPEG, 'a.txt')).toMatchObject({ ok: true, evidence: { mime: 'image/jpeg' } });
    expect(sniffEvidence(Buffer.from('From: ciso@acme.example\r\nSubject: OK to test\r\n\r\nYes.'), 'approval.eml')).toMatchObject({
      ok: true,
      evidence: { mime: 'message/rfc822' },
    });
  });

  it('refuses HTML, SVG, scripts and executables, whatever the file name says', () => {
    for (const body of [
      '<!doctype html><script>alert(1)</script>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
      '<?xml version="1.0"?><svg/>',
      'MZ\u0090\u0000\u0003',
      '#!/bin/sh\nrm -rf /',
    ]) {
      for (const name of ['signed.pdf', 'scan.png', 'mail.eml', 'x.html']) {
        expect(sniffEvidence(Buffer.from(body, 'latin1'), name)).toMatchObject({ ok: false, reason: 'UNSUPPORTED' });
      }
    }
  });

  it('only treats text as an email when it is named .eml and starts like one', () => {
    expect(sniffEvidence(Buffer.from('hello there'), 'note.eml')).toMatchObject({ ok: false });
    expect(sniffEvidence(Buffer.from('From: a@b.example\r\n\r\n'), 'note.txt')).toMatchObject({ ok: false });
    expect(sniffEvidence(Buffer.from('From: a@b.example\r\n\u0000binary'), 'note.eml')).toMatchObject({ ok: false });
  });

  it('enforces the size cap and refuses empty files', () => {
    expect(sniffEvidence(Buffer.alloc(0), 'a.pdf')).toMatchObject({ ok: false, reason: 'EMPTY' });
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(ROE_LIMITS.evidenceMaxBytes)]);
    expect(sniffEvidence(big, 'a.pdf')).toMatchObject({ ok: false, reason: 'TOO_LARGE' });
  });
});

describe('safeEvidenceName', () => {
  it('drops paths and odd characters and forces the sniffed extension', () => {
    expect(safeEvidenceName('../../etc/passwd.html', 'pdf')).toBe('passwd.pdf');
    expect(safeEvidenceName('C:\\Users\\me\\Signed "ROE".pdf', 'pdf')).toBe('Signed _ROE_.pdf');
    expect(safeEvidenceName('\r\nX-Evil: 1.exe', 'png')).toBe('__X-Evil_ 1.png');
    expect(safeEvidenceName('', 'eml')).toBe('evidence.eml');
    expect(safeEvidenceName('a'.repeat(500) + '.pdf', 'pdf').length).toBeLessThanOrEqual(84);
  });
});

describe('tokens', () => {
  it('are 256-bit, unique, well formed, and stored only as a hash', () => {
    const a = generateRoeToken();
    const b = generateRoeToken();
    expect(a).not.toBe(b);
    expect(looksLikeRoeToken(a)).toBe(true);
    expect(Buffer.from(a.slice(4), 'base64url')).toHaveLength(32);
    expect(hashRoeToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRoeToken(a)).not.toContain(a.slice(4));
    expect(hashRoeToken(a)).not.toBe(hashRoeToken(b));
  });

  it('rejects anything that is not shaped like a token before touching the database', () => {
    for (const bad of ['', 'roe_', 'roe_short', 'x'.repeat(47), `roe_${'a'.repeat(44)}`, `roe_${'!'.repeat(43)}`, undefined, 42]) {
      expect(looksLikeRoeToken(bad as never)).toBe(false);
    }
  });
});
