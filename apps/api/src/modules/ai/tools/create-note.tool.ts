import { Inject, Injectable } from '@nestjs/common';
import {
  NOTES_REPOSITORY,
  type NotesRepository,
} from '../../notes/domain/repositories/notes.repository.interface.js';
import type { AiTool, AiToolContext } from './ai-tool.interface.js';

@Injectable()
export class CreateNoteTool implements AiTool {
  readonly name = 'create_note' as const;
  readonly description =
    'Create a new project note with the given title and content — use this when the user asks you to save/note something down. Input: { title?: string, content: string, targetId?: string }.';

  constructor(
    @Inject(NOTES_REPOSITORY) private readonly notesRepository: NotesRepository,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: AiToolContext,
  ): Promise<Record<string, unknown>> {
    const content = typeof input.content === 'string' ? input.content : '';
    if (!content.trim()) {
      return { error: 'content is required and cannot be empty' };
    }
    const title = typeof input.title === 'string' ? input.title : undefined;
    const targetId =
      typeof input.targetId === 'string' ? input.targetId : undefined;

    const note = await this.notesRepository.create({
      projectId: context.projectId,
      targetId,
      title,
      content,
      authorId: context.userId,
    });

    return {
      id: note.id,
      title: note.title,
      createdAt: note.createdAt.toISOString(),
    };
  }
}
