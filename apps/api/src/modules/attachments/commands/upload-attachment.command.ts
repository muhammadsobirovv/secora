import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { createHash } from 'node:crypto';
import type { AttachableType, AttachmentDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { STORAGE_SERVICE } from '../../../common/providers/tokens.js';
import type { StorageService } from '../../../common/providers/storage/storage-service.interface.js';
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
  ATTACHMENTS_REPOSITORY,
  type AttachmentsRepository,
} from '../domain/repositories/attachments.repository.interface.js';
import { toAttachmentDto } from '../mappers/to-attachment-dto.mapper.js';
import { AttachmentUploadedEvent } from '../events/attachment-events.js';

export class UploadAttachmentCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly attachableType: AttachableType,
    public readonly attachableId: string,
    public readonly fileName: string,
    public readonly mimeType: string,
    public readonly fileBuffer: Buffer,
  ) {}
}

/// The one module allowed many "sibling" repository imports (Projects/
/// Targets/Notes/Evidence) — it exists specifically to attach files to
/// each of them, so validating "does this parent exist in my workspace"
/// per attachableType is its core job, not a boundary violation. None of
/// those four ever import Attachments back, so there's no cycle. See
/// docs/adr/0002-workspace-foundation-module.md, Decision 6 (refined).
@CommandHandler(UploadAttachmentCommand)
export class UploadAttachmentHandler implements ICommandHandler<
  UploadAttachmentCommand,
  AttachmentDto
> {
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
    @Inject(ATTACHMENTS_REPOSITORY)
    private readonly attachmentsRepository: AttachmentsRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
    private readonly eventBus: EventBus,
  ) {}

  // Publishing the event from *inside* a @Transactional() method is a
  // trap: @nestjs/cqrs's EventBus.publish() doesn't await handler
  // completion, so a downstream handler that itself uses the ambient
  // transaction (ActivityRecordingHandler does, via txHost.tx) can run
  // after this method's transaction has already committed and closed —
  // observed live as `P2028: Transaction already closed`, not a
  // hypothetical. Fixed by keeping the DB writes in a private
  // @Transactional() method and only publishing after it has fully
  // resolved, from this non-transactional execute() — by then the
  // transaction is committed for real and the event handler's txHost.tx
  // just resolves to the regular (non-transactional) client.
  async execute(command: UploadAttachmentCommand): Promise<AttachmentDto> {
    const { workspaceId, projectId, attachment, url } =
      await this.writeAttachment(command);

    this.eventBus.publish(
      new AttachmentUploadedEvent(
        workspaceId,
        projectId,
        command.userId,
        attachment.id,
        {
          attachableType: command.attachableType,
          fileName: command.fileName,
        },
      ),
    );

    return toAttachmentDto(attachment, url);
  }

  @Transactional()
  private async writeAttachment(command: UploadAttachmentCommand) {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        command.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const projectId = await this.resolveProjectId(
      command.attachableType,
      command.attachableId,
      workspace.id,
    );

    // Module 18 — task #513 (file/storage security audit). Was
    // `${Date.now()}-${command.fileName}` — the client-supplied
    // `originalname` went straight into the storage key with zero
    // sanitization. `LocalDiskStorageService` resolves that key via
    // `join(STORAGE_DIR, key)`, and Node's `path.join` normalizes `..`
    // segments across the *whole* joined string rather than confining
    // them to the caller-supplied portion — a filename like
    // `../../../../etc/cron.d/evil` (or a Windows-deployment equivalent)
    // could write outside `.storage/` entirely. Strip the filename down to
    // its safe basename (no path separators, no leading dots) before it
    // ever reaches a storage key; the *original* name the user typed is
    // still preserved verbatim in the `fileName` column below for display/
    // download purposes — only the on-disk/S3 key changes.
    const safeFileNameSegment = command.fileName
      .replace(/[/\\]/g, '_')
      .replace(/^\.+/, '_')
      .slice(-200) || 'file';
    const key = `workspaces/${workspace.id}/${command.attachableType.toLowerCase()}/${command.attachableId}/${Date.now()}-${safeFileNameSegment}`;
    const { url } = await this.storageService.upload(
      key,
      command.fileBuffer,
      command.mimeType,
    );

    const attachment = await this.attachmentsRepository.create({
      workspaceId: workspace.id,
      attachableType: command.attachableType,
      attachableId: command.attachableId,
      fileName: command.fileName,
      mimeType: command.mimeType,
      sizeBytes: command.fileBuffer.byteLength,
      storageKey: key,
      uploadedBy: command.userId,
    });

    if (command.attachableType === 'EVIDENCE') {
      const checksum = createHash('sha256')
        .update(command.fileBuffer)
        .digest('hex');
      await this.evidenceRepository.update(command.attachableId, { checksum });
    }

    return { workspaceId: workspace.id, projectId, attachment, url };
  }

  private async resolveProjectId(
    attachableType: AttachableType,
    attachableId: string,
    workspaceId: string,
  ): Promise<string | null> {
    switch (attachableType) {
      case 'WORKSPACE':
        return null;
      case 'PROJECT': {
        const project = await this.projectsRepository.findByIdForWorkspace(
          attachableId,
          workspaceId,
        );
        if (!project) {
          throw new AppException(
            'PROJECT_NOT_FOUND',
            'Project not found.',
            HttpStatus.NOT_FOUND,
          );
        }
        return project.id;
      }
      case 'TARGET': {
        const target = await this.targetsRepository.findById(attachableId);
        if (
          !target ||
          !(await this.belongsToWorkspace(target.projectId, workspaceId))
        ) {
          throw new AppException(
            'TARGET_NOT_FOUND',
            'Target not found.',
            HttpStatus.NOT_FOUND,
          );
        }
        return target.projectId;
      }
      case 'NOTE': {
        const note = await this.notesRepository.findById(attachableId);
        if (
          !note ||
          !(await this.belongsToWorkspace(note.projectId, workspaceId))
        ) {
          throw new AppException(
            'NOTE_NOT_FOUND',
            'Note not found.',
            HttpStatus.NOT_FOUND,
          );
        }
        return note.projectId;
      }
      case 'EVIDENCE': {
        const evidence = await this.evidenceRepository.findById(attachableId);
        if (
          !evidence ||
          !(await this.belongsToWorkspace(evidence.projectId, workspaceId))
        ) {
          throw new AppException(
            'EVIDENCE_NOT_FOUND',
            'Evidence not found.',
            HttpStatus.NOT_FOUND,
          );
        }
        return evidence.projectId;
      }
      // Module 6 (Bug Bounty Workspace) enum additions — reserved for
      // future attachment support on Knowledge Base Notes / Bug Reports.
      // No Module 6 command uploads through this handler with these types
      // yet, so there's no existence/workspace-ownership check to perform
      // here; deliberately not importing KnowledgeBaseRepository/
      // BugReportsRepository into this module to avoid a Attachments <->
      // Bugbounty circular dependency (see this class's file-level
      // comment). Treated like WORKSPACE: no project scope.
      case 'KNOWLEDGE_BASE_NOTE':
      case 'BUG_REPORT':
        return null;
      // Module 17 -- Incident evidence (task #470/#14) enum addition --
      // same reserved posture as KNOWLEDGE_BASE_NOTE/BUG_REPORT above: no
      // command uploads through this handler with this type yet, and
      // avoiding an Attachments <-> Incidents circular dependency.
      case 'INCIDENT':
        return null;
    }
  }

  private async belongsToWorkspace(
    projectId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const project = await this.projectsRepository.findByIdForWorkspace(
      projectId,
      workspaceId,
    );
    return project !== null;
  }
}
