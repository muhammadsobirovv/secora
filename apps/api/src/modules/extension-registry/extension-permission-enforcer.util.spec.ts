import { ExtensionPermissionEnforcer } from './extension-permission-enforcer.util.js';

describe('ExtensionPermissionEnforcer', () => {
  const enforcer = new ExtensionPermissionEnforcer();

  it('allows a declared permission on an enabled extension', () => {
    expect(() =>
      enforcer.assertAuthorized({ id: 'ext-1', enabled: true, permissions: ['READ_TARGETS'] }, 'READ_TARGETS'),
    ).not.toThrow();
  });

  it('rejects a permission the extension never declared', () => {
    expect(() =>
      enforcer.assertAuthorized({ id: 'ext-1', enabled: true, permissions: ['READ_TARGETS'] }, 'WRITE_FINDINGS'),
    ).toThrow(expect.objectContaining({ code: 'EXTENSION_PERMISSION_NOT_DECLARED' }));
  });

  it('rejects any action for a disabled extension, even one it declared permission for', () => {
    expect(() =>
      enforcer.assertAuthorized({ id: 'ext-1', enabled: false, permissions: ['READ_TARGETS'] }, 'READ_TARGETS'),
    ).toThrow(expect.objectContaining({ code: 'EXTENSION_DISABLED_CANNOT_INVOKE' }));
  });
});
