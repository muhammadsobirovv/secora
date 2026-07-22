import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ListPluginsQueryDto, PluginDto, PluginRatingDto, PluginVersionDto } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
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
