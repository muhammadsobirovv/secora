import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { Public } from '../../../common/decorators/public.decorator.js';

/// Module 10 — Observability. Standard liveness/readiness split for
/// container orchestration (Kubernetes, Docker Compose healthchecks,
/// ECS, etc.):
///  - `/observability/health` (liveness) — "is the process up and able
///    to respond at all", never touches the database. A crash-looping
///    process should fail this so the orchestrator restarts it; a
///    process that's merely waiting on a slow DB should NOT fail this
///    (that's what readiness is for) — conflating the two is the classic
///    "liveness probe restarts pods during a slow dependency" bootloop.
///  - `/observability/health/ready` (readiness) — "can this instance
///    actually serve traffic right now", verified with a real `SELECT 1`
///    against Postgres via Prisma. An instance that's up but can't reach
///    its database should be pulled out of the load balancer's rotation
///    (readiness fails) without being killed (liveness still passes).
@ApiTags('observability')
@Controller('observability/health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe — process is up' })
  liveness(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: process.uptime() };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — database is reachable' })
  async readiness(@Res() res: Response): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      res.status(HttpStatus.OK).json({ status: 'ok', checks: { database: 'ok' } });
    } catch (error) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'unavailable',
        checks: { database: 'failed' },
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
