import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  AttachmentsRepository,
  CreateAttachmentInput,
} from '../../../domain/repositories/attachments.repository.interface.js';
import type {
  AttachableType,
  Attachment,
} from '../../../../../prisma-types.js';

@Injectable()
export class PrismaAttachmentsRepository implements AttachmentsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateAttachmentInput): Promise<Attachment> {
    return this.txHost.tx.attachment.create({ data: input });
  }

  findById(id: string): Promise<Attachment | null> {
    return this.txHost.tx.attachment.findFirst({
      where: { id, deletedAt: null },
    });
  }

  softDelete(id: string): Promise<Attachment> {
    return this.txHost.tx.attachment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  list(
    attachableType: AttachableType,
    attachableId: string,
  ): Promise<Attachment[]> {
    return this.txHost.tx.attachment.findMany({
      where: { attachableType, attachableId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }
}
