import { Module } from '@nestjs/common';
import { UpsertDataRetentionPolicyHandler, DeleteDataRetentionPolicyHandler } from './commands/data-retention-policies.commands.js';
import { UpsertBackupPolicyHandler } from './commands/backup-policies.commands.js';
import { CreateComplianceExportRequestHandler } from './commands/compliance-exports.commands.js';
import {
  GetBackupPolicyHandler,
  GetComplianceExportRequestHandler,
  ListComplianceExportRequestsHandler,
  ListDataRetentionPoliciesHandler,
} from './queries/compliance.query.js';
import { DataRetentionEnforcerService } from './services/data-retention-enforcer.service.js';
import { BackupPolicyRunnerService } from './services/backup-policy-runner.service.js';
import { ComplianceExportProcessorService } from './services/compliance-export-processor.service.js';
import { ComplianceController } from './controllers/compliance.controller.js';

/// Module 10 — Compliance: `DataRetentionPolicy` + automatic enforcement
/// (`DataRetentionEnforcerService`), `BackupPolicy` + real snapshot
/// generation (`BackupPolicyRunnerService`), and `ComplianceExportRequest`
/// (GDPR/SOC2-style data export) + async processing
/// (`ComplianceExportProcessorService`). `STORAGE_SERVICE` (used by the
/// latter two) is provided by the `@Global()` `ProvidersModule` — no
/// explicit import needed here.
@Module({
  controllers: [ComplianceController],
  providers: [
    UpsertDataRetentionPolicyHandler,
    DeleteDataRetentionPolicyHandler,
    UpsertBackupPolicyHandler,
    CreateComplianceExportRequestHandler,
    ListDataRetentionPoliciesHandler,
    GetBackupPolicyHandler,
    ListComplianceExportRequestsHandler,
    GetComplianceExportRequestHandler,
    DataRetentionEnforcerService,
    BackupPolicyRunnerService,
    ComplianceExportProcessorService,
  ],
})
export class ComplianceModule {}
