import { Inject, Injectable } from '@nestjs/common';
import {
  NOTES_REPOSITORY,
  type NotesRepository,
} from '../../notes/domain/repositories/notes.repository.interface.js';
import type { AiTool, AiToolContext } from './ai-tool.interface.js';

@Injectable()
export class SearchNotesTool implements AiTool {
  readonly name = 'search_notes' as const;
  readonly description =
    'Search project notes by keyword. Input: { query?: string, targetId?: string }.';

  constructor(
    @Inject(NOTES_REPOSITORY) private readonly notesRepository: NotesRepository,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: AiToolContext,
  ): Promise<Record<string, unknown>> {
    const query =
      typeof input.query === 'string' ? input.query.toLowerCase() : undefined;
    const targetId =
      typeof input.targetId === 'string' ? input.targetId : undefined;

    const notes = await this.notesRepository.list(context.projectId, targetId);
    const filtered = query
      ? notes.filter(
          (n) =>
            (n.title ?? '').toLowerCase().includes(query) ||
            n.content.toLowerCase().includes(query),
        )
      : notes;
    const limited = filtered.slice(0, 15);

    return {
      count: filtered.length,
      notes: limited.map((n) => ({
        id: n.id,
        title: n.title,
        excerpt: n.content.slice(0, 400),
      })),
    };
  }
}
