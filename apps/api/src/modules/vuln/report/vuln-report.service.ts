import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  FindingExplanationDto,
  ReportLanguage,
  VulnReportDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  VULN_SCAN_JOBS_REPOSITORY,
  type VulnScanJobsRepository,
} from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import { resolveVulnScanJobForCaller } from '../commands/stop-vuln-scan-job.command.js';
import type { RawFinding } from './finding-quality.js';
import { FindingExplanationService } from './finding-explanation.service.js';
import { buildReport } from './report.builder.js';

/// What a shared link shows: the report without internal ids (job, target,
/// finding rows). Evidence was already redacted when the report was built.
export function toPublicReport(report: VulnReportDto): VulnReportDto {
  return {
    ...report,
    jobId: '',
    target: { id: '', type: report.target.type, value: report.target.value },
    authorization: report.authorization?.approvedBy
      ? { ...report.authorization, approvedBy: maskEmail(report.authorization.approvedBy) }
      : report.authorization,
    findings: report.findings.map((finding, index) => ({
      ...finding,
      id: `finding-${index + 1}`,
      sources: finding.sources.map((source, i) => ({
        ...source,
        findingId: `finding-${index + 1}-${i + 1}`,
      })),
    })),
  };
}

/// "ci***@acme.example": enough to recognise the mailbox, not to harvest it.
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

export const REPORT_LANGUAGES: readonly ReportLanguage[] = ['en', 'uz', 'ru'];

export function parseLanguage(value: unknown): ReportLanguage {
  return REPORT_LANGUAGES.find((l) => l === value) ?? 'en';
}

/// Loads what a scan stored and turns it into the report. Authorisation is the
/// caller's job: `forCaller` resolves the job through the caller's workspace;
/// `forJob` (used by the public share route) trusts a job id that a valid,
/// unexpired, unrevoked share link already named.
@Injectable()
export class VulnReportService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspaces: WorkspacesRepository,
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly jobs: VulnScanJobsRepository,
    private readonly explanations: FindingExplanationService,
  ) {}

  async forCaller(
    userId: string,
    jobId: string,
    language: ReportLanguage,
  ): Promise<{ report: VulnReportDto; workspaceId: string }> {
    const { workspaceId } = await resolveVulnScanJobForCaller(
      this.workspaces,
      this.jobs,
      userId,
      jobId,
    );
    return { report: await this.forJob(jobId, language), workspaceId };
  }

  async forJob(
    jobId: string,
    language: ReportLanguage,
  ): Promise<VulnReportDto> {
    const job = await this.prisma.vulnScanJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        config: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        target: { select: { id: true, type: true, value: true } },
      },
    });
    if (!job) {
      throw new AppException(
        'VULN_SCAN_JOB_NOT_FOUND',
        'Vulnerability scan job not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const rows = await this.prisma.vulnFinding.findMany({
      where: { jobId },
      include: {
        requestEvidence: { select: { textContent: true } },
        responseEvidence: { select: { textContent: true } },
        payloadEvidence: { select: { textContent: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 2000,
    });
    const logs = await this.prisma.vulnScanJobLog.findMany({
      where: { jobId },
      orderBy: { seq: 'asc' },
      select: { message: true },
      take: 20000,
    });

    const findings: RawFinding[] = rows.map((row) => ({
      id: row.id,
      scanner: row.scanner,
      title: row.title,
      description: row.description,
      severity: row.severity,
      vulnType: row.vulnType,
      signature: row.signature,
      path: row.path,
      matchedAt: row.matchedAt,
      data: (row.data &&
      typeof row.data === 'object' &&
      !Array.isArray(row.data)
        ? row.data
        : {}) as Record<string, unknown>,
      tags: row.tags,
      references: row.references,
      cwe: row.cwe,
      owaspCategory: row.owaspCategory,
      evidence: {
        request: row.requestEvidence?.textContent ?? null,
        response: row.responseEvidence?.textContent ?? null,
        payload: row.payloadEvidence?.textContent ?? null,
      },
    }));

    const roeId = (job.config as Record<string, unknown> | null)?.roeId;
    const roe =
      typeof roeId === 'string'
        ? await this.prisma.roeAuthorization.findUnique({ where: { id: roeId } })
        : null;

    return buildReport({
      authorization: roe
        ? {
            kind: 'ROE',
            clientName: roe.clientName,
            windowStart: roe.windowStart.toISOString(),
            windowEnd: roe.windowEnd.toISOString(),
            ...(roe.approvedAt ? { approvedAt: roe.approvedAt.toISOString() } : {}),
            approvedBy: roe.clientEmail,
          }
        : (job.config as Record<string, unknown> | null)?.attestedOnly === true
          ? { kind: 'ATTESTATION' }
          : { kind: 'OWNERSHIP' },
      job: {
        id: job.id,
        status: job.status,
        config: (job.config &&
        typeof job.config === 'object' &&
        !Array.isArray(job.config)
          ? job.config
          : null) as Record<string, unknown> | null,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
      },
      target: job.target,
      findings,
      logs: logs.map((log) => log.message),
      language,
      now: new Date(),
    });
  }

  /// Explanations that already exist (AI-written and cached, or built in) for
  /// every finding of a report, without calling a model. The exports use this so
  /// downloading a report never costs AI budget.
  async existingExplanations(
    report: VulnReportDto,
  ): Promise<Map<string, FindingExplanationDto>> {
    const out = new Map<string, FindingExplanationDto>();
    for (const finding of report.findings) {
      const cached = await this.explanations.cachedOnly({
        findingId: finding.id,
        checkId: finding.issueKey,
        stack: finding.stack as never,
        language: report.language,
        snippet: finding.snippet,
      });
      if (cached) out.set(finding.id, cached);
    }
    return out;
  }

  async explainFinding(
    userId: string,
    workspaceId: string,
    report: VulnReportDto,
    findingId: string,
  ): Promise<FindingExplanationDto> {
    const finding = report.findings.find((f) => f.id === findingId);
    if (!finding) {
      throw new AppException(
        'VULN_FINDING_NOT_FOUND',
        'Finding not found in this report.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.explanations.explain({
      workspaceId,
      userId,
      language: report.language,
      findingId: finding.id,
      checkId: finding.issueKey,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      stack: finding.stack as never,
      remediation: finding.remediation,
      snippet: finding.snippet,
    });
  }
}
