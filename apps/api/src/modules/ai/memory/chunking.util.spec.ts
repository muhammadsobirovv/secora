import { describe, expect, it } from '@jest/globals';
import { chunkText } from './chunking.util.js';

describe('chunking.util', () => {
  it('returns an empty array for blank input', () => {
    expect(chunkText('   ', 100, 10)).toEqual([]);
    expect(chunkText('', 100, 10)).toEqual([]);
  });

  it('returns a single trimmed chunk when the text already fits', () => {
    expect(chunkText('  short note  ', 100, 10)).toEqual(['short note']);
  });

  it('splits on paragraph boundaries without exceeding chunkSize', () => {
    const paragraphs = ['A'.repeat(40), 'B'.repeat(40), 'C'.repeat(40)];
    const text = paragraphs.join('\n\n');
    const chunks = chunkText(text, 50, 5);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
    // Every paragraph's content must survive somewhere in the output.
    expect(chunks.join(' ')).toContain('A'.repeat(40));
    expect(chunks.join(' ')).toContain('B'.repeat(40));
    expect(chunks.join(' ')).toContain('C'.repeat(40));
  });

  it('packs multiple short paragraphs into one chunk when they fit together', () => {
    const text = 'para one\n\npara two\n\npara three';
    const chunks = chunkText(text, 200, 10);
    expect(chunks).toEqual(['para one\n\npara two\n\npara three']);
  });

  it('hard-splits a single paragraph that alone exceeds chunkSize, with overlap', () => {
    // Two-char, position-unique blocks (not a uniform repeated character) so
    // the overlap assertion below actually proves the slice offsets are
    // correct, rather than trivially passing because every character is
    // the same.
    const longParagraph = Array.from({ length: 60 }, (_, i) =>
      i.toString(36).padStart(2, '0'),
    ).join('');
    const chunks = chunkText(longParagraph, 50, 10);

    expect(chunks).toEqual([
      longParagraph.slice(0, 50),
      longParagraph.slice(40, 90),
      longParagraph.slice(80, 120),
    ]);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
    // Consecutive chunks overlap by exactly the configured amount.
    expect(chunks[0]?.slice(-10)).toBe(chunks[1]?.slice(0, 10));
    expect(chunks[1]?.slice(-10)).toBe(chunks[2]?.slice(0, 10));
  });

  it('never produces an empty chunk', () => {
    const text = 'one\n\n\n\ntwo\n\n   \n\nthree';
    const chunks = chunkText(text, 5, 1);
    expect(chunks.every((c) => c.length > 0)).toBe(true);
  });
});
