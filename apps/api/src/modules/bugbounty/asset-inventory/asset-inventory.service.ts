import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  AssetInventoryEntryDto,
  AssetInventoryQueryDto,
} from '@pentesthub/shared';
import type { ReconFinding, VulnFinding } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../../targets/domain/repositories/targets.repository.interface.js';
import {
  RECON_FINDINGS_REPOSITORY,
  type ReconFindingsRepository,
} from '../../recon/domain/repositories/recon-findings.repository.interface.js';
import {
  VULN_FINDINGS_REPOSITORY,
  type VulnFindingsRepository,
} from '../../vuln/domain/repositories/vuln-findings.repository.interface.js';
import {
  NOTES_REPOSITORY,
  type NotesRepository,
} from '../../notes/domain/repositories/notes.repository.interface.js';
import {
  EVIDENCE_REPOSITORY,
  type EvidenceRepository,
} from '../../evidence/domain/repositories/evidence.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import {
  classifyScopeValue,
  type ScopeRule,
} from '../scope/classify-scope-value.util.js';

const RISK_WEIGHTS: Record<string, number> = {
  CRITICAL: 25,
  HIGH: 10,
  MEDIUM: 4,
  LOW: 1,
  INFO: 0,
};

/// Read-through aggregation over Target (Module 2), ReconFinding (Module
/// 3), VulnFinding (Module 4), Note/Evidence (Module 2) — no
/// BugBountyAsset table exists (see the Module 6 schema section's
/// file-level comment). Every field here is derived at read time, so it's
/// always as fresh as its source module, never a stale copy.
@Injectable()
export class AssetInventoryService {
  constructor(
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    @Inject(RECON_FINDINGS_REPOSITORY)
    private readonly reconFindingsRepository: ReconFindingsRepository,
    @Inject(VULN_FINDINGS_REPOSITORY)
    private readonly vulnFindingsRepository: VulnFindingsRepository,
    @Inject(NOTES_REPOSITORY)
    private readonly notesRepository: NotesRepository,
    @Inject(EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: EvidenceRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
  ) {}

  async list(
    workspaceId: string,
    filter: AssetInventoryQueryDto,
  ): Promise<AssetInventoryEntryDto[]> {
    if (!filter.programId && !filter.projectId) {
      throw new AppException(
        'INVALID_REFERENCE',
        'Either programId or projectId is required for the asset inventory.',
        HttpStatus.BAD_REQUEST,
      );
    }

    let targetIds: string[];
    const projectIdForLookups: string | undefined = filter.projectId;
    let scopeRules: ScopeRule[] = [];

    if (filter.programId) {
      targetIds = await this.programsRepository.listLinkedTargetIds(
        filter.programId,
      );
      scopeRules = await this.programsRepository.listScopeItems(
        filter.programId,
      );
    } else {
      const targets = await this.targetsRepository.list({
        projectId: filter.projectId as string,
      });
      targetIds = targets.map((t) => t.id);
    }

    const entries = await Promise.all(
      targetIds.map((targetId) =>
        this.buildEntry(workspaceId, targetId, projectIdForLookups, scopeRules),
      ),
    );
    const nonNull = entries.filter(
      (e): e is AssetInventoryEntryDto => e !== null,
    );

    if (!filter.search) return nonNull;
    const search = filter.search.toLowerCase();
    return nonNull.filter(
      (e) =>
        e.value.toLowerCase().includes(search) ||
        (e.name?.toLowerCase().includes(search) ?? false),
    );
  }

  private async buildEntry(
    workspaceId: string,
    targetId: string,
    projectIdHint: string | undefined,
    scopeRules: ScopeRule[],
  ): Promise<AssetInventoryEntryDto | null> {
    const target = await this.targetsRepository.findById(targetId);
    if (!target) return null;
    const projectId = projectIdHint ?? target.projectId;

    const [reconFindings, vulnFindings, notes, evidence] = await Promise.all([
      this.reconFindingsRepository
        .list({ workspaceId, targetId })
        .catch((): ReconFinding[] => []),
      this.vulnFindingsRepository
        .list({ workspaceId, targetId, limit: 500 })
        .catch((): VulnFinding[] => []),
      this.notesRepository.list(projectId, targetId),
      this.evidenceRepository.list(projectId, targetId),
    ]);

    const technology = new Set<string>();
    const dns = new Set<string>();
    const openPorts = new Set<number>();
    const services = new Set<string>();
    let tlsSummary: string | null = null;
    let lastScanAt: Date | null = null;

    for (const finding of reconFindings) {
      if (
        finding.lastSeenAt &&
        (!lastScanAt || finding.lastSeenAt > lastScanAt)
      ) {
        lastScanAt = finding.lastSeenAt;
      }
      switch (finding.type) {
        case 'TECHNOLOGY':
          technology.add(finding.value);
          break;
        case 'DNS_RECORD':
          dns.add(finding.value);
          break;
        case 'OPEN_PORT': {
          const data = finding.data as { port?: number } | null;
          const port = data?.port ?? Number(finding.value.split(':').pop());
          if (Number.isFinite(port)) openPorts.add(port);
          break;
        }
        case 'SERVICE':
          services.add(finding.value);
          break;
        case 'CERTIFICATE':
          tlsSummary ??= finding.value;
          break;
        default:
          break;
      }
    }

    let criticalFindingsCount = 0;
    for (const vf of vulnFindings) {
      if (vf.severity === 'CRITICAL') criticalFindingsCount += 1;
      if (vf.lastSeenAt && (!lastScanAt || vf.lastSeenAt > lastScanAt)) {
        lastScanAt = vf.lastSeenAt;
      }
    }

    const riskScore = Math.min(
      100,
      vulnFindings.reduce(
        (sum, vf) => sum + (RISK_WEIGHTS[vf.severity] ?? 0),
        0,
      ),
    );

    const screenshotCount = evidence.filter(
      (e) => e.type === 'SCREENSHOT',
    ).length;

    const scopeMatch = scopeRules.length
      ? classifyScopeValue(target.value, scopeRules)
      : null;

    return {
      targetId: target.id,
      targetType: target.type,
      value: target.value,
      name: target.name,
      technology: [...technology],
      dns: [...dns],
      openPorts: [...openPorts].sort((a, b) => a - b),
      services: [...services],
      tlsSummary,
      findingsCount: vulnFindings.length,
      criticalFindingsCount,
      notesCount: notes.length,
      evidenceCount: evidence.length,
      screenshotCount,
      lastScanAt: lastScanAt?.toISOString() ?? null,
      ris