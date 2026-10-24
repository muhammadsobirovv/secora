import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { ToolCheck } from '../pipeline/tool-preflight.js';

/// A worker that has not reported for this long is shown as stale (it checks
/// every five minutes).
const STALE_AFTER_MS = 12 * 60_000;

export interface WorkerToolsDto {
  workerName: string;
  checkedAt: string;
  stale: boolean;
  /// True only when every pipeline tool is present, executable and answers its
  /// version flag.
  healthy: boolean;
  tools: ToolCheck[];
}

/// What each worker found when it checked its own tools. The API process has no
/// tools of its own, so this reads what the workers published.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/worker-tools')
@Roles('ADMIN')
export class WorkerToolsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Pentest tool preflight per worker (platform operator only)' })
  async list(): Promise<WorkerToolsDto[]> {
    const rows = await this.prisma.workerToolStatus.findMany({ orderBy: { workerName: 'asc' } });
    return rows.map((row) => {
      const tools = row.tools as unknown as ToolCheck[];
      return {
        workerName: row.workerName,
        checkedAt: row.checkedAt.toISOString(),
        stale: Date.now() - row.checkedAt.getTime() > STALE_AFTER_MS,
        healthy: tools.length > 0 && tools.every((tool) => tool.status === 'OK'),
        tools,
      };
    });
  }
}
