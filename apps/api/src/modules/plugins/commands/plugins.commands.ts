import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  PluginDependencyDto,
  PluginDto,
  PublishPluginRequestDto,
  PublishPluginVersionRequestDto,
  UpdatePluginRequestDto,
} from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { Prisma } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { hashPluginBundle, verifyPluginSignature } from '../plugin-signature.util.js';
import { validatePluginManifestCapabilities } from '../plugin-sandbox.service.js';
import { toPluginDto } from '../mappers/to-plugin-dto.mapper.js';
import { MarketplaceScannerService } from '../marketplace-scanner.service.js';

/// Module 13 (task #285): shared publish-time check reused by both
/// `PublishPluginHandler` (first version) and `PublishPluginVersionHandler`
/// (subsequent versions) — see `validatePluginManifestCapabilities`'s doc
/// comment for what it enforces.
function assertValidManifestCapabilities(manifest: PublishPluginVersionRequestDto['manifest']): void {
  const problems = validatePluginManifestCapabilities(manifest);
  if (problems.length > 0) {
    throw new AppException(
      'PLUGIN_MANIFEST_CAPABILITIES_INVALID',
      `Invalid manifest capabilities: ${problems.join('; ')}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

/// Plugin Registry: publish/update a `Plugin` catalog entry and its
/// `PluginVersion`s. Anyone can publish (this is a marketplace, not an
/// org-scoped resource — a plugin can be installed by many orgs) but
/// `verified` only ever becomes `true` when a version's signature checks
/// out against `PLUGIN_MARKETPLACE_PUBLIC_KEY`.
export class PublishPluginCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: PublishPluginRequestDto,
  ) {}
}

@CommandHandler(PublishPluginCommand)
export class PublishPluginHandler implements ICommandHandler<PublishPluginCommand, PluginDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly scanner: MarketplaceScannerService,
  ) {}

  async execute(command: PublishPluginCommand): Promise<PluginDto> {
    const existing = await this.prisma.plugin.findUnique({ where: { slug: command.data.slug } });
    if (existing) {
      throw new AppException('PLUGIN_SLUG_ALREADY_EXISTS', 'A plugin with this slug already exists.', HttpStatus.CONFLICT);
    }

    assertValidManifestCapabilities(command.data.version.manifest);

    // Module 15 — Marketplace security (task #333). A registered
    // `MarketplacePublisher`'s own key takes priority over the shared
    // marketplace operator key when present — "signed by an arbitrary
    // registered author key," the follow-up `plugin-signature.util.ts`'s
    // own doc comment flagged as not-yet-built in Module 10/13.
    const publisher = await this.prisma.marketplacePublisher.findUnique({ where: { userId: command.userId } });
    const publicKey = publisher?.publicKeyPem ?? this.configService.get('PLUGIN_MARKETPLACE_PUBLIC_KEY', { infer: true });
    const { attempted, valid } = verifyPluginSignature(
      command.data.version.sourceBundleBase64,
      command.data.version.signature,
      publicKey,
    );
    const checksumSha256 = hashPluginBundle(command.data.version.sourceBundleBase64);

    const plugin = await this.prisma.plugin.create({
      data: {
        slug: command.data.slug,
        name: command.data.name,
        category: command.data.category,
        description: command.data.description,
        authorUserId: command.userId,
        publisherId: publisher?.id,
        iconUrl: command.data.iconUrl,
        homepageUrl: command.data.homepageUrl,
        repoUrl: command.data.repoUrl,
        documentationMarkdown: command.data.documentationMarkdown,
        status: 'PUBLISHED',
        verified: attempted && valid,
        versions: {
          create: {
            version: command.data.version.version,
            manifestJson: command.data.version.manifest as unknown as Prisma.InputJsonValue,
            permissions: command.data.version.permissions,
            dependencies: (command.data.version.dependencies ?? null) as unknown as Prisma.InputJsonValue,
            signature: command.data.version.signature,
            sourceCode: Buffer.from(command.data.version.sourceBundleBase64, 'base64').toString('utf8'),
            changelog: command.data.version.changelog,
            checksumSha256,
          },
        },
      },
      include: { versions: true },
    });

    // Best-effort — a scanner failure never blocks publishing (see
    // `MarketplaceScannerService`'s doc comment: a scan result is
    // advisory, not a hard publish gate).
    const firstVersion = plugin.versions[0];
    if (firstVersion) {
      await this.scanner
        .scanVersion(firstVersion.id, firstVersion.sourceCode, command.data.version.dependencies ?? null)
        .catch(() => undefined);
    }

    return toPluginDto(plugin, command.data.version.version);
  }
}

export class PublishPluginVersionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly pluginId: string,
    public readonly data: PublishPluginVersionRequestDto,
  ) {}
}

@CommandHandler(PublishPluginVersionCommand)
export class PublishPluginVersionHandler implements ICommandHandler<PublishPluginVersionCommand, PluginDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly scanner: MarketplaceScannerService,
  ) {}

  async execute(command: PublishPluginVersionCommand): Promise<PluginDto> {
    const plugin = await this.prisma.plugin.findUnique({ where: { id: command.pluginId } });
    if (!plugin) {
      throw new AppException('PLUGIN_NOT_FOUND', 'Plugin not found.', HttpStatus.NOT_FOUND);
    }
    if (plugin.authorUserId !== command.userId) {
      throw new AppException('PLUGIN_NOT_FOUND', 'Plugin not found.', HttpStatus.NOT_FOUND);
    }
    const existingVersion = await this.prisma.pluginVersion.findUnique({
      where: { pluginId_version: { pluginId: plugin.id, version: command.data.version } },
    });
    if (existingVersion) {
      throw new AppException('PLUGIN_VERSION_ALREADY_EXISTS', 'This version already exists.', HttpStatus.CONFLICT);
    }

    assertValidManifestCapabilities(command.data.manifest);

    const publisher = plugin.publisherId ? await this.prisma.marketplacePublisher.findUnique({ where: { id: plugin.publisherId } }) : null;
    const publicKey = publisher?.publicKeyPem ?? this.configService.get('PLUGIN_MARKETPLACE_PUBLIC_KEY', { infer: true });
    const { attempted, valid } = verifyPluginSignature(
      command.data.sourceBundleBase64,
      command.data.signature,
      publicKey,
    );
    const checksumSha256 = hashPluginBundle(command.data.sourceBundleBase64);

    const version = await this.prisma.pluginVersion.create({
      data: {
        pluginId: plugin.id,
        version: command.data.version,
        manifestJson: command.data.manifest as unknown as Prisma.InputJsonValue,
        permissions: command.data.permissions,
        dependencies: (command.data.dependencies ?? null) as unknown as Prisma.InputJsonValue,
        signature: command.data.signature,
        sourceCode: Buffer.from(command.data.sourceBundleBase64, 'base64').toString('utf8'),
        changelog: command.data.changelog,
        checksumSha256,
      },
    });

    await this.scanner.scanVersion(version.id, version.sourceCode, command.data.dependencies ?? null).catch(() => undefined);

    const updated = await this.prisma.plugin.update({
      where: { id: plugin.id },
      data: { verified: attempted && valid ? true : plugin.verified },
    });
    return toPluginDto(updated, command.data.version);
  }
}

export class UpdatePluginCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly pluginId: string,
    public readonly data: UpdatePluginRequestDto,
  ) {}
}

@CommandHandler(UpdatePluginCommand)
export class UpdatePluginHandler implements ICommandHandler<UpdatePluginCommand, PluginDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdatePluginCommand): Promise<PluginDto> {
    const plugin = await this.prisma.plugin.findUnique({ where: { id: command.pluginId } });
    if (!plugin || plugin.authorUserId !== command.userId) {
      throw new AppException('PLUGIN_NOT_FOUND', 'Plugin not found.', HttpStatus.NOT_FOUND);
    }
    const updated = await this.prisma.plugin.update({
      where: { id: plugin.id },
      data: {
        name: command.data.name,
        description: command.data.description,
        iconUrl: command.data.iconUrl,
        homepageUrl: command.data.homepageUrl,
        repoUrl: command.data.repoUrl,
        documentationMarkdown: command.data.documentationMarkdown,
        status: command.data.status,
      },
    });
    const latest = await this.prisma.pluginVersion.findFirst({
      where: { pluginId: plugin.id },
      orderBy: { publishedAt: 'desc' },
    });
    return toPluginDto(updated, latest?.version ?? null);
  }
}
