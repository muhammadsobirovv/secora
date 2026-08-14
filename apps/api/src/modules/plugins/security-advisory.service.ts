import { HttpStatus, Injectable } from '@nestjs/common';
import type { PublishSecurityAdvisoryRequestDto, SecurityAdvisoryDto } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/// Module 15 — Marketplace security (task #333). Publishing an advisory
/// is a platform-operator action (`@Roles('ADMIN')` at the controller) —
/// reading them is open to everyone, the same "disclosure is public,
/// authoring is gated" model every CVE/GHSA database uses.
@Injectable()
export class SecurityAdvisoryService {
  constructor(private readonly prisma: PrismaService) {}

  async publish(dto: PublishSecurityAdvisoryRequestDto): Promise<SecurityAdvisoryDto> {
    const advisory = await this.prisma.securityAdvisory.create({
      data: {
        pluginId: dto.pluginId,
        title: dto.title,
        description: dto.description,
        severity: dto.severity as never,
        affectedVersionRange: dto.affectedVersionRange,
        patchedVersion: dto.patchedVersion,
      },
    });
    return this.toDto(advisory);
  }

  async list(): Promise<SecurityAdvisoryDto[]> {
    const advisories = await this.prisma.securityAdvisory.findMany({ orderBy: { publishedAt: 'desc' } });
    return advisories.map((advisory) => this.toDto(advisory));
  }

  async get(id: string): Promise<SecurityAdvisoryDto> {
    const advisory = await this.prisma.securityAdvisory.findUnique({ where: { id } });
    if (!advisory) {
      throw new AppException('SECURITY_ADVISORY_NOT_FOUND', `No security advisory with id "${id}".`, HttpStatus.NOT_FOUND);
    }
    return this.toDto(advisory);
  }

  async listForPlugin(pluginId: string): Promise<SecurityAdvisoryDto[]> {
    const advisories = await this.prisma.securityAdvisory.findMany({
      where: { pluginId },
      orderBy: { publishedAt: 'desc' },
    });
    return advisories.map((advisory) => this.toDto(advisory));
  }

  private toDto(advisory: {
    id: string;
    pluginId: string | null;
    title: string;
    description: string;
    severity: string;
    affectedVersionRange: string | null;
    patchedVersion: string | null;
    publishedAt: Date;
  }): SecurityAdvisoryDto {
    return {
      id: advisory.id,
      pluginId: advisory.pluginId,
      title: advisory.title,
      description: advisory.description,
      severity: advisory.severity as SecurityAdvisoryDto['severity'],
      affectedVersionRange: advisory.affectedVersionRange,
      patchedVersion: advisory.patchedVersion,
      publishedAt: advisory.publishedAt.toISOString(),
    };
  }
}
