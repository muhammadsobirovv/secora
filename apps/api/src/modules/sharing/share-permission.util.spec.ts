import { assertSharePermission } from './share-permission.util.js';

/// Module 16 — Public Sharing (task #392). Covers the "wrong permission"
/// scenario from the spec's required test list: a VIEW-only share link
/// must never satisfy a COMMENT-level action.
describe('assertSharePermission', () => {
  it('allows VIEW action on a VIEW-permission link', () => {
    expect(() => assertSharePermission('VIEW', 'VIEW')).not.toThrow();
  });

  it('allows VIEW action on a COMMENT-permission link (COMMENT is a superset)', () => {
    expect(() => assertSharePermission('COMMENT', 'VIEW')).not.toThrow();
  });

  it('allows COMMENT action on a COMMENT-permission link', () => {
    expect(() => assertSharePermission('COMMENT', 'COMMENT')).not.toThrow();
  });

  it('rejects a COMMENT action on a VIEW-only link (wrong permission)', () => {
    expect.assertions(2);
    try {
      assertSharePermission('VIEW', 'COMMENT');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as { code?: string }).code).toBe('SHARE_LINK_INSUFFICIENT_PERMISSION');
    }
  });
});
