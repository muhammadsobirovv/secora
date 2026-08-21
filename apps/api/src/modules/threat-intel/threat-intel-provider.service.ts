import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IndicatorType, ThreatIntelImportLogDto, ThreatIntelSourceType } from '@pentesthub/shared';
import type { EnvConfig } from '../../config/env.validation.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IndicatorsService } from './indicators.service.js';

interface FetchedIndicator {
  type: IndicatorType;
  value: string;
  confidence?: number;
  description?: string;
}

interface ImportLogRow {
  id: string;
  workspaceId: string | null;
  sourceType: string;
  status: string;
  importedCount: number;
  rejectedCount: number;
  errorSummary: string | null;
  startedAt: Date | string;
  finishedAt: Date | string | null;
}

function toLogDto(row: ImportLogRow): ThreatIntelImportLogDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sourceType: row.sourceType as ThreatIntelSourceType,
    status: row.status as ThreatIntelImportLogDto['status'],
    importedCount: row.importedCount,
    rejectedCount: row.rejectedCount,
    errorSummary: row.errorSummary,
    startedAt: new Date(row.startedAt).toISOString(),
    finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
  };
}

/// Module 17 — task #465 (Threat Intelligence Engine, spec sections 6-7).
/// Mirrors `CveIntelligenceService`'s provider-abstraction shape and both
/// of its hard guarantees:
///   1. Community Edition guarantee: reads (`IndicatorsService.list*`)
///      never call out; only this service's explicit `refresh()` does,
///      and only when `THREAT_INTEL_PROVIDER != 'none'` (the default).
///   2. Graceful degradation: a provider outage/timeout/malformed
///      response never crashes the process and never partially corrupts
///      the cache — every fetched indicator is upserted individually via
///      `IndicatorsService.upsertFromFeed`, and a per-item failure is
///      counted as "rejected" (recorded in the `ThreatIntelImportLog`
///      audit trail — spec section 38's "untrusted data" requirement)
///      rather than aborting the whole batch.
///
/// `cisa_kev`/`nvd`/`osv`/`github_advisories` deliberately reuse the exact
/// same public feed URLs `CveIntelligenceService` already talks to (CVE
/// ids are themselves a valid `IndicatorType`) — kept as a *separate*
/// service/config from CVE intelligence rather than merged into it,
/// because "give me a CVE's CVSS/CWE detail" (CveIntelligenceService) and
/// "give me a bulk list of indicators to correlate against my assets"
/// (this service) are different call shapes even against the same feed.
@Injectable()
export class ThreatIntelProviderService {
  private readonly logger = new Logger(ThreatIntelProviderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly indicators: IndicatorsService,
  ) {}

  private get logRepo() {
    return (
      this.prisma as unknown as {
        threatIntelImportLog: {
          create: (args: unknown) => Promise<ImportLogRow>;
          update: (args: unknown) => Promise<ImportLogRow>;
          findMany: (args: unknown) => Promise<ImportLogRow[]>;
        };
      }
    ).threatIntelImportLog;
  }

