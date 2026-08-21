import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IndicatorType, ThreatIntelImportLogDto } from '@pentesthub/shared';
import type { EnvConfig } from '../../config/env.validation.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IndicatorsService } from './indicators.service.js';
import { ThreatIntelCatalogService } from './threat-intel-catalog.service.js';

interface ImportLogRow {
  id: string; workspaceId: string | null; sourceType: string; status: string; importedCount: number;
  rejectedCount: number; rejectionSample: unknown; errorSummary: string | null;
  startedAt: Date | string; finishedAt: Date | string | null;
}

function toLogDto(row: ImportLogRow): ThreatIntelImportLogDto {
  return {
    id: row.id, workspaceId: row.workspaceId, sourceType: row.sourceType as ThreatIntelImportLogDto['sourceType'],
    status: row.status as ThreatIntelImportLogDto['status'], importedCount: row.importedCount,
    rejectedCount: row.rejectedCount, errorSummary: row.errorSummary,
    startedAt: new Date(row.startedAt).toISOString(), finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
  };
}

/// Maps a STIX 2.1 `pattern` comparison expression to (type, value) —
/// only the handful of single-observable-equality shapes this platform
/// can act on unambiguously; every other pattern shape (boolean
/// combinations, ranges, unsupported object-paths, `LIKE`/`MATCHES`
/// operators, or anything that fails to parse) is deliberately rejected
/// rather than guessed at — spec section 38's "treat as untrusted data,
/// never silently authorize/act on unparseable content."
const STIX_PATTERN_MATCHERS: Array<{ regex: RegExp; type: IndicatorType }> = [
  { regex: /^\[ipv4-addr:value\s*=\s*'([^']+)'\]$/, type: 'IP' },
  { regex: /^\[ipv6-addr:value\s*=\s*'([^']+)'\]$/, type: 'IP' },
  { regex: /^\[domain-name:value\s*=\s*'([^']+)'\]$/, type: 'DOMAIN' },
  { regex: /^\[url:value\s*=\s*'([^']+)'\]$/, type: 'URL' },
  { regex: /^\[email-addr:value\s*=\s*'([^']+)'\]$/, type: 'EMAIL' },
  { regex: /^\[file:hashes\.'(?:MD5|SHA-1|SHA-256|SHA-512)'\s*=\s*'([^']+)'\]$/, type: 'HASH' },
  { regex: /^\[x509-certificate:hashes\.'(?:MD5|SHA-1|SHA-256)'\s*=\s*'([^']+)'\]$/, type: 'CERTIFICATE' },
];

const MAX_REJECTION_SAMPLE = 20;
const MAX_OBJECTS_PER_BUNDLE = 5000;
const MAX_STRING_FIELD_LENGTH = 4000;

interface RejectedObject { index: number; type: unknown; reason: string }

/// Module 17 — task #468 (STIX/TAXII foundation, spec section 9). Two
/// distinct capabilities, both funneling through the same
/// `ingestBundle()` normalizer:
///   1. `importBundle()` — a workspace pastes/uploads a STIX 2.1 Bundle
///      JSON document directly (manual import, works with zero config —
///      Community Edition guarantee).
///   2. `pollTaxiiCollection()` — this platform acting as a TAXII 2.1
///      *client* against an operator-configured server/collection
///      (`THREAT_INTEL_TAXII_*` env vars), fetching that collection's
///      `/objects` endpoint (which itself returns a STIX envelope) and
///      feeding it through the same normalizer. Never stands up a TAXII
///      server itself.
///
/// Every object in a bundle is untrusted external data (spec section 38):
/// this only ever structurally validates and extracts known-safe fields
/// (string/array/date checks, length caps) — it never evaluates, executes,
/// or interprets a STIX object as an instruction, and a malformed/
/// unrecognized object is counted as "rejected" (with a bounded sample
/// recorded on the `ThreatIntelImportLog` for audit) rather than either
/// crashing the import or being silently dropped.
@Injectable()
export class StixTaxiiService {
  private readonly logger = new Logger(StixTaxiiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly indicators: IndicatorsService,
    private readonly catalog: ThreatIntelCatalogService,
  ) {}

  private get logRepo() {
    return (
      this.prisma as unknown as {
        threatIntelImportLog: {
          create: (args: unknown) => Promise<ImportLogRow>;
          update: (args: unknown) => Promise<ImportLogRow>;
        };
      }
    ).threatIntelImportLog;
  }

  /// `workspaceId: null` here would make the imported objects globally
  /// visible — deliberately never done for a manual/TAXII import (only
  /// `ThreatIntelProviderService`'s public-feed adapters write global
  /// rows); every STIX-sourced object is private to the importing
  /// workspace.
  async importBundle(workspaceId: string, userId: string, bundle: Record<string, unknown>): Promise<ThreatIntelImportLogDto> {
    return this.ingestBundle(workspaceId, userId, bundle, 'MANUAL_IMPORT');
  }

