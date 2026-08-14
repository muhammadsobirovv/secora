import { describe, expect, it, jest } from '@jest/globals';
import type { UserPreferencesRepository } from '../domain/repositories/user-preferences.repository.interface.js';
import type { UserPreferences } from '../../../prisma-types.js';
import {
  UpdatePreferencesCommand,
  UpdatePreferencesHandler,
} from './update-preferences.command.js';

function buildPreferences(overrides?: Partial<UserPreferences>): UserPreferences {
  return {
    id: 'pref-1',
    userId: 'user-1',
    theme: 'SYSTEM',
    language: 'en',
    timezone: 'UTC',
    notificationsEnabled: true,
    telemetryOptOut: false,
    onboardingCompletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as UserPreferences;
}

function buildHandler(update: jest.Mock) {
  const repository: UserPreferencesRepository = {
    createDefault: jest.fn(),
    findByUserId: jest.fn(),
    update: update as unknown as UserPreferencesRepository['update'],
  };
  return new UpdatePreferencesHandler(repository);
}

describe('UpdatePreferencesHandler', () => {
  // Module 15 — task #351 (first-run onboarding). The wire-level
  // `onboardingCompleted: boolean` never reaches the repository directly —
  // it's translated into a domain-level `onboardingCompletedAt: Date` at
  // this command boundary. These tests pin that translation down.

  it('translates onboardingCompleted:true into an onboardingCompletedAt timestamp', async () => {
    const update = jest.fn(async () => buildPreferences({ onboardingCompletedAt: new Date('2026-08-13T12:00:00.000Z') }));
    const handler = buildHandler(update);

    await handler.execute(new UpdatePreferencesCommand('user-1', { onboardingCompleted: true }));

    expect(update).toHaveBeenCalledTimes(1);
    const [userId, data] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(userId).toBe('user-1');
    expect(data.onboardingCompletedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('onboardingCompleted');
  });

  it('does not touch onboardingCompletedAt when onboardingCompleted is omitted', async () => {
    const update = jest.fn(async () => buildPreferences({ language: 'ru' }));
    const handler = buildHandler(update);

    await handler.execute(new UpdatePreferencesCommand('user-1', { language: 'ru' }));

    const [, data] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(data).toEqual({ language: 'ru' });
    expect(data).not.toHaveProperty('onboardingCompletedAt');
  });

  it('does not touch onboardingCompletedAt when onboardingCompleted is explicitly false', async () => {
    // No supported "un-complete onboarding" action yet (see the DTO's doc
    // comment) — false is a no-op, same as omitting the field entirely.
    const update = jest.fn(async () => buildPreferences());
    const handler = buildHandler(update);

    await handler.execute(new UpdatePreferencesCommand('user-1', { onboardingCompleted: false, timezone: 'Asia/Tashkent' }));

    const [, data] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(data).toEqual({ timezone: 'Asia/Tashkent' });
  });

  it('maps the repository result through toUserPreferencesDto, including onboardingCompletedAt as ISO string', async () => {
    const completedAt = new Date('2026-08-13T12:00:00.000Z');
    const update = jest.fn(async () => buildPreferences({ onboardingCompletedAt: completedAt }));
    const handler = buildHandler(update);

    const result = await handler.execute(new UpdatePreferencesCommand('user-1', { onboardingCompleted: true }));

    expect(result.onboardingCompletedAt).toBe(completedAt.toISOString());
  });

  it('maps a null onboardingCompletedAt through as null', async () => {
    const update = jest.fn(async () => buildPreferences({ onboardingCompletedAt: null }));
    const handler = buildHandler(update);

    const result = await handler.execute(new UpdatePreferencesCommand('user-1', { language: 'uz' }));

    expect(result.onboardingCompletedAt).toBeNull();
  });
});
