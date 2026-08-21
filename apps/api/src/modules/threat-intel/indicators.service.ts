import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateIndicatorRequestDto,
  IndicatorDto,
  IndicatorStatus,
  IndicatorType,
} from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

interface IndicatorRow {
  id: string;
  workspaceId: string | null;
  type: string;
  value: string;
  status: string;
  confidence: number;
  source: string;
  description: string | null;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
  expiresAt: Date | string | null;
  tags: string[];
  updatedAt: Date | string;
}

function toDto(row: IndicatorRow): IndicatorDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type as IndicatorType,
    value: row.value,
    status: row.status as IndicatorStatus,
    confidence: row.confidence,
    source: row.source,
    description: row.description,
    firstSeenAt: new Date(row.firstSeenAt).toISOString(),
    lastSeenAt: new Date(row.lastSeenAt).toISOString(),
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    tags: row.tags,
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

/// Module 17 — task #467 (Indicator management, spec section 8). Mirrors
/// `CveIntelligenceService`'s "global cache, nullable workspaceId" posture
/// (see `Indicator` model's schema doc comment): `workspaceId: null` rows
/// are shared public feed data visible to every workspace (populated by
/// `ThreatIntelProviderService`/`StixTaxiiService`), while a non-null
/// `workspaceId` row is a workspace's own manually-added or privately-
/// imported indicator. Reads here never filter out global rows — a
/// workspace always sees "its own + the shared pool" — but writes from
/// this service (`createManual`, `setStatus`) are always scoped to a
/// caller-supplied workspace and can only ever touch that workspace's own
/// rows, never a global one.
///
/// Every read/render of confidence+source together, never a bare
/// malicious/not-malicious verdict — spec section 8: "do not automatically
/// treat an indicator as malicious solely because it exists in a feed."
@Injectable()
export class IndicatorsService {
  constructor(private readonly prisma: PrismaService) {}

  private get repo() {
    return (
      this.prisma as unknown as {
        indicator: {
          create: (args: unknown) => Promise<IndicatorRow>;
          upsert: (args: unknown) => Promise<IndicatorRow>;
          findMany: (args: unknown) => Promise<IndicatorRow[]>;
          findUnique: (args: unknown) => Promise<IndicatorRow | null>;
          update: (args: unknown) => Promise<IndicatorRow>;
          count: (args: unknown) => Promise<number>;
        };
      }
    ).indicator;
  }

  async createManual(
    workspaceId: string,
    userId: string,
    dto: CreateIndicatorRequestDto,
  ): Promise<IndicatorDto> {
    const row = await this.repo.upsert({
      where: {
        workspaceId_type_value: { workspaceId, type: dto.type, value: dto.value },
      },
      create: {
        workspaceId,
        type: dto.type,
        value: dto.value,
        confidence: dto.confidence ?? 0.5,
        source: 'MANUAL_IMPORT',
        description: dto.description ?? null,
        tags: dto.tags ?? [],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdBy: userId,
      },
      update: {
        confidence: dto.confidence ?? 0.5,
        description: dto.description ?? null,
        tags: dto.tags ?? [],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        lastSeenAt: new Date(),
      },
    });
    return toDto(row);
  }

  /// Read path — visible to a workspace: rows it owns plus every shared
  /// (`workspaceId: null`) row. Never makes an outbound call (matches the
  /// Community Edition guarantee `CveIntelligenceService.lookup` already
  /// established for the sibling CVE cache).
  async listForWorkspace(
    workspaceId: string,
    filters: { type?: IndicatorType; status?: IndicatorStatus; search?: string; limit?: number },
  ): Promise<IndicatorDto[]> {
    const rows = await this.repo.findMany({
      where: {
        OR: [{ workspaceId }, { workspaceId: null }],
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.search ? { value: { contains: filters.search, mode: 'insensitive' } } : {}),
      },
      orderBy: { lastSeenAt: 'desc' },
      take: filters.limit ?? 100,
    });
    return rows.map(toDto);
  }

  async getForWorkspace(id: string, workspaceId: string): Promise<IndicatorDto> {
    const row = await this.repo.findUnique({ where: { id } });
    if (!row || (row.workspaceId !== null && row.workspaceId !== workspaceId)) {
      throw new AppException('INDICATOR_NOT_FOUND', 'Indicator not found.', HttpStatus.NOT_FOUND);
    }
    return toDto(row);
  }

  /// Only ever touches a workspace's own private indicator — a shared
  /// (`workspaceId: null`) row can never be disabled/expired through this
  /// path (that's an operator/provider-ingestion concern, not a single
  /// workspace's), same isolation posture `getForWorkspace` enforces.
  async setStatus(id: string, workspaceId: string, status: IndicatorStatus): Promise<IndicatorDto> {
    const row = await this.repo.findUnique({ where: { id } });
    if (!row || row.workspaceId !== workspaceId) {
      throw new AppException('INDICATOR_NOT_FOUND', 'Indicator not found.', HttpStatus.NOT_FOUND);
    }
    const updated = await this.repo.update({ where: { id }, data: { status } });
    return toDto(updated);
  }

  /// Bulk upsert used by `ThreatIntelProviderService`/`StixTaxiiService`
  /// ingestion — deliberately the only write path that can create a
  /// shared (`workspaceId: null`) row. Never throws on an individual bad
  /// record; the caller is responsible for validating/counting
  /// rejections before calling this (see those services' doc comments on
  /// "untrusted data" handling).
  async upsertFromFeed(
    workspaceId: string | null,
    type: IndicatorType,
    value: string,
    fields: { confidence?: number; source: string; description?: string | null; tags?: string[] },
  ): Promise<void> {
    await this.repo.upsert({
      where: { workspaceId_type_value: { workspaceId, type, value } },
      create: {
        workspaceId,
        type,
        value,
        confidence: fields.confidence ?? 0.5,
        source: fields.source,
        description: fields.description ?? null,
        tags: fields.tags ?? [],
      },
      update: {
        confidence: fields.confidence ?? 0.5,
        source: fields.source,
        description: fields.description ?? null,
        tags: fields.tags ?? [],
        lastSeenAt: new Date(),
      },
    });
  }
}
