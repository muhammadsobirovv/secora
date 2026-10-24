import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { REQUIRED_TOOLS, ToolPreflight, type ToolCheck } from './tool-preflight.js';

const REFRESH_MS = 5 * 60_000;

/// The worker's tool preflight: one shared cache for every spawn, a table in
/// the boot log, and a row in `worker_tool_status` that the admin endpoint
/// reads (the API process has no tools of its own, only the worker does).
@Injectable()
export class ToolPreflightService extends ToolPreflight {
  private readonly logger = new Logger(ToolPreflightService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  /// Every pipeline tool with the command this deployment configured for it.
  commands(): { tool: string; command: string }[] {
    return REQUIRED_TOOLS.map((tool) => ({
      tool,
      command: this.configService.get(`VULN_TOOL_BIN_${tool.toUpperCase()}` as 'VULN_TOOL_BIN_HTTPX', { infer: true }),
    }));
  }

  async checkAll(): Promise<ToolCheck[]> {
    return Promise.all(this.commands().map(({ command }) => this.check(command)));
  }

  /// Boot: check everything, print the table, publish it, keep it fresh.
  async start(workerName: string): Promise<ToolCheck[]> {
    const checks = await this.report(workerName);
    this.timer = setInterval(() => void this.report(workerName).catch(() => undefined), REFRESH_MS);
    this.timer.unref();
    return checks;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async report(workerName: string): Promise<ToolCheck[]> {
    const checks = await this.checkAll();
    this.logger.log(`Tool preflight:\n${formatToolTable(checks)}`);
    const missing = checks.filter((c) => c.status !== 'OK');
    if (missing.length > 0) {
      this.logger.error(`${missing.length} pipeline tool(s) cannot run on this worker: ${missing.map((c) => c.tool).join(', ')}. Scans that need them will fail those stages.`);
    }
    try {
      await this.prisma.workerToolStatus.upsert({
        where: { workerName },
        create: { workerName, checkedAt: new Date(), tools: checks as never },
        update: { checkedAt: new Date(), tools: checks as never },
      });
    } catch (error) {
      this.logger.warn(`Could not publish the tool status: ${String(error)}`);
    }
    return checks;
  }
}

export function formatToolTable(checks: ToolCheck[]): string {
  const width = Math.max(...checks.map((c) => c.tool.length), 4);
  return checks
    .map((c) => `  ${c.tool.padEnd(width)}  ${c.status.padEnd(14)}  ${c.detail}  (${c.command})`)
    .join('\n');
}
