import type {
  PluginDependencyDto,
  PluginDto,
  PluginInstallationDto,
  PluginManifest,
  PluginRatingDto,
  PluginVersionDto,
} from '@pentesthub/shared';
import type { Plugin, PluginInstallation, PluginRating, PluginVersion, Prisma } from '../../../prisma-types.js';

export function toPluginDto(row: Plugin, latestVersion: string | null): PluginDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    slug: row.slug,
    name: row.name,
    category: row.category,
    description: row.description,
    authorUserId: row.authorUserId,
    status: row.status,
    iconUrl: row.iconUrl,
    homepageUrl: row.homepageUrl,
    repoUrl: row.repoUrl,
    documentationMarkdown: row.documentationMarkdown,
    verified: row.verified,
    downloadCount: row.downloadCount,
    ratingAverage: row.ratingAverage,
    ratingCount: row.ratingCount,
    latestVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPluginVersionDto(
  row: PluginVersion,
  signatureValid: boolean | null,
): PluginVersionDto {
  return {
    id: row.id,
    pluginId: row.pluginId,
    version: row.version,
    manifest: row.manifestJson as unknown as PluginManifest,
    permissions: row.permissions,
    dependencies: (row.dependencies as unknown as PluginDependencyDto[] | null) ?? null,
    signaturePresent: Boolean(row.signature),
    signatureValid,
    changelog: row.changelog,
    deprecated: row.deprecated,
    publishedAt: row.publishedAt.toISOString(),
  };
}

export function toPluginInstallationDto(row: PluginInstallation): PluginInstallationDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    pluginId: row.pluginId,
    versionId: row.versionId,
    installedBy: row.installedBy,
    enabled: row.enabled,
    config: (row.config as Prisma.JsonObject as Record<string, unknown> | null) ?? null,
    installedAt: row.installedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPluginRatingDto(row: PluginRating): PluginRatingDto {
  return {
    id: row.id,
    pluginId: row.pluginId,
    userId: row.userId,
    rating: row.rating,
    review: row.review,
    createdAt: row.createdAt.toISOString(),
  };
}
