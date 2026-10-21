import { basename } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { redactArgv } from './redact-argv.util.js';

export interface ScanCommandRecord {
  userId: string;
  workspaceId: string;
  jobId: string;
  target: { id: string; value: string };
  tool: string;
  stage: 'recon' | 'scan';
  profile: string | null;
  /// Binary path/name as configured.
  command: string;
  /// The argv that is about to run (redacted here, before it is stored).
  argv: string[];
}

/// One audit entry per external tool command the pipeline executes: who, which
/// workspace/job/target, which tool and stage, and the argv with secrets
/// removed. A failure to write the entry is logged but never stops a scan the
/// user is already authorized to run; the job log still has the command.
@Injectable()
export class ScanCommandAudit {
  private readonly logger = new Logger(ScanCommandAudit.name);

  constructor(private readonly auditService: AuditService) {}

  async record(entry: ScanCommandRecord): Promise<void> {
    try {
      await this.auditService.log({
        userId: entry.userId,
        type: 'SCAN_COMMAND_EXECUTED',
        ipAddress: 'worker',
        userAgent: 'vuln-pipeline',
        metadata: {
          workspaceId: entry.workspaceId,
          jobId: entry.jobId,
          targetId: entry.target.id,
          targetValue: entry.target.value,
          tool: entry.tool,
          stage: entry.stage,
          profile: entry.profile,
          binary: basename(entry.command),
          argv: redactArgv(entry.argv),
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to audit ${entry.tool} command for job ${entry.jobId}: ${String(error)}`);
    }
  }
}
