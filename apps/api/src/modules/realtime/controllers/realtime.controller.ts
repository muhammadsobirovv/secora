import { Body, Controller, HttpCode, HttpStatus, MessageEvent, Post, Query, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable, filter, map } from 'rxjs';
import type { RealtimeDomainEventDto, RealtimeEvent } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import { RealtimeHubService } from '../realtime-hub.service.js';
import { TypingSignalDto, WorkspaceScopedQueryParamsDto } from '../dto/realtime.dto.js';

function isTargetedNotification(event: RealtimeEvent): event is RealtimeDomainEventDto & { targetUserId: string } {
  return 'targetUserId' in event && !!event.targetUserId;
}

/// Module 16 — Real-time gateway (task #391). Matches
/// `REALTIME_ENDPOINTS` in packages/shared. Every endpoint takes an
/// explicit `workspaceId` (M9-style, not the implicit-personal-workspace
/// pattern) because real-time collaboration is inherently about acting
/// inside a *shared* workspace the caller may not own — same reasoning
/// `resolveWorkspaceMembership`'s own doc comment gives for Module 9's
/// Collaboration surface. Every endpoint re-validates membership before
/// doing anything, so a client can never subscribe to, or inject events
/// into, a workspace it doesn't belong to (never trust client-supplied
/// workspaceId for authorization — this only uses it to look up a real
/// `WorkspaceMember` row).
@ApiTags('realtime')
@ApiBearerAuth()
@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: RealtimeHubService,
  ) {}

  @Sse('stream')
  @ApiOperation({ summary: 'Live SSE stream of presence/typing/finding/job/comment/activity/notification events for one workspace' })
  async stream(
    @Query() query: WorkspaceScopedQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<Observable<MessageEvent>> {
    await resolveWorkspaceMembership(this.prisma, user.id, query.workspaceId);

    return this.hub.subscribe(query.workspaceId).asObservable().pipe(
      // A targeted event (currently only MentionCreatedEvent-derived
      // NOTIFICATION events) is only ever delivered down the mentioned
      // person's own connection — everything else is workspace-broadcast.
      filter((event) => !isTargetedNotification(event) || event.targetUserId === user.id),
      map((event): MessageEvent => ({ data: event })),
    );
  }

  @Post('typing')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Announce that you are typing on some entity (comment box, finding note, etc.)' })
  async typing(
    @Query() query: WorkspaceScopedQueryParamsDto,
    @Body() dto: TypingSignalDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await resolveWorkspaceMembership(this.prisma, user.id, query.workspaceId);
    const event: RealtimeEvent = {
      category: 'TYPING',
      workspaceId: query.workspaceId,
      userId: user.id,
      entityType: dto.entityType,
      entityId: dto.entityId,
      occurredAt: new Date().toISOString(),
    };
    this.hub.publish(query.workspaceId, event);
  }

  @Post('presence/heartbeat')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Announce you're online in this workspace (client should call periodically, e.g. every 30s)" })
  async presenceHeartbeat(
    @Query() query: WorkspaceScopedQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await resolveWorkspaceMembership(this.prisma, user.id, query.workspaceId);
    const event: RealtimeEvent = {
      category: 'PRESENCE',
      workspaceId: query.workspaceId,
      userId: user.id,
      status: 'ONLINE',
      occurredAt: new Date().toISOString(),
    };
    this.hub.publish(query.workspaceId, event);
  }
}
