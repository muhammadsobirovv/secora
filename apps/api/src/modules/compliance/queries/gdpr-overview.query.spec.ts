import { describe, expect, it } from '@jest/globals';
import { GetGdprOverviewHandler } from './gdpr-overview.query.js';

describe('GetGdprOverviewHandler', () => {
  it('returns the static data processing register, subject rights, and policy text', async () => {
    const handler = new GetGdprOverviewHandler();

    const result = await handler.execute();

    expect(result.dataProcessingRegister.length).toBeGreaterThan(0);
    expect(result.dataSubjectRights.length).toBeGreaterThan(0);
    expect(result.dataSubjectRights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gdprArticle: 'Article 15' }),
        expect.objectContaining({ gdprArticle: 'Article 17' }),
        expect.objectContaining({ gdprArticle: 'Article 20' }),
      ]),
    );
    expect(typeof result.breachNotificationProcedure).toBe('string');
    expect(result.breachNotificationProcedure.length).toBeGreaterThan(0);
    expect(typeof result.crossBorderTransfers).toBe('string');
    expect(result.crossBorderTransfers.length).toBeGreaterThan(0);
  });

  it('every register entry has a non-empty category, purpose, and retention', async () => {
    const handler = new GetGdprOverviewHandler();

    const result = await handler.execute();

    for (const entry of result.dataProcessingRegister) {
      expect(entry.category.length).toBeGreaterThan(0);
      expect(entry.purpose.length).toBeGreaterThan(0);
      expect(entry.retention.length).toBeGreaterThan(0);
      expect(entry.examples.length).toBeGreaterThan(0);
    }
  });
});
