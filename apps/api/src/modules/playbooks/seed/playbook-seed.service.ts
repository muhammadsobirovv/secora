import { Injectable, Logger } from '@nestjs/common';
import {
  PLAYBOOKS_REPOSITORY,
  type PlaybooksRepository,
} from '../domain/repositories/playbooks.repository.interface.js';
import { Inject } from '@nestjs/common';
import { BUILT_IN_PLAYBOOKS } from './built-in-playbooks.data.js';

/// Module 16 — Playbooks (task #389, spec section "8 INITIAL PLAYBOOKS").
///
/// `Playbook.workspaceId` is non-nullable (see schema.prisma) — there is
/// no cross-workspace "global playbook library" table in this schema, so
/// the 8 built-ins are seeded **lazily, per workspace**, the first time
/// that workspace's playbook list is requested (ListPlaybooksHandler calls
/// `ensureForWorkspace` before reading). This is idempotent: a workspace
/// that already has an `isBuiltIn: true` playbook with a given name is
/// skipped, so re-running it (e.g. on every list call) never creates
/// duplicates. Each seeded playbook is created already PUBLISHED (its
/// hand-authored graph is a fixed, reviewed linear chain, not user input),
/// so it is immediately executable/cloneable without a separate manual
/// publish step.
@Injectable()
export class PlaybookSeedService {
  private readonly logger = new Logger(PlaybookSeedService.name);

  constructor(@Inject(PLAYBOOKS_REPOSITORY) private readonly playbooksRepository: PlaybooksRepository) {}

  async ensureForWorkspace(workspaceId: string, userId: string): Promise<void> {
    const existing = await this.playbooksRepository.list({ workspaceId });
    const existingNames = new Set(existing.filter((p) => p.isBuiltIn).map((p) => p.name));

    for (const definition of BUILT_IN_PLAYBOOKS) {
      if (existingNames.has(definition.name)) continue;
      try {
        const playbook = await this.playbooksRepository.create({
          workspaceId,
          name: definition.name,
          description: definition.description,
          category: definition.category,
          isBuiltIn: true,
          createdBy: userId,
        });
        const version = await this.playbooksRepository.createVersion({
          playbookId: playbook.id,
          version: 1,
          graph: definition.graph,
          variables: [],
          createdBy: userId,
        });
        await this.playbooksRepository.publishVersion(version.id, { publishedBy: userId });
        await this.playbooksRepository.update(playbook.id, { status: 'PUBLISHED', currentVersionId: version.id });
      } catch (error: unknown) {
        // Seeding is best-effort — a failure here must never break the
        // caller's list request.
        this.logger.warn(`Failed to seed built-in playbook "${definition.name}": ${String(error)}`);
      }
    }
  }
}
