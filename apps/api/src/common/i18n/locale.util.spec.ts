import { describe, expect, it } from '@jest/globals';
import { resolveLocale } from './locale.util.js';

describe('resolveLocale', () => {
  it('prefers a valid stored user preference over everything else', () => {
    expect(resolveLocale('ru', 'en-US,en;q=0.9')).toBe('ru');
  });

  it('ignores an invalid/unsupported stored preference and falls through', () => {
    expect(resolveLocale('fr', 'uz-UZ,uz;q=0.9')).toBe('uz');
  });

  it('falls back to the Accept-Language header when there is no stored preference', () => {
    expect(resolveLocale(null, 'ru-RU,ru;q=0.9,en;q=0.5')).toBe('ru');
  });

  it('picks the first supported tag out of a multi-value Accept-Language header', () => {
    expect(resolveLocale(undefined, 'fr-FR,fr;q=0.9,uz;q=0.5,en;q=0.1')).toBe('uz');
  });

  it('strips region subtags before matching (en-US -> en)', () => {
    expect(resolveLocale(null, 'en-US')).toBe('en');
  });

  it('falls back to DEFAULT_LOCALE when nothing matches', () => {
    expect(resolveLocale(null, 'fr-FR,de-DE')).toBe('en');
  });

  it('falls back to DEFAULT_LOCALE when neither input is provided', () => {
    expect(resolveLocale()).toBe('en');
  });

  it('falls back to DEFAULT_LOCALE for an empty Accept-Language header', () => {
    expect(resolveLocale(null, '')).toBe('en');
  });
});
