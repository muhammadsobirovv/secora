import type { PrismaService } from '../../prisma/prisma.service.js';

/// Resolves every `Workspace.id` that belongs to an organization, either
/// directly (`Workspace.organizationId`, set when a workspace is created
/// straight under the org) or indirectly (`Workspace.teamId` pointing at
/// a `Team` whose `organizationId` matches — a workspace assigned to a
/// team without its own `organizationId` set explicitly). Both paths are
/// legitimate per the Module 10 multi-tenant schema (`docs/adr/0010`
/// §Multi-Tenant Architecture), so reporting/analytics aggregation must
/// cover both rather than just the direct column.
export async function listOrganizationWorkspaceIds(prisma: PrismaService, organizationId: string): Promise<string[]> {
  const workspaces = await prisma.workspace.findMany({
    where: { OR: [{ organizationId }, { team: { organizationId } }] },
    select: { id: true },
  });
  return workspaces.map((w) => w.id);
}
