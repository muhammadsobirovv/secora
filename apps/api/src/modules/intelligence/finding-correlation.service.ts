import { Injectable, Logger } from '@nestjs/common';
import type { CorrelationInsightDto } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

interface CorrelationInsightRow {
  id: string;
  targetId: string | null;
  kind: string;
  title: string;
  description: string;
  severity: string | null;
  relatedRefs: unknown;
  createdAt: Date | string;
}

function toDto(row: CorrelationInsightRow): CorrelationInsightDto {
  return {
    id: row.id,
    targetId: row.targetId,
    kind: row.kind as CorrelationInsightDto['kind'],
    title: row.title,
    description: row.description,
    severity: row.severity,
    relatedRefs: row.relatedRefs,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

/// Module 16 — task #379. Proposes insights linking two or more
/// already-persisted facts — never creates a `BugBountyFinding` on its
/// own (see schema.prisma's doc comment on CorrelationInsight; a human or
/// the AI Security Analyst still decides whether to promote one). Runs
/// three heuristics against data this module (or Module 3/6) already
/// derived — no new scanning:
///   1. OPEN_PORT_EXPOSED_SERVICE: an OPEN_PORT recon finding on a
///      commonly-sensitive port (21/23/3389/6379/9200/27017/...) with no
///      corresponding BugBountyFinding already tracking it.
///   2. OUTDATED_TECH_KNOWN_CVE: a Technology row with a CveMatch above a
///      confidence threshold (empty until Vulnerability Matching, task
///      #395, actually populates CveMatch — this correlation is honest
///      about depending on that, not a fabricated shortcut).
///   3. MISSING_HEADER_SENSITIVE_ENDPOINT: an HTTP_HEADER recon finding
///      showing a missing security header (CSP/HSTS/X-Frame-Options) on a
///      target that also has a URL finding matching a sensitive-looking
///      path (/admin, /api, /login, ...).
///
/// Module 17 — task #464 (Change Intelligence) adds a fourth heuristic,
/// `detectChangeIntelligence`, which is different in kind from the three
/// above: instead of re-evaluating the target's full current state, it
/// reads only the `ChangeDetectionEvent` rows this specific recon run just
/// produced (`ChangeDetectionService.diffLatestForTarget`, which already
/// runs earlier in the same event handler) and flags the ones that
/// represent newly-appeared attack surface — a new subdomain/asset, or a
/// newly-opened port. This is "Potential Exposure" in the spec's sense:
/// not a new scan finding, but a *change* worth an analyst's attention
/// specifically because it's new, which the three static heuristics above
/// would silently re-derive every run without ever calling out.
const SENSITIVE_PORTS: Record<string, string> = {
  '21': 'FTP', '23': 'Telnet', '3389': 'RDP', '6379': 'Redis',
  '9200': 'Elasticsearch', '27017': 'MongoDB', '5432': 'PostgreSQL',
  '3306': 'MySQL', '9092': 'Kafka', '2375': 'Docker API',
};
const SENSITIVE_PATH_PATTERN = /\/(admin|api|login|auth|internal|debug|console)\b/i;

@Injectable()
export class FindingCorrelationService {
  private readonly logger = new Logger(FindingCorrelationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runForTarget(
    workspaceId: string,
    projectId: string,
    targetId: string,
    reconJobId?: string,
  ): Promise<number> {
    const insights: Array<{
      kind: string;
      title: string;
      description: string;
      severity: string | null;
      relatedRefs: unknown;
    }> = [];

    insights.push(...(await this.detectExposedServices(targetId)));
    insights.push(...(await this.detectOutdatedTechWithCve(targetId)));
    insights.push(...(await this.detectMissingHeadersOnSensitivePaths(targetId)));
    // reconJobId is optional so callers that only have a target (e.g. a
    // future manual "re-run correlation" action) still work — Change
    // Intelligence simply has nothing to say without a specific run to
    // diff against.
    if (reconJobId) {
      insights.push(...(await this.detectChangeIntelligence(targetId, reconJobId)));
    }

    if (insights.length === 0) return 0;

    const createMany = (
      this.prisma as unknown as {
        correlationInsight: { createMany: (args: unknown) => Promise<{ count: number }> };
      }
    ).correlationInsight;

    const result = await createMany.createMany({
      data: insights.map((i) => ({ workspaceId, projectId, targetId, ...i })),
    });
    this.logger.log(`Recorded ${result.count} correlation insights for target ${targetId}`);
    return result.count;
  }

  async listForProject(projectId: string, limit = 100): Promise<CorrelationInsightDto[]> {
    const rows = await (
      this.prisma as unknown as {
        correlationInsight: { findMany: (args: unknown) => Promise<CorrelationInsightRow[]> };
      }
    ).correlationInsight.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toDto);
  }

  private async detectExposedServices(targetId: string) {
    const openPorts = await this.prisma.reconFinding.findMany({
      where: { targetId, type: 'OPEN_PORT' },
      select: { value: true },
    });
    const out: Array<{ kind: string; title: string; description: string; severity: string | null; relatedRefs: unknown }> = [];
    for (const port of openPorts) {
      const portNumber = port.value.match(/\d+/)?.[0];
      const service = portNumber ? SENSITIVE_PORTS[portNumber] : undefined;
      if (!service) continue;
      out.push({
        kind: 'OPEN_PORT_EXPOSED_SERVICE',
        title: `${service} exposed on port ${portNumber}`,
        description: `Target has an open port running ${service}, a service commonly restricted to internal networks. Verify this is intentional and, if not, restrict access or require authentication.`,
        severity: 'MEDIUM',
        relatedRefs: { port: port.value },
      });
    }
    return out;
  }

  private async detectOutdatedTechWithCve(targetId: string) {
    const matches = await (
      this.prisma as unknown as {
        cveMatch: {
          findMany: (args: unknown) => Promise<
            { id: string; cveId: string; confidence: number; technologyId: string | null }[]
          >;
        };
      }
    ).cveMatch.findMany({ where: { targetId, confidence: { gte: 0.6 } }, take: 50 });

    return matches.map((m) => ({
      kind: 'OUTDATED_TECH_KNOWN_CVE',
      title: `Possible known vulnerability: ${m.cveId}`,
      description: `A detected technology on this target matches ${m.cveId} at ${Math.round(m.confidence * 100)}% confidence. Review the CVE details and confirm the affected version before reporting.`,
      severity: null,
      relatedRefs: { cveId: m.cveId, technologyId: m.technologyId, cveMatchId: m.id },
    }));
  }

  /// NOTE: no existing Recon normalizer currently emits SECURITY_HEADER
  /// findings (the enum value exists in ReconFindingType/the findings
  /// filter DTO, but is unused by any ToolRunner as of Module 16) — this
  /// heuristic is real and will fire correctly as soon as a normalizer
  /// starts producing them, but returns zero insights today. Disclosed
  /// here rather than silently no-op'd, per the "no fake verification"
  /// requirement — see the Module 16 final report's "Remaining technical
  /// debt" section.
  private async detectMissingHeadersOnSensitivePaths(targetId: string) {
    const [headers, urls] = await Promise.all([
      this.prisma.reconFinding.findMany({
        where: { targetId, type: 'SECURITY_HEADER' },
        select: { value: true },
      }),
      this.prisma.reconFinding.findMany({
        where: { targetId, type: 'URL' },
        select: { value: true },
      }),
    ]);

    const presentHeaders = new Set(headers.map((h) => h.value.toLowerCase()));
    const missing = ['content-security-policy', 'strict-transport-security', 'x-frame-options'].filter(
      (h) => !presentHeaders.has(h),
    );
    const sensitiveUrls = urls.filter((u) => SENSITIVE_PATH_PATTERN.test(u.value));

    if (missing.length === 0 || sensitiveUrls.length === 0) return [];

    return [
      {
        kind: 'MISSING_HEADER_SENSITIVE_ENDPOINT',
        title: `Missing security headers on sensitive endpoints`,
        description: `${missing.join(', ')} appear absent, and this target has ${sensitiveUrls.length} endpoint(s) matching a sensitive path pattern (admin/api/login/...). Verify header configuration on those specific paths.`,
        severity: 'LOW',
        relatedRefs: { missingHeaders: missing, sampleUrls: sensitiveUrls.slice(0, 5).map((u) => u.value) },
      },
    ];
  }

  /// Module 17 — task #464. Reads only the `ChangeDetectionEvent` rows
  /// stamped with this specific `reconJobId` (i.e. exactly the diff
  /// `ChangeDetectionService.diffLatestForTarget` just computed for this
  /// run — see that service's own `previousJob` lookup) rather than
  /// re-scanning all recon findings, so this never double-fires for a
  /// subdomain/port that was already flagged on a prior run. Only
  /// NEW_SUBDOMAIN and NEW_PORT currently apply — `ChangeDetectionService`
  /// does not yet emit NEW_ENDPOINT/CHANGED_TECHNOLOGY/etc (see that
  /// model's enum comment), so this heuristic is honest about only
  /// covering what actually gets produced today.
  private async detectChangeIntelligence(targetId: string, reconJobId: string) {
    const events = await (
      this.prisma as unknown as {
        changeDetectionEvent: {
          findMany: (args: unknown) => Promise<
            { id: string; changeType: string; entityRef: string }[]
          >;
        };
      }
    ).changeDetectionEvent.findMany({
      where: { targetId, reconJobId, changeType: { in: ['NEW_SUBDOMAIN', 'NEW_PORT'] } },
      take: 200,
    });

    const out: Array<{ kind: string; title: string; description: string; severity: string | null; relatedRefs: unknown }> = [];

    for (const event of events) {
      if (event.changeType === 'NEW_SUBDOMAIN') {
        out.push({
          kind: 'NEW_ASSET_POTENTIAL_EXPOSURE',
          title: `New asset discovered: ${event.entityRef}`,
          description: `${event.entityRef} was not present in the previous scan of this target and represents new attack surface. Review it (ownership, purpose, exposed services) before assuming it's expected.`,
          severity: 'LOW',
          relatedRefs: { subdomain: event.entityRef, changeDetectionEventId: event.id },
        });
        continue;
      }

      // NEW_PORT
      const portNumber = event.entityRef.match(/\d+/)?.[0];
      const service = portNumber ? SENSITIVE_PORTS[portNumber] : undefined;
      out.push({
        kind: 'NEW_SERVICE_POTENTIAL_EXPOSURE',
        title: service
          ? `New exposure: ${service} on port ${portNumber} just opened`
          : `New open port detected: ${event.entityRef}`,
        description: service
          ? `Port ${portNumber} (${service}) was closed in the previous scan of this target and is now open — this is a new, potentially unintentional exposure of a service commonly restricted to internal networks. Verify this change was intentional.`
          : `Port ${event.entityRef} was closed in the previous scan of this target and is now open. Verify this change was intentional and review what's listening on it.`,
        severity: service ? 'HIGH' : 'MEDIUM',
        relatedRefs: { port: event.entityRef, changeDetectionEventId: event.id },
      });
    }

    return out;
  }
}
