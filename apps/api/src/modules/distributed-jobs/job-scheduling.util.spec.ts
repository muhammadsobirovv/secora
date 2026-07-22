import { describe, expect, it } from '@jest/globals';
import { PRIORITY_ORDER } from './job-scheduling.util.js';

describe('PRIORITY_ORDER', () => {
  it('orders CRITICAL > HIGH > NORMAL > LOW', () => {
    expect(PRIORITY_ORDER.CRITICAL).toBeGreaterThan(PRIORITY_ORDER.HIGH);
    expect(PRIORITY_ORDER.HIGH).toBeGreaterThan(PRIORITY_ORDER.NORMAL);
    expect(PRIORITY_ORDER.NORMAL).toBeGreaterThan(PRIORITY_ORDER.LOW);
  });

  it('sorts a mixed job list into strict priority order, oldest-first within a priority band', () => {
    const now = Date.now();
    const jobs = [
      { id: 'a', priority: 'LOW' as const, createdAt: new Date(now - 1000) },
      { id: 'b', priority: 'CRITICAL' as const, createdAt: new Date(now - 500) },
      { id: 'c', priority: 'NORMAL' as const, createdAt: new Date(now - 2000) },
      { id: 'd', priority: 'CRITICAL' as const, createdAt: new Date(now - 3000) },
      { id: 'e', priority: 'HIGH' as const, createdAt: new Date(now) },
    ];
    const sorted = [...jobs].sort(
      (a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority] || a.createdAt.getTime() - b.createdAt.getTime(),
    );
    expect(sorted.map((j) => j.id)).toEqual(['d', 'b', 'e', 'c', 'a']);
  });
});
