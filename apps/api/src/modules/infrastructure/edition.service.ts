import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Edition, EditionInfoDto, LicenseDto } from '@pentesthub/shared';
import type { EnvConfig } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { License } from '../../prisma-types.js';

function toLicenseDto(license: License): LicenseDto {
  return {
    id: license.id,
    organizationId: license.organizationId,
    edition: license.edition,
    issuedTo: license.issuedTo,
    seats: license.seats,
    status: license.status,
    activatedAt: license.activatedAt.toISOString(),
    expiresAt: license.expiresAt ? license.expiresAt.toISOString() : null,
  };
}

/// Module 14 — Edition system (Community vs Enterprise). The single
/// source of truth every Enterprise-only surface checks — see
/// `EditionGuard`/`@RequiresEdition`. Two layers, deliberately:
///
/// 1. `PENTESTHUB_EDITION` (env, deployment-wide) — the coarse switch.
///    `'community'` (default) means Enterprise code paths are
///    unreachable regardless of what's in the `licenses` table.
/// 2. `License` rows (Postgres, optional) — a finer-grained entitlement
///    check for hosted multi-tenant deployments that want to gate
///    Enterprise features per organization rather than trusting the env
///    var alone. If the deployment has never created a single `License`
///    row, this layer is a no-op ("trusted environment" mode — the
///    common case for a self-hosted Enterprise install run by the
///    organization that owns the license itself, not a hosting
///    provider) and `PENTESTHUB_EDITION=enterprise` alone is enough.
///
/// This two-layer design is why a missing/expired license degrades a
/// specific organization back to Community Edition rather than ever
/// locking the whole deployment out — "every Enterprise feature must be
/// optional" from the module spec, applied to licensing itself.
@Injectable()
export class EditionService {
  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  getEdition(): Edition {
    return this.configService.get('PENTESTHUB_EDITION', { infer: true });
  }

  isEnterprise(): boolean {
    return this.getEdition() === 'enterprise';
  }

  /// Resolves whether Enterprise features are actually unlocked for a
  /// given organization (or the deployment as a whole, when
  /// `organizationId` is omitted — e.g. deployment-level Admin Console
  /// pages that aren't scoped to one tenant).
  async isEnterpriseFor(organizationId?: string | null): Promise<boolean> {
    if (!this.isEnterprise()) {
      return false;
    }
    const totalLicenses = await this.prisma.license.count();
    if (totalLicenses === 0) {
      // No License rows exist at all — trusted-environment mode, see
      // this class's doc comment.
      return true;
    }
    const now = new Date();
    const activeLicense = await this.prisma.license.findFirst({
      where: {
        status: 'ACTIVE',
        OR: organizationId ? [{ organizationId }, { organizationId: null }] : [{ organizationId: null }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      orderBy: { activatedAt: 'desc' },
    });
    return activeLicense !== null;
  }

  async getActiveLicense(organizationId?: string | null): Promise<License | null> {
    const now = new Date();
    return this.prisma.license.findFirst({
      where: {
        status: 'ACTIVE',
        OR: organizationId ? [{ organizationId }, { organizationId: null }] : [{ organizationId: null }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      orderBy: { activatedAt: 'desc' },
    });
  }

  async getInfo(organizationId?: string | null): Promise<EditionInfoDto> {
    const enterpriseFeaturesEnabled = await this.isEnterpriseFor(organizationId);
    const activeLicense = await this.getActiveLicense(organizationId);
    return {
      edition: this.getEdition(),
      enterpriseFeaturesEnabled,
      activeLicense: activeLicense ? toLicenseDto(activeLicense) : null,
    };
  }
}
