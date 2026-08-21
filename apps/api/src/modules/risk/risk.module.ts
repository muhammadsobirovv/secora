import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { BugBountyModule } from '../bugbounty/bugbounty.module.js';
import { AiCoreModule } from '../ai/ai-core.module.js';
import { RiskEngineV2Service } from './risk-engine-v2.service.js';
import { RiskController } from './controllers/risk.controller.js';

/// Module 17 — task #474/#475 (Risk Engine v2 + Risk prioritization).
/// Imports `BugBountyModule` solely to inject its exported
/// `RiskScoringService` (the v1 base formula this module layers on top
/// of, per `RiskEngineV2Service`'s doc comment) — one-directional,
/// `BugBountyModule` does not import this module back. Also imports
/// `AiCoreModule` (task #485 — AI Memory extension) so
/// `RiskEngineV2Service` can mirror each recorded `RiskFactorSnapshot`
/// into the existing RAG store.
@Module({
  imports: [WorkspacesModule, BugBountyModule, AiCoreModule],
  controllers: [RiskController],
  providers: [RiskEngineV2Service],
  exports: [RiskEngineV2Service],
})
export class RiskModule {}