  async pollTaxiiCollection(workspaceId: string, userId: string): Promise<ThreatIntelImportLogDto> {
    const serverUrl = this.configService.get('THREAT_INTEL_TAXII_SERVER_URL', { infer: true });
    const collectionId = this.configService.get('THREAT_INTEL_TAXII_COLLECTION_ID', { infer: true });
    const apiKey = this.configService.get('THREAT_INTEL_TAXII_API_KEY', { infer: true });

    if (!serverUrl || !collectionId) {
      throw new AppException(
        'THREAT_INTEL_PROVIDER_NOT_CONFIGURED',
        'TAXII polling requires THREAT_INTEL_TAXII_SERVER_URL and THREAT_INTEL_TAXII_COLLECTION_ID to be set. This is opt-in and never required for Community Edition.',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    const url = `${serverUrl.replace(/\/$/, '')}/collections/${encodeURIComponent(collectionId)}/objects/`;
    let body: unknown;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/taxii+json;version=2.1',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`TAXII server returned HTTP ${res.status}`);
      body = await res.json();
    } catch (error: unknown) {
      this.logger.warn(`TAXII poll of ${collectionId} failed: ${String(error)}`);
      throw new AppException(
        'THREAT_INTEL_PROVIDER_FETCH_FAILED',
        `Failed to poll TAXII collection ${collectionId}: ${String(error)}.`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    // A TAXII 2.1 "objects" response is itself envelope-shaped
    // ({ objects: [...StixObject] }), not a bare STIX Bundle — normalize
    // to the Bundle shape `ingestBundle` expects before handing it off.
    const objects = (body as { objects?: unknown[] })?.objects;
    if (!Array.isArray(objects)) {
      throw new AppException(
        'THREAT_INTEL_IMPORT_INVALID',
        'TAXII server response did not contain an "objects" array — treating as untrusted/malformed, nothing was imported.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    return this.ingestBundle(workspaceId, userId, { type: 'bundle', objects }, 'STIX_TAXII');
  }

  private async ingestBundle(
    workspaceId: string,
    userId: string,
    bundle: Record<string, unknown>,
    sourceType: 'MANUAL_IMPORT' | 'STIX_TAXII',
  ): Promise<ThreatIntelImportLogDto> {
    const log = await this.logRepo.create({
      data: { workspaceId, sourceType, status: 'FAILED', importedCount: 0, rejectedCount: 0, importedBy: userId },
    });

    if (bundle.type !== 'bundle' || !Array.isArray(bundle.objects)) {
      await this.logRepo.update({
        where: { id: log.id },
        data: { status: 'FAILED', errorSummary: 'Payload is not a STIX 2.1 Bundle ({type: "bundle", objects: [...]})', finishedAt: new Date() },
      });
      throw new AppException('THREAT_INTEL_IMPORT_INVALID', 'Payload is not a valid STIX 2.1 Bundle.', HttpStatus.BAD_REQUEST);
    }

    const objects = (bundle.objects as unknown[]).slice(0, MAX_OBJECTS_PER_BUNDLE);
    const rejectedSample: RejectedObject[] = [];
    let imported = 0;
    let rejected = 0;

    for (let i = 0; i < objects.length; i += 1) {
      const obj = objects[i];
      try {
        const handled = await this.ingestOne(workspaceId, obj);
        if (handled) {
          imported += 1;
        } else {
          rejected += 1;
          if (rejectedSample.length < MAX_REJECTION_SAMPLE) {
            rejectedSample.push({ index: i, type: this.safeType(obj), reason: 'Unrecognized or unsupported STIX object type/shape.' });
          }
        }
      } catch (error: unknown) {
        rejected += 1;
        if (rejectedSample.length < MAX_REJECTION_SAMPLE) {
          rejectedSample.push({ index: i, type: this.safeType(obj), reason: String(error) });
        }
      }
    }

    const finished = await this.logRepo.update({
      where: { id: log.id },
      data: {
        status: rejected === 0 ? 'SUCCEEDED' : imported > 0 ? 'PARTIAL' : 'FAILED',
        importedCount: imported,
        rejectedCount: rejected,
        rejectionSample: rejectedSample.length > 0 ? rejectedSample : null,
        finishedAt: new Date(),
      },
    });

    return toLogDto(finished);
  }

  private safeType(obj: unknown): unknown {
    if (typeof obj === 'object' && obj !== null && 'type' in obj) {
      const t = (obj as { type: unknown }).type;
      return typeof t === 'string' ? t.slice(0, 100) : null;
    }
    return null;
  }

  /// Returns `true` if the object was a recognized, structurally-valid
  /// STIX SDO this platform knows how to store, `false` if it's an
  /// unrecognized/unsupported type (counted as rejected by the caller,
  /// not an error). Throws only for a recognized type with malformed
  /// required fields (also counted as rejected, with the thrown message
  /// as the reason).
  private async ingestOne(workspaceId: string, raw: unknown): Promise<boolean> {
    if (typeof raw !== 'object' || raw === null) return false;
    const obj = raw as Record<string, unknown>;
    const type = obj.type;
    if (typeof type !== 'string') return false;

    switch (type) {
      case 'indicator': {
        const pattern = obj.pattern;
        if (typeof pattern !== 'string' || pattern.length > MAX_STRING_FIELD_LENGTH) {
          throw new Error('indicator.pattern missing or too long');
        }
        const matcher = STIX_PATTERN_MATCHERS.find((m) => m.regex.test(pattern));
        if (!matcher) {
          throw new Error(`indicator.pattern shape not supported: "${pattern.slice(0, 80)}"`);
        }
        const match = pattern.match(matcher.regex);
        const value = match?.[1];
        if (!value) throw new Error('failed to extract indicator value from pattern');
        const confidence = typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence / 100)) : 0.5;
        const description = typeof obj.description === 'string' ? obj.description.slice(0, MAX_STRING_FIELD_LENGTH) : undefined;
        await this.indicators.upsertFromFeed(workspaceId, matcher.type, value, { confidence, source: 'STIX_TAXII', description });
        return true;
      }
      case 'threat-actor': {
        const name = obj.name;
        if (typeof name !== 'string' || name.length === 0 || name.length > 500) throw new Error('threat-actor.name missing/invalid');
        const aliases = Array.isArray(obj.aliases) ? obj.aliases.filter((a): a is string => typeof a === 'string').slice(0, 50) : [];
        const description = typeof obj.description === 'string' ? obj.description.slice(0, MAX_STRING_FIELD_LENGTH) : null;
        await this.catalog.upsertActor(workspaceId, name, { aliases, description, source: 'STIX_TAXII' });
        return true;
      }
      case 'campaign': {
        const name = obj.name;
        if (typeof name !== 'string' || name.length === 0 || name.length > 500) throw new Error('campaign.name missing/invalid');
        const description = typeof obj.description === 'string' ? obj.description.slice(0, MAX_STRING_FIELD_LENGTH) : null;
        await this.catalog.upsertCampaign(workspaceId, name, { description, source: 'STIX_TAXII' });
        return true;
      }
      case 'report': {
        const name = obj.name;
        if (typeof name !== 'string' || name.length === 0 || name.length > 500) throw new Error('report.name missing/invalid');
        const description = typeof obj.description === 'string' ? obj.description.slice(0, MAX_STRING_FIELD_LENGTH) : '';
        const published = typeof obj.published === 'string' ? new Date(obj.published) : null;
        await this.catalog.createReport(workspaceId, name, { summary: description, source: 'STIX_TAXII', publishedAt: published && !Number.isNaN(published.getTime()) ? published : null });
        return true;
      }
      case 'attack-pattern': {
        const name = obj.name;
        if (typeof name !== 'string' || name.length === 0 || name.length > 500) throw new Error('attack-pattern.name missing/invalid');
        const refs = Array.isArray(obj.external_references) ? obj.external_references : [];
        const mitreRef = refs.find((r): r is { source_name?: string; external_id?: string } =>
          typeof r === 'object' && r !== null && (r as { source_name?: unknown }).source_name === 'mitre-attack');
        const externalId = typeof mitreRef?.external_id === 'string' ? mitreRef.external_id : (typeof obj.id === 'string' ? obj.id : null);
        if (!externalId) throw new Error('attack-pattern has no usable external id');
        const description = typeof obj.description === 'string' ? obj.description.slice(0, MAX_STRING_FIELD_LENGTH) : null;
        await this.catalog.upsertTechnique(workspaceId, externalId, { name, description, source: 'STIX_TAXII' });
        return true;
      }
      case 'relationship': {
        const sourceRef = obj.source_ref;
        const targetRef = obj.target_ref;
        const relationshipType = obj.relationship_type;
        if (typeof sourceRef !== 'string' || typeof targetRef !== 'string' || typeof relationshipType !== 'string') {
          throw new Error('relationship missing source_ref/target_ref/relationship_type');
        }
        // STIX ids embed their object type as a prefix (e.g.
        // "threat-actor--<uuid>") — used as the free-text
        // sourceType/targetType discriminator, same "loose polymorphic
        // reference" posture `ThreatRelationship`'s own schema doc
        // comment describes.
        const sourceType = sourceRef.split('--')[0]?.toUpperCase() ?? 'UNKNOWN';
        const targetType = targetRef.split('--')[0]?.toUpperCase() ?? 'UNKNOWN';
        await this.catalog.createRelationship(workspaceId, sourceType, sourceRef, targetType, targetRef, relationshipType, { source: 'STIX_TAXII' });
        return true;
      }
      default:
        // Includes 'bundle', 'identity', 'malware', 'marking-definition',
        // 'observed-data', 'course-of-action', 'sighting', and any other
        // SDO/SRO this platform doesn't yet have a home for — not an
        // error, just not stored (counted as rejected for audit
        // visibility, per spec section 38).
        return false;
    }
  }
}
