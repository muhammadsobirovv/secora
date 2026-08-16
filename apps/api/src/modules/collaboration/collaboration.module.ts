import { Module } from '@nestjs/common';

// Invites / members
import {
  AcceptWorkspaceInviteHandler,
  CreateWorkspaceInviteHandler,
  RemoveWorkspaceMemberHandler,
  RevokeWorkspaceInviteHandler,
  UpdateWorkspaceMemberRoleHandler,
} from './commands/workspace-invites.commands.js';
import { ListWorkspaceInvitesHandler } from './queries/workspace-invites.query.js';

// Comments / mentions
import {
  CreateCommentHandler,
  DeleteCommentHandler,
  MarkMentionReadHandler,
  UpdateCommentHandler,
} from './commands/comments.commands.js';
import { ListCommentsHandler, ListMentionsHandler } from './queries/comments.query.js';

// Assignments
import {
  CreateAssignmentHandler,
  DeleteAssignmentHandler,
  UpdateAssignmentHandler,
} from './commands/assignments.commands.js';
import { ListAssignmentsHandler } from './queries/assignments.query.js';

// Task items
import {
  CreateTaskItemHandler,
  DeleteTaskItemHandler,
  UpdateTaskItemHandler,
} from './commands/task-items.commands.js';
import { ListTaskItemsHandler } from './queries/task-items.query.js';

// Activity feed
import { ListActivityFeedHandler } from './queries/activity-feed.query.js';

// Watchers / Reactions (Module 16, task #390)
import { ToggleWatcherHandler } from './commands/watchers.commands.js';
import { ToggleReactionHandler } from './commands/reactions.commands.js';
import {
  GetMyWatchStateHandler,
  ListReactionsHandler,
  ListWatchersHandler,
} from './queries/watchers-reactions.query.js';

// Controllers
import { WorkspaceMembersController } from './controllers/workspace-members.controller.js';
import { CommentsController, MentionsController } from './controllers/comments.controller.js';
import { AssignmentsController } from './controllers/assignments.controller.js';
import { TaskItemsController } from './controllers/task-items.controller.js';
import { ActivityFeedController } from './controllers/activity-feed.controller.js';
import { ReactionsController, WatchersController } from './controllers/watchers-reactions.controller.js';

const COMMAND_HANDLERS = [
  CreateWorkspaceInviteHandler,
  RevokeWorkspaceInviteHandler,
  AcceptWorkspaceInviteHandler,
  UpdateWorkspaceMemberRoleHandler,
  RemoveWorkspaceMemberHandler,
  CreateCommentHandler,
  UpdateCommentHandler,
  DeleteCommentHandler,
  MarkMentionReadHandler,
  CreateAssignmentHandler,
  UpdateAssignmentHandler,
  DeleteAssignmentHandler,
  CreateTaskItemHandler,
  UpdateTaskItemHandler,
  DeleteTaskItemHandler,
  ToggleWatcherHandler,
  ToggleReactionHandler,
];

const QUERY_HANDLERS = [
  ListWorkspaceInvitesHandler,
  ListCommentsHandler,
  ListMentionsHandler,
  ListAssignmentsHandler,
  ListTaskItemsHandler,
  ListActivityFeedHandler,
  ListWatchersHandler,
  GetMyWatchStateHandler,
  ListReactionsHandler,
];

/// Module 9's Collaboration surface — Invite Members, Roles (Reviewer/
/// Triager/Manager/Admin/Owner), Comments, Mentions, Assignments, Task
/// Lists, Activity Feed (read-through, no new storage), Audit Trail
/// (existing AuditEvent + the new WORKSPACE_MEMBER_*/API_KEY_*/
/// WEBHOOK_TOKEN_* AuditEventType values). See docs/adr/
/// 0009-bug-bounty-operating-system.md for why this module's command/
/// query handlers inject PrismaService directly instead of going through
/// a repository-interface layer like Modules 1-6 — a deliberate,
/// disclosed scope decision for Module 9's ~10 new straightforward
/// workspace-scoped entities, not an oversight. No `imports` needed
/// beyond Nest's defaults: PrismaModule is `@Global()` (see prisma.module.ts).
@Module({
  controllers: [
    WorkspaceMembersController,
    CommentsController,
    MentionsController,
    AssignmentsController,
    TaskItemsController,
    ActivityFeedController,
    WatchersController,
    ReactionsController,
  ],
  providers: [...COMMAND_HANDLERS, ...QUERY_HANDLERS],
})
export class CollaborationModule {}
