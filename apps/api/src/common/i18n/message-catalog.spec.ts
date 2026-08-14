import { describe, expect, it } from '@jest/globals';
import { translate } from './message-catalog.js';

describe('translate', () => {
  it('renders an English message with interpolated params', () => {
    expect(translate('bugbounty.deadline.overdueTitle', 'en', { eventTitle: 'Report submission' })).toBe(
      'Overdue: Report submission',
    );
  });

  it('renders the same key in Uzbek', () => {
    expect(translate('bugbounty.deadline.upcomingTitle', 'uz', { eventTitle: 'Kickoff call' })).toBe(
      "Yaqinlashib kelmoqda: Kickoff call",
    );
  });

  it('renders the same key in Russian', () => {
    expect(translate('bugbounty.deadline.upcomingTitle', 'ru', { eventTitle: 'Kickoff call' })).toBe(
      'Скоро: Kickoff call',
    );
  });

  it('interpolates multiple params for the notes variant', () => {
    const result = translate('bugbounty.deadline.bodyWithNotes', 'en', {
      dueAt: '2026-08-20T00:00:00.000Z',
      notes: 'final review needed',
    });
    expect(result).toBe('Due 2026-08-20T00:00:00.000Z — final review needed');
  });

  it('is total for every key across every supported locale (no missing translations)', () => {
    const locales = ['en', 'uz', 'ru'] as const;
    const keys = [
      'bugbounty.deadline.overdueTitle',
      'bugbounty.deadline.upcomingTitle',
      'bugbounty.deadline.body',
      'bugbounty.deadline.bodyWithNotes',
    ] as const;

    for (const locale of locales) {
      for (const key of keys) {
        expect(() => translate(key, locale, { eventTitle: 'x', dueAt: 'x', notes: 'x' })).not.toThrow();
      }
    }
  });
});
