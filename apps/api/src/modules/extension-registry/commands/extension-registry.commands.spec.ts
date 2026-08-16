import {
  DisableExtensionCommand,
  DisableExtensionHandler,
  RegisterExtensionCommand,
  RegisterExtensionHandler,
  UnregisterExtensionCommand,
  UnregisterExtensionHandler,
} from './extension-registry.commands.js';

/// Module 16 — Extension API registry (task #401). Covers the
/// spec-mandated behaviours: manifest validation on register, rejecting
/// a duplicate (workspace, name, version), and unregister being a real
/// delete that still leaves an audit trail (write the audit event before
/// the row is gone, not after — see the handler's own comment).
describe('Extension registry commands', () => {
  function buildDeps(extensionOverrides: Partial<Record<string, unknown>> = {}) {
    const extension = {
      id: 'ext-1',
      workspaceId: 'workspace-1',
      name: 'nmap-recon',
      version: '1.0.0',
      type: 'SCANNER_PROVIDER',
      permissions: ['READ_TARGETS'],
      capabilities: ['scan'],
      entrypoint: 'index.js',
      metadata: null,
      enabled: true,
      pluginInstallationId: null,
      registeredBy: 'user-1',
      registeredAt: new Date(),
      updatedAt: new Date(),
      ...extensionOverrides,
    };
    const prisma = {
      extensionRegistration: {
        create: jest.fn().mockResolvedValue(extension),
        findFirst: jest.fn().mockResolvedValue(null), // no duplicate by default
        update: jest.fn().mockResolvedValue(extension),
        delete: jest.fn().mockResolvedValue(extension),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const workspaceResolver = { resolve: jest.fn().mockResolvedValue('workspace-1') };
    return { prisma, workspaceResolver, extension };
  }

  const validRequest = {
    name: 'nmap-recon',
    version: '1.0.0',
    type: 'SCANNER_PROVIDER' as const,
    permissions: ['READ_TARGETS'] as const,
    capabilities: ['scan'],
    entrypoint: 'index.js',
  };

  it('rejects registration with an invalid semver version', async () => {
    const { prisma, workspaceResolver } = buildDeps();
    const handler = new RegisterExtensionHandler(prisma as never, workspaceResolver as never);

    await expect(
      handler.execute(new RegisterExtensionCommand('user-1', { ...validRequest, version: 'not-a-version' })),
    ).rejects.toMatchObject({ code: 'EXTENSION_MANIFEST_INVALID' });
    expect(prisma.extensionRegistration.create).not.toHaveBeenCalled();
  });

  it('registers a valid extension and writes an EXTENSION_REGISTERED audit event', async () => {
    const { prisma, workspaceResolver, extension } = buildDeps();
    const handler = new RegisterExtensionHandler(prisma as never, workspaceResolver as never);

    const result = await handler.execute(new RegisterExtensionCommand('user-1', validRequest));

    expect(result).toMatchObject({ id: extension.id, name: extension.name });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'EXTENSION_REGISTERED' }) }),
    );
  });

  it('rejects a duplicate (workspace, name, version) registration', async () => {
    const { prisma, workspaceResolver, extension } = buildDeps();
    prisma.extensionRegistration.findFirst.mockResolvedValue(extension);
    const handler = new RegisterExtensionHandler(prisma as never, workspaceResolver as never);

    await expect(handler.execute(new RegisterExtensionCommand('user-1', validRequest))).rejects.toMatchObject({
      code: 'EXTENSION_ALREADY_REGISTERED',
    });
    expect(prisma.extensionRegistration.create).not.toHaveBeenCalled();
  });

  it('rejects disabling an extension that belongs to another workspace (enumeration-safe 404)', async () => {
    const { prisma, workspaceResolver } = buildDeps();
    prisma.extensionRegistration.findFirst.mockResolvedValue(null);
    const handler = new DisableExtensionHandler(prisma as never, workspaceResolver as never);

    await expect(handler.execute(new DisableExtensionCommand('user-1', 'someone-elses-extension'))).rejects.toMatchObject({
      code: 'EXTENSION_NOT_FOUND',
    });
  });

  it('unregister deletes the row and writes EXTENSION_UNREGISTERED before it is gone', async () => {
    const { prisma, workspaceResolver, extension } = buildDeps();
    prisma.extensionRegistration.findFirst.mockResolvedValue(extension);
    const handler = new UnregisterExtensionHandler(prisma as never, workspaceResolver as never);
    const callOrder: string[] = [];
    prisma.auditEvent.create.mockImplementation(() => {
      callOrder.push('audit');
      return Promise.resolve({});
    });
    prisma.extensionRegistration.delete.mockImplementation(() => {
      callOrder.push('delete');
      return Promise.resolve(extension);
    });

    await handler.execute(new UnregisterExtensionCommand('user-1', 'ext-1'));

    expect(prisma.extensionRegistration.delete).toHaveBeenCalledWith({ where: { id: 'ext-1' } });
    expect(callOrder).toEqual(['audit', 'delete']);
  });
});