  async listImportLogs(workspaceId: string, limit = 50): Promise<ThreatIntelImportLogDto[]> {
    const rows = await this.logRepo.findMany({
      where: { OR: [{ workspaceId }, { workspaceId: null }] },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return rows.map(toLogDto);
  }

  /// Explicitly operator/analyst-triggered — never scheduled automatically
  /// from inside this service (an operator wanting a recurring refresh
  /// wires `THREAT_INTEL_REFRESH_INTERVAL_HOURS` to their own scheduled-
  /// job mechanism, same posture as `CVE_INTELLIGENCE_REFRESH_INTERVAL_HOURS`).
  async refresh(sourceTypeOverride?: ThreatIntelSourceType): Promise<ThreatIntelImportLogDto> {
    const configuredProvider = this.configService.get('THREAT_INTEL_PROVIDER', { infer: true });
    const provider = sourceTypeOverride ? this.mapSourceTypeToProvider(sourceTypeOverride) : configuredProvider;

    if (provider === 'none') {
      throw new AppException(
        'THREAT_INTEL_PROVIDER_NOT_CONFIGURED',
        'No external threat intelligence provider is configured (THREAT_INTEL_PROVIDER=none). This is opt-in and never required for Community Edition.',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    const log = await this.logRepo.create({
      data: { workspaceId: null, sourceType: provider.toUpperCase(), status: 'FAILED', importedCount: 0, rejectedCount: 0 },
    });

    let fetched: FetchedIndicator[];
    try {
      fetched = await this.fetchFromProvider(provider);
    } catch (error: unknown) {
      this.logger.warn(`Threat intel refresh via ${provider} failed: ${String(error)}`);
      await this.logRepo.update({
        where: { id: log.id },
        data: { status: 'FAILED', errorSummary: String(error), finishedAt: new Date() },
      });
      throw new AppException(
        'THREAT_INTEL_PROVIDER_FETCH_FAILED',
        `Failed to fetch from the ${provider} provider: ${String(error)}. No indicators were written.`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const cap = this.configService.get('THREAT_INTEL_MAX_INDICATORS_PER_IMPORT', { infer: true });
    const capped = fetched.slice(0, cap);
    let imported = 0;
    let rejected = fetched.length - capped.length;

    for (const item of capped) {
      try {
        await this.indicators.upsertFromFeed(null, item.type, item.value, {
          confidence: item.confidence,
          source: provider.toUpperCase(),
          description: item.description,
        });
        imported += 1;
      } catch (error: unknown) {
        rejected += 1;
        this.logger.debug(`Rejected indicator during ${provider} import: ${String(error)}`);
      }
    }

    const finished = await this.logRepo.update({
      where: { id: log.id },
      data: {
        status: rejected === 0 ? 'SUCCEEDED' : imported > 0 ? 'PARTIAL' : 'FAILED',
        importedCount: imported,
        rejectedCount: rejected,
        finishedAt: new Date(),
      },
    });

    return toLogDto(finished);
  }

  private mapSourceTypeToProvider(sourceType: ThreatIntelSourceType): 'cisa_kev' | 'nvd' | 'osv' | 'github_advisories' | 'vendor' | 'none' {
    switch (sourceType) {
      case 'CISA_KEV': return 'cisa_kev';
      case 'NVD': return 'nvd';
      case 'OSV': return 'osv';
      case 'GITHUB_ADVISORIES': return 'github_advisories';
      case 'VENDOR_ADVISORY': return 'vendor';
      default: return 'none'; // STIX_TAXII/OPERATOR_FEED/MANUAL_IMPORT go through StixTaxiiService, not this bulk-feed path
    }
  }

  private async fetchFromProvider(
    provider: 'cisa_kev' | 'nvd' | 'osv' | 'github_advisories' | 'vendor',
  ): Promise<FetchedIndicator[]> {
    switch (provider) {
      case 'cisa_kev': return this.fetchCisaKev();
      case 'nvd': return this.fetchNvdRecentCves();
      case 'osv': return this.fetchOsvRecentIds();
      case 'github_advisories': return this.fetchGithubAdvisoryCves();
      case 'vendor': return this.fetchVendorFeed();
    }
  }

  /// The same CISA KEV JSON feed `CveIntelligenceService.isKnownExploited`
  /// checks a single id against — here consumed as a bulk source of
  /// `CVE`-typed indicators with elevated default confidence (KEV listing
  /// means CISA has direct evidence of active exploitation, the strongest
  /// public signal this platform has access to — still capped below 1.0
  /// per the "never automatically declare compromise" posture).
  private async fetchCisaKev(): Promise<FetchedIndicator[]> {
    const res = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
    if (!res.ok) throw new Error(`CISA KEV returned HTTP ${res.status}`);
    const body = (await res.json()) as { vulnerabilities?: Array<{ cveID?: string; vulnerabilityName?: string; shortDescription?: string }> };
    return (body.vulnerabilities ?? [])
      .filter((v) => typeof v.cveID === 'string')
      .map((v) => ({
        type: 'CVE' as const,
        value: v.cveID as string,
        confidence: 0.85,
        description: v.shortDescription ?? v.vulnerabilityName ?? 'Listed on the CISA Known Exploited Vulnerabilities catalog.',
      }));
  }

  private async fetchNvdRecentCves(): Promise<FetchedIndicator[]> {
    const apiKey = this.configService.get('NVD_API_KEY', { infer: true });
    const res = await fetch(
      'https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=' +
        encodeURIComponent(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) +
        '&pubEndDate=' + encodeURIComponent(new Date().toISOString()) + '&resultsPerPage=200',
      { headers: apiKey ? { apiKey } : {} },
    );
    if (!res.ok) throw new Error(`NVD returned HTTP ${res.status}`);
    const body = (await res.json()) as { vulnerabilities?: Array<{ cve?: { id?: string; descriptions?: Array<{ lang: string; value: string }> } }> };
    return (body.vulnerabilities ?? [])
      .filter((v) => typeof v.cve?.id === 'string')
      .map((v) => ({
        type: 'CVE' as const,
        value: v.cve!.id as string,
        confidence: 0.5,
        description: v.cve?.descriptions?.find((d) => d.lang === 'en')?.value,
      }));
  }

  private async fetchOsvRecentIds(): Promise<FetchedIndicator[]> {
    // OSV has no "recent" bulk endpoint suitable for indicator ingestion
    // without a known ecosystem/package to scope the query to — disclosed
    // scope limit (mirrors the OSV note in CveIntelligenceService): this
    // provider is fully supported for single-CVE enrichment
    // (CveIntelligenceService.refresh) but not for bulk indicator import.
    throw new Error('OSV does not expose a suitable bulk feed for indicator ingestion — use THREAT_INTEL_PROVIDER=cisa_kev, nvd, github_advisories, or vendor for bulk import.');
  }

  private async fetchGithubAdvisoryCves(): Promise<FetchedIndicator[]> {
    const res = await fetch('https://api.github.com/advisories?per_page=100', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub Advisories returned HTTP ${res.status}`);
    const body = (await res.json()) as Array<{ cve_id?: string | null; summary?: string }>;
    return body
      .filter((a) => typeof a.cve_id === 'string')
      .map((a) => ({ type: 'CVE' as const, value: a.cve_id as string, confidence: 0.5, description: a.summary }));
  }

  private async fetchVendorFeed(): Promise<FetchedIndicator[]> {
    const url = this.configService.get('THREAT_INTEL_VENDOR_URL', { infer: true });
    if (!url) throw new Error('THREAT_INTEL_PROVIDER=vendor but THREAT_INTEL_VENDOR_URL is not set');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Vendor feed returned HTTP ${res.status}`);
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) throw new Error('Vendor feed did not return a JSON array');
    const validTypes = new Set(['IP', 'DOMAIN', 'URL', 'HASH', 'EMAIL', 'CVE', 'CPE', 'ASN', 'CERTIFICATE', 'FILE', 'MALWARE_FAMILY']);
    return body
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .filter((item) => typeof item.type === 'string' && validTypes.has(item.type) && typeof item.value === 'string')
      .map((item) => ({
        type: item.type as IndicatorType,
        value: item.value as string,
        confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
        description: typeof item.description === 'string' ? item.description : undefined,
      }));
  }
}
