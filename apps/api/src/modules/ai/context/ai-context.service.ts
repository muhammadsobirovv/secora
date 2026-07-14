import { Inject, Injectable } from '@nestjs/common';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../../projects/domain/repositories/projects.repository.interface.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../../targets/domain/repositories/targets.repository.interface.js';
import {
  NOTES_REPOSITORY,
  type NotesRepository,
} from '../../notes/domain/repositories/notes.repository.interface.js';
import {
  EVIDENCE_REPOSITORY,
  type EvidenceRepository,
} from '../../evidence/domain/repositories/evidence.repository.interface.js';
import {
  ACTIVITY_REPOSITORY,
  type ActivityRepository,
} from '../../activity/domain/repositories/activity.repository.interface.js';
import {
  RECON_FINDINGS_REPOSITORY,
  type ReconFindingsRepository,
} from '../../recon/domain/repositories/recon-findings.repository.interface.js';
import {
  VULN_FINDINGS_REPOSITORY,
  type VulnFindingsRepository,
} from '../../vuln/domain/repositories/vuln-findings.repository.interface.js';
import {
  VULN_SCAN_TEMPLATES_REPOSITORY,
  type VulnScanTemplatesRepository,
} from '../../vuln/domain/repositories/vuln-scan-templates.repository.interface.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { HttpStatus } from '@nestjs/common';
import type { AiContextBundle } from './ai-context.types.js';

const NOTE_EXCERPT_LENGTH = 240;
const RECENT_FINDINGS_LIMIT = 8;
const RECENT_ACTIVITY_LIMIT = 15;

/// Gathers everything the AI needs to know about a project without the
/// user ever pasting it in (Automatic AI Context). Every method here is
/// read-only and workspace/project-scoped — see resolveWorkspaceAndProject
/// for the one shared authorization check every caller goes through
/// (Security: Workspace Isolation / Project Isolation).
@Injectable()
export class AiContextService {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    @Inject(NOTES_REPOSITORY) private readonly notesRepository: NotesRepository,
    @Inject(EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: EvidenceRepository,
    @Inject(ACTIVITY_REPOSITORY)
    private readonly activityRepository: ActivityRepository,
    @Inject(RECON_FINDINGS_REPOSITORY)
    private readonly reconFindingsRepository: ReconFindingsRepository,
    @Inject(VULN_FINDINGS_REPOSITORY)
    private readonly vulnFindingsRepository: VulnFindingsRepository,
    @Inject(VULN_SCAN_TEMPLATES_REPOSITORY)
    private readonly vulnScanTemplatesRepository: VulnScanTemplatesRepository,
  ) {}

  /// Resolves the caller's workspace (always their personal workspace,
  /// same pattern as every other module) and verifies projectId actually
  /// belongs to it — the one check standing between a conversation and
  /// cross-project/cross-workspace data leakage.
  async resolveWorkspaceAndProject(
    userId: string,
    projectId: string,
  ): Promise<{ workspaceId: string; projectId: string }> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(userId);
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const project = await this.projectsRepository.findByIdForWorkspace(
      projectId,
      workspace.id,
    );
    if (!project) {
      throw new AppException(
        'PROJECT_NOT_FOUND',
        'Project not found in this workspace.',
        HttpStatus.NOT_FOUND,
      );
    }
    return { workspaceId: workspace.id, projectId: project.id };
  }

  async buildContext(
    workspaceId: string,
    projectId: string,
  ): Promise<AiContextBundle> {
    const [
      workspace,
      project,
      targets,
      reconFindings,
      vulnFindings,
      notes,
      evidence,
      activity,
      templates,
    ] = await Promise.all([
      this.workspacesRepository.findById(workspaceId),
      this.projectsRepository.findById(projectId),
      this.targetsRepository.list({ projectId }),
      this.reconFindingsRepository.list({ workspaceId, projectId }),
      this.vulnFindingsRepository.list({ workspaceId, projectId, limit: 200 }),
      this.notesRepository.list(projectId),
      this.evidenceRepository.list(projectId),
      this.activityRepository.list({
        workspaceId,
        projectId,
        limit: RECENT_ACTIVITY_LIMIT,
      }),
      this.vulnScanTemplatesRepository.list(workspaceId),
    ]);

    const reconFindingCountsByType = countBy(reconFindings, (f) => f.type);
    const vulnFindingCountsBySeverity = countBy(
      vulnFindings,
      (f) => f.severity,
    );
    const vulnFindingCountsByStatus = countBy(vulnFindings, (f) => f.status);

    return {
      workspace: { id: workspaceId, name: workspace?.name ?? 'Workspace' },
      project: {
        id: projectId,
        name: project?.name ?? 'Project',
        status: project?.status ?? 'ACTIVE',
        description: project?.description ?? null,
      },
      targets: targets.map((t) => ({
        id: t.id,
        type: t.type,
        value: t.value,
        name: t.name,
        scopeStatus: t.scopeStatus,
        environment: t.environment,
      })),
      reconFindingCountsByType: Object.entries(reconFindingCountsByType).map(
        ([type, count]) => ({
          type,
          count,
        }),
      ),
      recentReconFindings: reconFindings
        .slice()
        .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
        .slice(0, RECENT_FINDINGS_LIMIT)
        .map((f) => ({
          id: f.id,
          type: f.type,
          value: f.value,
          source: f.source,
        })),
      vulnFindingCountsBySeverity,
      vulnFindingCountsByStatus,
      recentVulnFindings: vulnFindings
        .slice()
        .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
        .slice(0, RECENT_FINDINGS_LIMIT)
        .map((f) => ({
          id: f.id,
          title: f.title,
          severity: f.severity,
          status: f.status,
          cwe: f.cwe,
          owaspCategory: f.owaspCategory,
        })),
      notes: notes.slice(0, RECENT_FINDINGS_LIMIT).map((n) => ({
        id: n.id,
        title: n.title,
        excerpt: n.content.slice(0, NOTE_EXCERPT_LENGTH),
      })),
      evidenceSummary: evidence
        .slice(0, RECENT_FINDINGS_LIMIT)
        .map((e) => ({ type: e.type, title: e.title })),
      recentActivity: activity.map((a) => ({
        verb: a.verb,
        entityType: a.entityType,
        createdAt: a.createdAt.toISOString(),
      })),
      scanTemplates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        scanners: t.scanners,
      })),
      relevantMemory: [],
    };
  }
}

function countBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}
