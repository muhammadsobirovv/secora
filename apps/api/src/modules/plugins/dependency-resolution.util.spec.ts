import { describe, expect, it } from '@jest/globals';
import { resolveDependencies, satisfiesRange } from './dependency-resolution.util.js';

describe('satisfiesRange', () => {
  it('matches an exact version', () => {
    expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
    expect(satisfiesRange('1.2.4', '1.2.3')).toBe(false);
  });

  it('matches a caret range (same major, >= base)', () => {
    expect(satisfiesRange('1.5.0', '^1.2.0')).toBe(true);
    expect(satisfiesRange('1.0.0', '^1.2.0')).toBe(false);
    expect(satisfiesRange('2.0.0', '^1.2.0')).toBe(false);
  });

  it('matches a tilde range (same major.minor, >= base)', () => {
    expect(satisfiesRange('1.2.9', '~1.2.0')).toBe(true);
    expect(satisfiesRange('1.3.0', '~1.2.0')).toBe(false);
  });

  it('matches comparison operators', () => {
    expect(satisfiesRange('2.0.0', '>=1.5.0')).toBe(true);
    expect(satisfiesRange('1.0.0', '>=1.5.0')).toBe(false);
    expect(satisfiesRange('1.0.0', '<2.0.0')).toBe(true);
    expect(satisfiesRange('2.0.0', '<2.0.0')).toBe(false);
  });

  it('matches a combined AND range', () => {
    expect(satisfiesRange('1.5.0', '>=1.2.0 <2.0.0')).toBe(true);
    expect(satisfiesRange('2.0.0', '>=1.2.0 <2.0.0')).toBe(false);
  });
});

describe('resolveDependencies', () => {
  it('reports satisfied when the installed version matches the range', () => {
    const results = resolveDependencies(
      [{ slug: 'recon-helper', versionRange: '^1.0.0' }],
      { 'recon-helper': '1.4.0' },
    );
    expect(results[0]?.satisfied).toBe(true);
    expect(results[0]?.installedVersion).toBe('1.4.0');
  });

  it('reports unsatisfied when the dependency is not installed', () => {
    const results = resolveDependencies([{ slug: 'missing-plugin', versionRange: '^1.0.0' }], {});
    expect(results[0]?.satisfied).toBe(false);
    expect(results[0]?.installedVersion).toBeNull();
  });

  it('reports unsatisfied when installed but out of range', () => {
    const results = resolveDependencies(
      [{ slug: 'recon-helper', versionRange: '^2.0.0' }],
      { 'recon-helper': '1.4.0' },
    );
    expect(results[0]?.satisfied).toBe(false);
  });
});
