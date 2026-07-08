import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { AttachableType, AttachmentDto } from '@pentesthub/shared';
import { STORAGE_SERVICE } from '../../../common/providers/tokens.js';
import type { StorageService } from '../../../common/providers/storage/storage-service.interface.js';
import {
  ATTACHMENTS_REPOSITORY,
  type AttachmentsRepository,
} from '../domain/repositories/attachments.repository.interface.js';
import { toAttachmentDto } from '../mappers/to-attachment-dto.mapper.js';

export class ListAttachmentsQuery implements IQuery {
  constructor(
    public readonly attachableType: AttachableType,
    public readonly attachableId: string,
  ) {}
}

@QueryHandler(ListAttachmentsQuery)
export class ListAttachmentsHandler implements IQueryHandler<
  ListAttachmentsQuery,
  AttachmentDto[]
> {
  constructor(
    @Inject(ATTACHMENTS_REPOSITORY)
    private readonly attachmentsRepository: AttachmentsRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
  ) {}

  async execute(query: ListAttachmentsQuery): Promise<AttachmentDto[]> {
    const attachments = await this.attachmentsRepository.list(
      query.attachableType,
      query.attachableId,
    );
    return Promise.all(
      attachments.map(async (attachment) => {
        const url = await this.storageService.getUrl(attachment.storageKey);
        return toAttachmentDto(attachment, url);
      }),
    );
  }
}
