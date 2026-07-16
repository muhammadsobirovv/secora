import type { BugReportDto } from '@pentesthub/shared';
import type { BugReport } from '../../../prisma-types.js';

export function toBugReportDto(
  report: BugReport,
  evidenceIds: string[],
): BugReportDto {
  return {
    id: report.id,
    workspaceId: report.workspaceId,
    projectId: report.projectId,
    programId: report.programId,
    findingId: report.findingId,
    title: report.title,
    template: report.template,
    status: report.status,
    summary: report.summary,
    impact: report.impact,
    stepsToReproduce: report.stepsToReproduce,
    proofOfConcept: report.proofOfConcept,
    cwe: report.cwe,
    cvssScore: report.cvssScore,
    cvssVector: report.cvssVector,
    references: report.references,
    mitigation: report.mitigation,
    aiGenerated: report.aiGenerated,
    aiModel: report.aiModel,
    aiGeneratedAt: report.aiGeneratedAt?.toISOString() ?? null,
    bountyAmount: report.bountyAmount,
    currency: report.currency,
    platformReportUrl: report.platformReportUrl,
    platformReportId: report.platformReportId,
    submittedAt: report.submittedAt?.toISOString() ?? null,
    triagedAt: report.triagedAt?.toISOString() ?? null,
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    closedAt: report.closedAt?.toISOString() ?? null,
    version: report.version,
    createdBy: report.createdBy,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    evidenceIds,
  };
}
