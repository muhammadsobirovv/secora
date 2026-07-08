import type { AttachmentDto } from '@pentesthub/shared';
import type { Attachment } from '../../../prisma-types.js';

export function toAttachmentDto(
  attachment: Attachment,
  url: string,
): AttachmentDto {
  return {
    id: attachment.id,
    workspaceId: attachment.workspaceId,
    attachableType: attachment.attachableType,
    attachableId: attachment.attachableId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    url,
    uploadedBy: attachment.uploadedBy,
    createdAt: attachment.createdAt.toISOString(),
  };
}
