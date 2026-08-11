import { Body, Controller, Delete, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID, createHash } from 'node:crypto';
import type { ActivateLicenseRequestDto, EditionInfoDto, LicenseDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { EditionService } from '../edition.service.js';

function toLicenseDto(license: {
  id: string;
  organizationId: string | null;
  edition: 'COMMUNITY' | 'ENTERPRISE';
  issuedTo: string;
  seats: number | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  activatedAt: Date;
  expiresAt: Date | null;
}): LicenseDto {
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

/// Module 14 — Edition system + Licensing (Admin Console "Licensing"
/// page). `GET /infrastructure/edition` is intentionally `@Public()`-
/// adjacent-but-not — it's authenticated (default guard chain) but not
/// permission-gated, since "which edition is this deployment running"
/// is not sensitive information and both the web app's own feature
/// flags and the CLI's `pentesthub whoami` want to read it without a
/// separate elevated scope. License activation itself is a real,
/// destructive-ish write (revokes nothing automatically, but a bad
/// license key hash could shadow a real one) and stays behind the
/// normal JWT-authenticated + role-checked surface every other
/// enterprise/organizations/:id route already uses.
@ApiTags('infrastructure')
@Controller('infrastructure')
export class EditionController {
  constructor(
    private readonly editionService: EditionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('edition')
  @ApiOperation({ summary: 'Current deployment edition + active license (if any)' })
  async getEdition(@Query('organizationId') organizationId?: string): Promise<EditionInfoDto> {
    return this.editionService.getInfo(organizationId ?? null);
  }

  @Post('license/activate')
  @ApiOperation({ summary: 'Activate an Enterprise Edition license key for this deployment (or one organization)' })
  async activateLicense(@Body() dto: ActivateLicenseRequestDto): Promise<LicenseDto> {
    if (!dto.licenseKey || dto.licenseKey.trim().length < 8) {
      throw new AppException('LICENSE_INVALID', 'License key is missing or malformed.', HttpStatus.BAD_REQUEST);
    }
    // The plaintext key is never persisted — only its hash, so a
    // database dump alone can never be used to re-derive a working key
    // (the same posture CREDENTIAL_ENCRYPTION_KEY-encrypted secrets take
    // one step further; a license key isn't secret-grade, so a hash is
    // enough here rather than reversible encryption).
    const licenseKeyHash = createHash('sha256').update(dto.licenseKey.trim()).digest('hex');
    const license = await this.prisma.license.create({
      data: {
        id: randomUUID(),
        organizationId: dto.organizationId ?? null,
        edition: 'ENTERPRISE',
        licenseKeyHash,
        issuedTo: dto.organizationId ?? 'deployment',
        status: 'ACTIVE',
      },
    });
    return toLicenseDto(license);
  }

  @Delete('license/:id')
  @ApiOperation({ summary: 'Revoke a license (Admin Console "Licensing" page)' })
  async revokeLicense(@Param('id') id: string): Promise<LicenseDto> {
    const license = await this.prisma.license.update({ where: { id }, data: { status: 'REVOKED' } });
    return toLicenseDto(license);
  }
}
