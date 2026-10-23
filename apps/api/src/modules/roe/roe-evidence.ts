import { ROE_LIMITS } from '@pentesthub/shared';

/// Evidence of the client's written authorization: a signed PDF, a screenshot
/// or a saved email. The type is decided from the file's own bytes, never from
/// the name or the browser's content type, and only these four are accepted.
/// No SVG, no HTML: nothing that could carry script is ever stored.

export interface SniffedEvidence {
  mime: 'application/pdf' | 'image/png' | 'image/jpeg' | 'message/rfc822';
  extension: 'pdf' | 'png' | 'jpg' | 'eml';
}

export type EvidenceCheck =
  | { ok: true; evidence: SniffedEvidence }
  | { ok: false; reason: 'EMPTY' | 'TOO_LARGE' | 'UNSUPPORTED' };

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const EML_HEADER = /^(?:from|to|date|subject|received|return-path|message-id|mime-version|delivered-to|x-[a-z-]+):[ \t]/i;

const startsWith = (buffer: Buffer, bytes: number[]): boolean =>
  buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b);

export function sniffEvidence(buffer: Buffer, originalName: string): EvidenceCheck {
  if (buffer.length === 0) return { ok: false, reason: 'EMPTY' };
  if (buffer.length > ROE_LIMITS.evidenceMaxBytes) return { ok: false, reason: 'TOO_LARGE' };
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { ok: true, evidence: { mime: 'application/pdf', extension: 'pdf' } };
  }
  if (startsWith(buffer, PNG)) return { ok: true, evidence: { mime: 'image/png', extension: 'png' } };
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return { ok: true, evidence: { mime: 'image/jpeg', extension: 'jpg' } };
  if (/\.eml$/i.test(originalName)) {
    const head = buffer.subarray(0, 4096);
    const firstLine = head.toString('latin1').split(/\r?\n/, 1)[0] ?? '';
    if (!head.includes(0) && EML_HEADER.test(firstLine)) {
      return { ok: true, evidence: { mime: 'message/rfc822', extension: 'eml' } };
    }
  }
  return { ok: false, reason: 'UNSUPPORTED' };
}

/// A display name that is safe to store and to put in a Content-Disposition
/// header: no path, no control characters, bounded length, known extension.
export function safeEvidenceName(originalName: string, extension: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? '';
  const stem = base
    .replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9 _.()-]/g, '_')
    .trim()
    .slice(0, 80);
  return `${stem || 'evidence'}.${extension}`;
}
