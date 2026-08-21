import { Injectable } from '@nestjs/common';
import type {
  ThreatActorDto,
  ThreatCampaignDto,
  ThreatReportDto,
  ThreatRelationshipDto,
  ThreatTechniqueDto,
} from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

interface ThreatActorRow {
  id: string; workspaceId: string | null; name: string; aliases: string[]; description: string | null;
  source: string; firstSeenAt: Date | string; lastSeenAt: Date | string; tags: string[];
}
interface ThreatCampaignRow {
  id: string; workspaceId: string | null; name: string; description: string | null; source: string;
  firstSeenAt: Date | string; lastSeenAt: Date | string; tags: string[];
}
interface ThreatReportRow {
  id: string; workspaceId: string | null; title: string; summary: string; source: string;
  url: string | null; publishedAt: Date | string | null; tags: string[];
}
interface ThreatTechniqueRow {
  id: string; workspaceId: string | null; externalId: string; name: string; description: string | null;
  tactic: string | null; source: string;
}
interface ThreatRelationshipRow {
  id: string; workspaceId: string | null; sourceType: string; sourceId: string; targetType: string;
  targetId: string; relationType: string; confidence: number; source: string; createdAt: Date | string;
}

/// Module 17 — task #466 (Threat Intelligence data model: ThreatActor,
/// ThreatCampaign, ThreatReport, ThreatTechnique, ThreatRelationship).
/// Deliberately thin — read + idempotent-upsert only, no per-entity
/// lifecycle/status/audit machinery, because these five models are all
/// STIX-object-shaped reference/context data (same posture as
/// `ThreatActor`'s own schema doc comment): they get created by
/// provider/STIX ingestion (`ThreatIntelProviderService`,
/// `StixTaxiiService`, both call the `upsert*` methods here) and read by
/// analysts investigating a `ThreatMatch`/`Incident` — never mutated
/// directly by an end user the way an `Indicator`'s status is. Same
/// nullable-`workspaceId` global-cache-vs-private-import split as
/// `IndicatorsService`.
@Injectable()
export class ThreatIntelCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private get actorRepo() {
    return (this.prisma as unknown as { threatActor: {
      create: (args: unknown) => Promise<ThreatActorRow>;
      update: (args: unknown) => Promise<ThreatActorRow>;
      findFirst: (args: unknown) => Promise<ThreatActorRow | null>;
      findMany: (args: unknown) => Promise<ThreatActorRow[]>;
    } }).threatActor;
  }
  private get campaignRepo() {
    return (this.prisma as unknown as { threatCampaign: {
      create: (args: unknown) => Promise<ThreatCampaignRow>;
      update: (args: unknown) => Promise<ThreatCampaignRow>;
      findFirst: (args: unknown) => Promise<ThreatCampaignRow | null>;
      findMany: (args: unknown) => Promise<ThreatCampaignRow[]>;
    } }).threatCampaign;
  }
  private get reportRepo() {
    return (this.prisma as unknown as { threatReport: {
      create: (args: unknown) => Promise<ThreatReportRow>;
      findMany: (args: unknown) => Promise<ThreatReportRow[]>;
    } }).threatReport;
  }
  private get techniqueRepo() {
    return (this.prisma as unknown as { threatTechnique: {
      upsert: (args: unknown) => Promise<ThreatTechniqueRow>;
      findMany: (args: unknown) => Promise<ThreatTechniqueRow[]>;
    } }).threatTechnique;
  }
  private get relationshipRepo() {
    return (this.prisma as unknown as { threatRelationship: {
      create: (args: unknown) => Promise<ThreatRelationshipRow>;
      findMany: (args: unknown) => Promise<ThreatRelationshipRow[]>;
    } }).threatRelationship;
  }

  private toActorDto(r: ThreatActorRow): ThreatActorDto {
    return { id: r.id, workspaceId: r.workspaceId, name: r.name, aliases: r.aliases, description: r.description, source: r.source, firstSeenAt: new Date(r.firstSeenAt).toISOString(), lastSeenAt: new Date(r.lastSeenAt).toISOString(), tags: r.tags };
  }
  private toCampaignDto(r: ThreatCampaignRow): ThreatCampaignDto {
    return { id: r.id, workspaceId: r.workspaceId, name: r.name, description: r.description, source: r.source, firstSeenAt: new Date(r.firstSeenAt).toISOString(), lastSeenAt: new Date(r.lastSeenAt).toISOString(), tags: r.tags };
  }
  private toReportDto(r: ThreatReportRow): ThreatReportDto {
    return { id: r.id, workspaceId: r.workspaceId, title: r.title, summary: r.summary, source: r.source, url: r.url, publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null, tags: r.tags };
  }
  private toTechniqueDto(r: ThreatTechniqueRow): ThreatTechniqueDto {
    return { id: r.id, workspaceId: r.workspaceId, externalId: r.externalId, name: r.name, description: r.description, tactic: r.tactic, source: r.source };
  }
  private toRelationshipDto(r: ThreatRelationshipRow): ThreatRelationshipDto {
    return { id: r.id, workspaceId: r.workspaceId, sourceType: r.sourceType, sourceId: r.sourceId, targetType: r.targetType, targetId: r.targetId, relationType: r.relationType, confidence: r.confidence, source: r.source, createdAt: new Date(r.createdAt).toISOString() };
  }

  async listActors(workspaceId: string, limit = 100): Promise<ThreatActorDto[]> {
    const rows = await this.actorRepo.findMany({ where: { OR: [{ workspaceId }, { workspaceId: null }] }, orderBy: { lastSeenAt: 'desc' }, take: limit });
    return rows.map((r) => this.toActorDto(r));
  }

  async listCampaigns(workspaceId: string, limit = 100): Promise<ThreatCampaignDto[]> {
    const rows = await this.campaignRepo.findMany({ where: { OR: [{ workspaceId }, { workspaceId: null }] }, orderBy: { lastSeenAt: 'desc' }, take: limit });
    return rows.map((r) => this.toCampaignDto(r));
  }

  async listReports(workspaceId: string, limit = 100): Promise<ThreatReportDto[]> {
    const rows = await this.reportRepo.findMany({ where: { OR: [{ workspaceId }, { workspaceId: null }] }, orderBy: { publishedAt: 'desc' }, take: limit });
    return rows.map((r) => this.toReportDto(r));
  }

  async listTechniques(workspaceId: string, limit = 200): Promise<ThreatTechniqueDto[]> {
    const rows = await this.techniqueRepo.findMany({ where: { OR: [{ workspaceId }, { workspaceId: null }] }, orderBy: { externalId: 'asc' }, take: limit });
    return rows.map((r) => this.toTechniqueDto(r));
  }

  async listRelationships(workspaceId: string, objectType: string, objectId: string): Promise<ThreatRelationshipDto[]> {
    const rows = await this.relationshipRepo.findMany({
      where: {
        OR: [
          { sourceType: objectType, sourceId: objectId, OR: [{ workspaceId }, { workspaceId: null }] },
          { targetType: objectType, targetId: objectId, OR: [{ workspaceId }, { workspaceId: null }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.toRelationshipDto(r));
  }

  /// `ThreatActor` has only an `@@index([workspaceId, name])`, not a
  /// unique constraint (a real-world actor name genuinely isn't guaranteed
  /// unique the way an indicator value or a technique's external taxonomy
  /// id is — different feeds attribute the same activity to differently-
  /// spelled actor names all the time) — so this is a manual
  /// find-then-write rather than a DB-level `upsert()`, deliberately
  /// scoped to an exact (workspaceId, name) match to stay idempotent for
  /// re-imports of the *same* feed without merging distinct actors that
  /// happen to share a name.
  async upsertActor(workspaceId: string | null, name: string, fields: { aliases?: string[]; description?: string | null; source: string; tags?: string[] }): Promise<void> {
    const existing = await this.actorRepo.findFirst({ where: { workspaceId, name } });
    if (existing) {
      await this.actorRepo.update({
        where: { id: existing.id },
        data: { aliases: fields.aliases ?? [], description: fields.description ?? null, source: fields.source, tags: fields.tags ?? [], lastSeenAt: new Date() },
      });
      return;
    }
    await this.actorRepo.create({
      data: { workspaceId, name, aliases: fields.aliases ?? [], description: fields.description ?? null, source: fields.source, tags: fields.tags ?? [] },
    });
  }

  /// Same rationale as `upsertActor` above — `ThreatCampaign` also has no
  /// unique constraint on name.
  async upsertCampaign(workspaceId: string | null, name: string, fields: { description?: string | null; source: string; tags?: string[] }): Promise<void> {
    const existing = await this.campaignRepo.findFirst({ where: { workspaceId, name } });
    if (existing) {
      await this.campaignRepo.update({
        where: { id: existing.id },
        data: { description: fields.description ?? null, source: fields.source, tags: fields.tags ?? [], lastSeenAt: new Date() },
      });
      return;
    }
    await this.campaignRepo.create({
      data: { workspaceId, name, description: fields.description ?? null, source: fields.source, tags: fields.tags ?? [] },
    });
  }

  async createReport(workspaceId: string | null, title: string, fields: { summary: string; source: string; url?: string | null; publishedAt?: Date | null; tags?: string[] }): Promise<void> {
    await this.reportRepo.create({
      data: { workspaceId, title, summary: fields.summary, source: fields.source, url: fields.url ?? null, publishedAt: fields.publishedAt ?? null, tags: fields.tags ?? [] },
    });
  }

  async upsertTechnique(workspaceId: string | null, externalId: string, fields: { name: string; description?: string | null; tactic?: string | null; source: string }): Promise<void> {
    await this.techniqueRepo.upsert({
      where: { workspaceId_externalId: { workspaceId, externalId } },
      create: { workspaceId, externalId, name: fields.name, description: fields.description ?? null, tactic: fields.tactic ?? null, source: fields.source },
      update: { name: fields.name, description: fields.description ?? null, tactic: fields.tactic ?? null, source: fields.source },
    });
  }

  async createRelationship(workspaceId: string | null, sourceType: string, sourceId: string, targetType: string, targetId: string, relationType: string, fields: { confidence?: number; source: string }): Promise<void> {
    await this.relationshipRepo.create({
      data: { workspaceId, sourceType, sourceId, targetType, targetId, relationType, confidence: fields.confidence ?? 0.5, source: fields.source },
    });
  }
}
