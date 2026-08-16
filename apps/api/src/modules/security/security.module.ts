import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ScopeEngineService } from './scope-engine.service.js';
import { SecurityApprovalService } from './security-approval.service.js';
import { GlobalSecurityPolicyService } from './global-security-policy.service.js';
import { SecurityController } from './controllers/security.controller.js';

/// Module 16 — the cross-cutting security core every tool-execution
/// surface (Recon, Vuln, Terminal, AI Investigation) depends on: Scope
/// Engine (task #370), Approval Gates (task #399), Global Security Policy
/// (task #400). Exported so RECON/VULN/agent modules can inject
/// `ScopeEngineService` without a circular module dependency. Imports
/// WorkspacesModule so SecurityController can resolve the caller's
/// workspace from userId instead of trusting a client-supplied
/// workspaceId (see that controller's doc comment).
@Module({
  imports: [AuditModule, WorkspacesModule],
  controllers: [SecurityController],
  providers: [ScopeEngineService, SecurityApprovalService, GlobalSecurityPolicyService],
  exports: [ScopeEngineService, SecurityApprovalService, GlobalSecurityPolicyService],
})
export class SecurityModule {}
