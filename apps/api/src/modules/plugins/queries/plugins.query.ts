import { HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  ListMarketplacePacksQueryDto,
  ListPluginsQueryDto,
  PluginDto,
  PluginManifest,
  PluginRatingDto,
  PluginVersionDto,
  WorkspacePluginCapabilityDto,
} from '@pentesthub/shared';
import { PACK_CATEGORIES } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { verifyPluginSignature } from '../plugin-signature.util.js';
import { toPluginDto, toPluginRatingDto, toPluginVersionDto } from '../mappers/to-plugin-dto.mapper.js';

export class ListPluginsQuery implements IQuery {
  constructor(public readonly filter: ListPluginsQueryDto) {}
}

@QueryHandler(ListPluginsQuery)
export class ListPluginsHandler implements IQueryHandler<ListPluginsQuery, PluginDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListPluginsQuery): Promise<PluginDto[]> {
    const plugins = await this.prisma.plugin.findMany({
      where: {
        category: query.filter.category,
        status: query.filter.status ?? 'PUBLISHED',
        ...(query.filter.search
          ? {
              OR: [
                { name: { contains: query.filter.search, mode: 'insensitive' } },
                { description: { contains: query.filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { versions: { orderBy: { publishedAt: 'desc' }, take: 1 } },
      orderBy: { downloadCount: 'desc' },
      take: 200,
    });
    return plugins.map((p) => toPluginDto(p, p.versions[0]?.version ?? null));
  }
}

export class GetPluginQuery implements IQuery {
  constructor(public readonly pluginId: string) {}
}

export interface PluginDetailDto {
  plugin: PluginDto;
  versions: PluginVersionDto[];
}

@QueryHandler(GetPluginQuery)
export class GetPluginHandler implements IQueryHandler<GetPluginQuery, PluginDetailDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async execute(query: GetPluginQuery): Promise<PluginDetailDto> {
    const plugin = await this.prisma.plugin.findUnique({
      where: { id: query.pluginId },
      include: { versions: { orderBy: { publishedAt: 'desc' } } },
    });
    if (!plugin) {
      throw new AppException('PLUGIN_NOT_FOUND', 'Plugin not found.', HttpStatus.NOT_FOUND);
    }
    const publicKey = this.configService.get('PLUGIN_MARKETPLACE_PUBLIC_KEY', { infer: true });
    const versions = plugin.versions.map((v) => {
      if (!v.signature || !v.sourceCode) {
        return toPluginVersionDto(v, null);
      }
      const sourceBundleBase64 = Buffer.from(v.sourceCode, 'utf8').toString('base64');
      const { attempted, valid } = verifyPluginSignature(sourceBundleBase64, v.signature, publicKey);
      return toPluginVersionDto(v, attempted ? valid : null);
    });
    return { plugin: toPluginDto(plugin, plugin.versions[0]?.version ?? null), versions };
  }
}

export class ListPluginRatingsQuery implements IQuery {
  constructor(public readonly pluginId: string) {}
}

@QueryHandler(ListPluginRatingsQuery)
export class ListPluginRatingsHandler implements IQueryHandler<ListPluginRatingsQuery, PluginRatingDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListPluginRatingsQuery): Promise<PluginRatingDto[]> {
    const ratings = await this.prisma.pluginRating.findMany({
      where: { pluginId: query.pluginId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return ratings.map(toPluginRatingDto);
  }
}

/// Module 13 — Plugin SDK (task #285). Aggregates every enabled
/// `PluginInstallation` in the caller's personal workspace whose latest
/// installed `PluginVersion.manifestJson.capabilities` declares
/// something, into a single flat list a Developer Portal / plugin-aware
/// frontend can render pages/widgets/sidebar items from without knowing
/// which plugins exist ahead of time.
export class ListWorkspacePluginCapabilitiesQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ListWorkspacePluginCapabilitiesQuery)
export class ListWorkspacePluginCapabilitiesHandler
  implements IQueryHandler<ListWorkspacePluginCapabilitiesQuery, WorkspacePluginCapabilityDto[]>
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async execute(query: ListWorkspacePluginCapabilitiesQuery): Promise<WorkspacePluginCapabilityDto[]> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(query.userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }

    const installations = await this.prisma.pluginInstallation.findMany({
      where: { workspaceId: workspace.id, enabled: true },
      include: { plugin: true, version: true },
    });

    const result: WorkspacePluginCapabilityDto[] = [];
    for (const installation of installations) {
      const manifest = installation.version.manifestJson as unknown as PluginManifest;
      if (!manifest.capabilities) continue;
      result.push({
        pluginId: installation.pluginId,
        pluginSlug: installation.plugin.slug,
        installationId: installation.id,
        capabilities: manifest.capabilities,
      });
    }
    return result;
  }
}

/// Module 13 — Automation Marketplace (task #287). A dedicated
/// "browse packs" surface distinct from the generic `/plugins` listing —
/// always restricted to `PACK_CATEGORIES` (a `category` filter outside
/// that set is treated as "no match" rather than silently falling back to
/// every plugin), `PUBLISHED` only, sorted by `downloadCount`. Packs
/// still publish/install/rate through the exact same `Plugin`/
/// `PluginVersion`/`PluginInstallation` commands every other plugin
/// uses — this query is purely a browsing convenience, not a parallel
/// write path.
export class ListMarketplacePacksQuery implements IQuery {
  constructor(public readonly filter: ListMarketplacePacksQueryDto) {}
}

@QueryHandler(ListMarketplacePacksQuery)
export class ListMarketplacePacksHandler implements IQueryHandler<ListMarketplacePacksQuery, PluginDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListMarketplacePacksQuery): Promise<PluginDto[]> {
    const categories = query.filter.category ? [query.filter.category] : PACK_CATEGORIES;
    const restrictedCategories = categories.filter((c) => (PACK_CATEGORIES as readonly string[]).includes(c));
    if (restrictedCategories.length === 0) return [];

    const plugins = await this.prisma.plugin.findMany({
      where: {
        category: { in: restrictedCategories },
        status: 'PUBLISHED',
        ...(query.filter.search
          ? {
              OR: [
                { name: { contains: query.filter.search, mode: 'insensitive' } },
                { description: { contains: query.filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { versions: { orderBy: { publishedAt: 'desc' }, take: 1 } },
      orderBy: { downloadCount: 'desc' },
      take: 200,
    });
    return plugins.map((p) => toPluginDto(p, p.versions[0]?.version ?? null));
  }
}
