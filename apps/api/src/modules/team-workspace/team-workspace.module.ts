import { Module } from '@nestjs/common';
import {
  CreateInternalChatChannelHandler,
  CreateWikiPageHandler,
  DecideReviewQueueItemHandler,
  DeleteWikiPageHandler,
  SendInternalChatMessageHandler,
  SubmitReviewQueueItemHandler,
  UpdateWikiPageHandler,
} from './commands/team-workspace.commands.js';
import {
  GetWikiPageHandler,
  ListInternalChatChannelsHandler,
  ListInternalChatMessagesHandler,
  ListReviewQueueItemsHandler,
  ListWikiPagesHandler,
} from './queries/team-workspace.query.js';
import { TeamWorkspaceController } from './controllers/team-workspace.controller.js';

const COMMAND_HANDLERS = [
  CreateWikiPageHandler,
  UpdateWikiPageHandler,
  DeleteWikiPageHandler,
  SubmitReviewQueueItemHandler,
  DecideReviewQueueItemHandler,
  CreateInternalChatChannelHandler,
  SendInternalChatMessageHandler,
];

const QUERY_HANDLERS = [
  ListWikiPagesHandler,
  GetWikiPageHandler,
  ListReviewQueueItemsHandler,
  ListInternalChatChannelsHandler,
  ListInternalChatMessagesHandler,
];

/// Module 10 — Team Workspace: internal wiki, lightweight review/approval
/// queue, and async internal team chat, layered on top of Module 9's
/// `Workspace`/`WorkspaceMember`/`resolveWorkspaceMembership` (reused
/// unmodified, not duplicated) — the same authorization primitive every
/// Collaboration endpoint already uses, extended here rather than
/// building a parallel workspace-membership concept.
@Module({
  controllers: [TeamWorkspaceController],
  providers: [...COMMAND_HANDLERS, ...QUERY_HANDLERS],
})
export class TeamWorkspaceModule {}
