import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ACTIVITY_REPOSITORY } from './domain/repositories/activity.repository.interface.js';
import { PrismaActivityRepository } from './infrastructure/persistence/prisma/prisma-activity.repository.js';
import { ActivityRecordingHandler } from './event-handlers/activity-recording.handler.js';
import { ListActivityHandler } from './queries/list-activity.query.js';
import { ActivityController } from './controllers/activity.controller.js';

@Module({
  imports: [WorkspacesModule],
  controllers: [ActivityController],
  providers: [
    { provide: ACTIVITY_REPOSITORY, useClass: PrismaActivityRepository },
    ActivityRecordingHandler,
    ListActivityHandler,
  ],
  exports: [ACTIVITY_REPOSITORY],
})
export class ActivityModule {}
