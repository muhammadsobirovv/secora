import type { AttachableType, Attachment } from '../../../../prisma-types.js';

export interface CreateAttachmentInput {
  workspaceId: string;
  attachableType: AttachableType;
  attachableId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedBy: string;
}

/// Polymorphic — attachableId has no DB-level FK (see
/// docs/adr/0002-workspace-foundation-module.md, Decision 3). The parent's
/// existence is validated by the command handler before this repository
/// is ever called, using the relevant parent module's own repository.
export interface AttachmentsRepository {
  create(input: CreateAttachmentInput): Promise<Attachment>;
  findById(id: string): Promise<Attachment | null>;
  softDelete(id: string): Promise<Attachment>;
  list(
    attachableType: AttachableType,
    attachableId: string,
  ): Promise<Attachment[]>;
}

export const ATTACHMENTS_REPOSITORY = Symbol('ATTACHMENTS_REPOSITORY');
