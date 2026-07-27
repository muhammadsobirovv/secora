import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { ReconJobDto, ReconTool } from '@pentesthub/shared';
import { CreateReconJobCommand } from '../../recon/commands/create-recon-job.command.js';
import type { AiTool, AiToolContext } from './ai-tool.interface.js';

/// Mirrors CreateReconJobRequestDto's own valid values (packages/shared/
/// src/recon.ts ReconTool union) — duplicated as a runtime array here
/// since the model's tool-call JSON isn't type-checked, unlike an HTTP
/// DTO that goes through class-validator first.
const VALID_RECON_TOOLS: ReconTool[] = [
  'NMAP',
  'SUBFINDER',
  'HTTPX',
  'DNSX',
  'NAABU',
  'WHATWEB',
  'ASSETFINDER',
  'GOWITNESS',
  'AMASS',
  'KATANA',
  'GAU',
  'WAYBACKURLS',
  'WHOIS',
  'ASN',
];

/// Module 11 — Autonomous Reconnaissance (task #228). Lets the RECON
/// agent (and the Master Orchestrator's WORKFLOW_COORDINATOR, when it
/// delegates to RECON) actually kick off a new Module 3 ReconJob instead
/// of only reading already-collected data (search_recon_data). Dispatches
/// the exact same CreateReconJobCommand a human clicking "New Scan" in
/// the UI would (see TargetReconJobsController) — CommandBus is already
/// wired app-wide (ReconModule is imported in app.module.ts), so no
/// module-import changes were needed to reach it from here.
///
/// Deliberately does NOT poll the job to completion — starting a scan and
/// observing its result are two different AgentTasks in an
/// OrchestrationRun's plan (a WORKFLOW_COORDINATOR step for "start recon"
/// followed by a later step that calls search_recon_data once enough
/// time/polling has happened), keeping this tool's execution time
/// bounded and predictable rather than blocking an agent's tool-call loop
/// for the minutes a real scan can take.
@Injectable()
export class StartReconScanTool implements AiTool {
  readonly name = 'start_recon_scan' as const;
  readonly description = `Starts a new autonomous reconnaissance scan (Module 3 ReconJob) against a target. Input: { targetId: string, tools: string[] }. Valid tools: ${VALID_RECON_TOOLS.join(', ')}. Does not wait for the scan to finish — call search_recon_data later to review results once the job completes.`;

  constructor(private readonly commandBus: CommandBus) {}

  async execute(
    input: Record<string, unknown>,
    context: AiToolContext,
  ): Promise<Record<string, unknown>> {
    const targetId = typeof input.targetId === 'string' ? input.targetId : null;
    if (!targetId) {
      return { error: 'targetId (string) is required.' };
    }

    const requested = Array.isArray(input.tools)
      ? input.tools.filter((t): t is string => typeof t === 'string').map((t) => t.toUpperCase())
      : [];
    const tools = requested.filter((t): t is ReconTool =>
      (VALID_RECON_TOOLS as string[]).includes(t),
    );
    if (tools.length === 0) {
      return {
        error: `No valid recon tools supplied. Valid tools: ${VALID_RECON_TOOLS.join(', ')}.`,
      };
    }

    const job = (await this.commandBus.execute(
      new CreateReconJobCommand(context.userId, targetId, { tools }),
    )) as ReconJobDto;

    return {
      jobId: job.id,
      status: job.status,
      tools: job.tools,
      targetId,
      message: `Recon scan started (${tools.join(', ')}), job id ${job.id}. It runs asynchronously — check back with search_recon_data once it has had time to complete.`,
    };
  }
}
