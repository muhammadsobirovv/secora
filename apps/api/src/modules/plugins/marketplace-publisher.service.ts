import { HttpStatus, Injectable } from '@nestjs/common';
import type { MarketplacePublisherDto, RegisterMarketplacePublisherRequestDto } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/// Module 15 — Marketplace security (task #333). Plain injectable
/// service + controller (not CQRS `CommandBus`/`QueryBus` like the rest
/// of `PluginsModule`) — publisher identity/verification is a distinct
/// concern from the plugin catalog CRUD the CQRS handlers in
/// `commands/plugins.commands.ts` own, and a handful of simple
/// create/read/update operations don't need the extra indirection.
/// `PublishPluginHandler` (plugins.commands.ts) reads
/// `MarketplacePublisher` rows directly via Prisma to attribute a plugin
/// at publish time — it doesn't call through this service, since that
/// lookup is read-only and internal to the publish flow, not a
/// caller-facing action.
@Injectable()
export class MarketplacePublisherService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, dto: RegisterMarketplacePublisherRequestDto): Promise<MarketplacePublisherDto> {
    const existing = await this.prisma.marketplacePublisher.findUnique({ where: { userId } });
    if (existing) {
      throw new AppException(
        'MARKETPLACE_PUBLISHER_ALREADY_REGISTERED',
        'You already have a marketplace publisher profile.',
        HttpStatus.CONFLICT,
      );
    }
    const publisher = await this.prisma.marketplacePublisher.create({
      data: {
        userId,
        organizationId: dto.organizationId,
        displayName: dto.displayName,
        websiteUrl: dto.websiteUrl,
        supportEmail: dto.supportEmail,
        publicKeyPem: dto.publicKeyPem,
      },
    });
    return this.toDto(publisher);
  }

  async getMine(userId: string): Promise<MarketplacePublisherDto> {
    const publisher = await this.prisma.marketplacePublisher.findUnique({ where: { userId } });
    if (!publisher) {
      throw new AppException('MARKETPLACE_PUBLISHER_NOT_FOUND', 'No publisher profile registered for this user.', HttpStatus.NOT_FOUND);
    }
    return this.toDto(publisher);
  }

  /// Platform-operator action (gated `@Roles('ADMIN')` at the controller,
  /// same convention `QuotaController` established) — a `verified` badge
  /// is a claim this platform is vouching for, not something a publisher
  /// can self-assert by registering. Community Edition operators can
  /// verify their own trusted internal publishers the same way; a
  /// deployment that never touches this endpoint just never shows a
  /// verified badge, which is a cosmetic-only difference (verification
  /// never gates installability — only the "Verified" marketplace badge).
  async verify(publisherId: string): Promise<MarketplacePublisherDto> {
    const publisher = await this.prisma.marketplacePublisher.findUnique({ where: { id: publisherId } });
    if (!publisher) {
      throw new AppException('MARKETPLACE_PUBLISHER_NOT_FOUND', `No publisher with id "${publisherId}".`, HttpStatus.NOT_FOUND);
    }
    const updated = await this.prisma.marketplacePublisher.update({
      where: { id: publisherId },
      data: { verified: true, verifiedAt: new Date() },
    });
    return this.toDto(updated);
  }

  private toDto(publisher: {
    id: string;
    userId: string;
    organizationId: string | null;
    displayName: string;
    verified: boolean;
    verifiedAt: Date | null;
    publicKeyPem: string | null;
    websiteUrl: string | null;
    supportEmail: string | null;
  }): MarketplacePublisherDto {
    return {
      id: publisher.id,
      userId: publisher.userId,
      organizationId: publisher.organizationId,
      displayName: publisher.displayName,
      verified: publisher.verified,
      verifiedAt: publisher.verifiedAt ? publisher.verifiedAt.toISOString() : null,
      hasCustomSigningKey: Boolean(publisher.publicKeyPem),
      websiteUrl: publisher.websiteUrl,
      supportEmail: publisher.supportEmail,
    };
  }
}
