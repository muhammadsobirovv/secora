import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { PluginAvailableUpdateDto, PluginInstallationDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { toPluginInstallationDto } from '../mappers/to-plugin-dto.mapper.js';

export class ListPluginInstallationsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly workspaceId?: string,
  ) {}
}

@QueryHandler(ListPluginInstallationsQuery)
export class ListPluginInstallationsHandler
  implements IQueryHandler<ListPluginInstallationsQuery, PluginInstallationDto[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListPluginInstallationsQuery): Promise<PluginInstallationDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const installations = await this.prisma.pluginInstallation.findMany({
      where: { organizationId: query.organizationId, workspaceId: query.workspaceId },
      orderBy: { installedAt: 'desc' },
    });
    return installations.map(toPluginInstallationDto);
  }
}

/// Module 14 — Auto Update. The Plugin SDK/Marketplace (Module 13) let a
/// human manually change an installation's `versionId`
/// (`UpdatePluginInstallationCommand`) but never had a query telling
/// them *when* they should — this is that query. "Latest" here means
/// latest **non-deprecated** `PluginVersion` ordered by `publishedAt`
/// (deliberately stricter than every other `latestVersion` computation
/// in this module — `ListPluginsHandler`/`GetPluginHandler`/etc. all
/// order by `publishedAt desc` with no `deprecated` filter, since a
/// deprecated-but-still-latest version is a fine thing to *display* on
/// a plugin's catalog page; recommending an *upgrade* to a deprecated
/// version would not be).
export class GetAvailablePluginUpdatesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly workspaceId?: string,
  ) {}
}

@QueryHandler(GetAvailablePluginUpdatesQuery)
export class GetAvailablePluginUpdatesHandler
  implements IQueryHandler<GetAvailablePluginUpdatesQuery, PluginAvailableUpdateDto[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetAvailablePluginUpdatesQuery): Promise<PluginAvailableUpdateDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);

    const installations = await this.prisma.pluginInstallation.findMany({
      where: { organizationId: query.organizationId, workspaceId: query.workspaceId },
      include: { plugin: true, version: true },
    });
    if (installations.length === 0) return [];

    // Module 14 — Performance: originally one `findFirst` per
    // installation (N+1). A single org rarely installs more than a
    // handful of distinct plugins, but there's no reason to pay a
    // round-trip per row when one query over the distinct set of
    // installed `pluginId`s does the same job — fetch every
    // non-deprecated version for exactly those plugins, then reduce to
    // "latest per plugin" in memory (cheap: this result set is bounded
    // by how many versions those specific plugins have published, not
    // by the whole marketplace).
    const pluginIds = [...new Set(installations.map((i) => i.pluginId))];
    const candidateVersions = await this.prisma.pluginVersion.findMany({
      where: { pluginId: { in: pluginIds }, deprecated: false },
      orderBy: { publishedAt: 'desc' },
    });
    const latestByPluginId = new Map<string, (typeof candidateVersions)[number]>();
    for (const version of candidateVersions) {
      // `orderBy: publishedAt desc` means the first row seen per
      // pluginId is already the latest — skip the rest.
      if (!latestByPluginId.has(version.pluginId)) {
        latestByPluginId.set(version.pluginId, version);
      }
    }

    const updates: PluginAvailableUpdateDto[] = [];
    for (const installation of installations) {
      const latest = latestByPluginId.get(installation.pluginId);
      // No non-deprecated version at all (every release deprecated, or
      // none published) — nothing to recommend upgrading *to*, so this
      // installation is silently excluded rather than reported as "up
      // to date" (it may not be) or erroring the whole list.
      if (!latest || latest.id === installation.versionId) continue;

      updates.push({
        installationId: installation.id,
        pluginId: installation.pluginId,
        pluginName: installation.plugin.name,
        workspaceId: installation.workspaceId,
        installedVersionId: installation.version.id,
        installedVersion: installation.version.version,
        latestVersionId: latest.id,
        latestVersion: latest.version,
        latestChangelog: latest.changelog,
      });
    }
    return updates;
  }
}
