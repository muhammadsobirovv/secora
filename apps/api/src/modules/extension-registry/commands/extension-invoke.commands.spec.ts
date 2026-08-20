import { InvokeExtensionCommand, InvokeExtensionHandler } from './extension-registry.commands.js';
import { ExtensionPermissionEnforcer } from '../extension-permission-enforcer.util.js';

/// Module 16 — Extension API registry hardening pass (task #454). Covers
/// the security-relevant behaviours of the one real invocation path this
/// registry has: disabled/undeclared-permission calls must never reach
/// the network, cross-workspace extensions must not be invokable at all
/// (enumeration-safe 404, same as every other extension-registry
/// handler), and an unsafe entrypoint URL must be rejected before
/// `fetch()` is ever called. `assertSafeWebhookUrl` is mocked here (its
/// own DNS-rebinding-resistance logic already has a dedicated spec —
/// `ssrf-guard.util.spec.ts` — this file only needs to verify the
/// handler *calls* it and honors its verdict).
jest.mock('../../../common/utils/ssrf-guard.util.js', () => ({
  assertSafeWebhookUrl: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertSafeWebhookUrl } = jest.requireMock('../../../common/utils/ssrf-guard.util.js') as {
  assertSafeWebhookUrl: jest.Mock;
};

describe('InvokeExtensionHandler', () => {
  function buildDeps(extensionOverrides: Partial<Record<string, unknown>> = {}) {
    const extension = {
      id: 'ext-1',
      workspaceId: 'workspace-1',
      name: 'nmap-recon',
      version: '1.0.0',
      type: 'SCANNER_PROVIDER',
      permissions: ['EXECUTE_TOOL'],
      capabilities: ['scan'],
      entrypoint: 'https://extensions.example.com/nmap-recon/invoke',
      metadata: null,
      enabled: true,
      pluginInstallationId: null,
      registeredBy: 'user-1',
      registeredAt: new Date(),
      updatedAt: new Date(),
      ...extensionOverrides,
    };
    const prisma = {
      extensionRegistration: { findFirst: jest.fn().mockResolvedValue(extension) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const workspaceResolver = { resolve: jest.fn().mockResolvedValue('workspace-1') };
    const enforcer = new ExtensionPermissionEnforcer();
    return { prisma, workspaceResolver, enforcer, extension };
  }

  beforeEach(() => {
    assertSafeWebhookUrl.mockReset().mockResolvedValue(undefined);
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  });

  it('rejects invoking a disabled extension without ever checking the URL or calling fetch', async () => {
    const { prisma, workspaceResolver, enforcer } = buildDeps({ enabled: false });
    const handler = new InvokeExtensionHandler(prisma as never, workspaceResolver as never, enforcer);

    await expect(
      handler.execute(new InvokeExtensionCommand('user-1', 'ext-1', { permission: 'EXECUTE_TOOL' })),
    ).rejects.toMatchObject({ code: 'EXTENSION_DISABLED_CANNOT_INVOKE' });

    expect(assertSafeWebhookUrl).not.toHaveBeenCalled();
    expect((global as unknown as { fetch: jest.Mock }).fetch).not.toHaveBeenCalled();
  });

  it('rejects invoking with a permission the extension never declared', async () => {
    const { prisma, workspaceResolver, enforcer } = buildDeps({ permissions: ['READ_TARGETS'] });
    const handler = new InvokeExtensionHandler(prisma as never, workspaceResolver as never, enforcer);

    await expect(
      handler.execute(new InvokeExtensionCommand('user-1', 'ext-1', { permission: 'WRITE_FINDINGS' })),
    ).rejects.toMatchObject({ code: 'EXTENSION_PERMISSION_NOT_DECLARED' });

    expect(assertSafeWebhookUrl).not.toHaveBeenCalled();
    expect((global as unknown as { fetch: jest.Mock }).fetch).not.toHaveBeenCalled();
  });

  it('returns an enumeration-safe 404 for another workspace\'s extension, before any authorization/network step', async () => {
    const { prisma, workspaceResolver, enforcer } = buildDeps();
    prisma.extensionRegistration.findFirst.mockResolvedValue(null); // simulates a cross-workspace id
    const handler = new InvokeExtensionHandler(prisma as never, workspaceResolver as never, enforcer);

    await expect(
      handler.execute(new InvokeExtensionCommand('user-1', 'someone-elses-extension', { permission: 'EXECUTE_TOOL' })),
    ).rejects.toMatchObject({ code: 'EXTENSION_NOT_FOUND' });

    expect(assertSafeWebhookUrl).not.toHaveBeenCalled();
  });

  it('rejects an unsafe entrypoint URL before calling fetch, and never writes an audit event for it', async () => {
    const { prisma, workspaceResolver, enforcer } = buildDeps();
    assertSafeWebhookUrl.mockRejectedValue(
      Object.assign(new Error('Webhook URL points to a blocked internal hostname.'), { code: 'UNSAFE_WEBHOOK_URL' }),
    );
    const handler = new InvokeExtensionHandler(prisma as never, workspaceResolver as never, enforcer);

    await expect(
      handler.execute(new InvokeExtensionCommand('user-1', 'ext-1', { permission: 'EXECUTE_TOOL' })),
    ).rejects.toMatchObject({ code: 'UNSAFE_WEBHOOK_URL' });

    expect((global as unknown as { fetch: jest.Mock }).fetch).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects oversized invocation input before checking the URL or calling fetch', async () => {
    const { prisma, workspaceResolver, enforcer } = buildDeps();
    const handler = new InvokeExtensionHandler(prisma as never, workspaceResolver as never, enforcer);
    const hugeInput = { blob: 'x'.repeat(200_000) };

    await expect(
      handler.execute(new InvokeExtensionCommand('user-1', 'ext-1', { permission: 'EXECUTE_TOOL', input: hugeInput })),
    ).rejects.toMatchObject({ code: 'EXTENSION_INVOKE_INPUT_TOO_LARGE' });

    expect(assertSafeWebhookUrl).not.toHaveBeenCalled();
  });

  it('on success: calls the entrypoint once, relays its JSON body, and writes an EXTENSION_INVOKED audit event with ok:true', async () => {
    const { prisma, workspaceResolver, enforcer, extension } = buildDeps();
    const handler = new InvokeExtensionHandler(prisma as never, workspaceResolver as never, enforcer);
    (global as unknown as { fetch: jest.Mock }).fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ findings: 3 }),
    });

    const result = await handler.execute(
      new InvokeExtensionCommand('user-1', 'ext-1', { permission: 'EXECUTE_TOOL', input: { targetId: 't-1' } }),
    );

    expect(result).toMatchObject({ ok: true, statusCode: 200, body: { findings: 3 } });
    expect(assertSafeWebhookUrl).toHaveBeenCalledWith(extension.entrypoint);
    expect((global as unknown as { fetch: jest.Mock }).fetch).toHaveBeenCalledTimes(1);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'EXTENSION_INVOKED', metadata: expect.objectContaining({ ok: true }) }),
      }),
    );
  });

  it('on a non-2xx response: does not throw, returns ok:false, and still audits the attempt', async () => {
    const { prisma, workspaceResolver, enforcer } = buildDeps();
    const handler = new InvokeExtensionHandler(prisma as never, workspaceResolver as never, enforcer);
    (global as unknown as { fetch: jest.Mock }).fetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('not json')),
    });

    const result = await handler.execute(new InvokeExtensionCommand('user-1', 'ext-1', { permission: 'EXECUTE_TOOL' }));

    expect(result).toMatchObject({ ok: false, statusCode: 502, error: 'HTTP 502' });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metadata: expect.objectContaining({ ok: false, statusCode: 502 }) }),
      }),
    );
  });

  it('on a network error (fetch throws/rejects): does not throw, returns ok:false with the error message', async () => {
    const { prisma, workspaceResolver, enforcer } = buildDeps();
    const handler = new InvokeExtensionHandler(prisma as never, workspaceResolver as never, enforcer);
    (global as unknown as { fetch: jest.Mock }).fetch.mockRejectedValue(new Error('timed out'));

    const result = await handler.execute(new InvokeExtensionCommand('user-1', 'ext-1', { permission: 'EXECUTE_TOOL' }));

    expect(result).toMatchObject({ ok: false, statusCode: null, error: 'timed out' });
    expect(prisma.auditEvent.create).toHaveBeenCalled();
  });
});
