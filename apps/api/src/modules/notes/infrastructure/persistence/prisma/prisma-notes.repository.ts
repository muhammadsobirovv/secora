import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateNoteInput,
  NotesRepository,
  UpdateNoteInput,
} from '../../../domain/repositories/notes.repository.interface.js';
import type { Note } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaNotesRepository implements NotesRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateNoteInput): Promise<Note> {
    return this.txHost.tx.note.create({ data: input });
  }

  findById(id: string): Promise<Note | null> {
    return this.txHost.tx.note.findFirst({ where: { id, deletedAt: null } });
  }

  update(id: string, data: UpdateNoteInput): Promise<Note> {
    return this.txHost.tx.note.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<Note> {
    return this.txHost.tx.note.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  list(projectId: string, targetId?: string): Promise<Note[]> {
    return this.txHost.tx.note.findMany({
      where: {
        projectId,
        deletedAt: null,
        ...(targetId ? { targetId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
