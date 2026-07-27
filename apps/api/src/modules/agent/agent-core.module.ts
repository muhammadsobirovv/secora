import { Module } from '@nestjs/common';
import { AiCoreModule } from '../ai/ai-core.module.js';
import { ReconAgent } from './agents/recon.agent.js';
import { WebAgent } from './agents/web.agent.js';
import { ApiAgent } from './agents/api.agent.js';
import { MobileAgent } from './agents/mobile.agent.js';
import { CloudAgent } from './agents/cloud.agent.js';
import { ActiveDirectoryAgent } from './agents/active-directory.agent.js';
import { AiResearchAgent } from './agents/ai-research.agent.js';
import { ExploitAnalysisAgent } from './agents/exploit-analysis.agent.js';
import { ReportWriterAgent } from './agents/report-writer.agent.js';
import { CodeReviewAgent } from './agents/code-review.agent.js';
import { RiskAssessmentAgent } from './agents/risk-assessment.agent.js';
import { WorkflowCoordinatorAgent } from './agents/workflow-coordinator.agent.js';
import { AgentRegistryService } from './agents/agent-registry.service.js';
import { AGENT_ORCHESTRATION_REPOSITORY } from './domain/repositories/agent-orchestration.repository.interface.js';
import { PrismaAgentOrchestrationRepository } from './infrastructure/persistence/prisma/prisma-agent-orchestration.repository.js';
import { AgentOrchestrationStreamHubService } from './orchestrator/agent-orchestration-stream-hub.service.js';
import { AgentOrchestratorService } from './orchestrator/agent-orchestrator.service.js';
import { ReasoningEngineService } from './reasoning/reasoning-engine.service.js';
import { KNOWLEDGE_BASE_REFERENCE_REPOSITORY } from './domain/repositories/knowledge-base-reference.repository.interface.js';
import { PrismaKnowledgeBaseReferenceRepository } from './infrastructure/persistence/prisma/prisma-knowledge-base-reference.repository.js';
import { KnowledgeBaseReferenceService } from './knowledge-base/knowledge-base-reference.service.js';
import { AgentExplainabilityService } from './explainability/agent-explainability.service.js';

/// Module 11 — AI Security Copilot + Autonomous Multi-Agent System. Mirrors
/// AiCoreModule/VulnCoreModule's "core module with no controllers" shape:
/// the twelve specialist agents, AgentRegistryService, the OrchestrationRun/
/// AgentTask persistence layer, and AgentOrchestratorService — everything
/// AgentModule (task #236, controllers + Swagger + events) builds on.
/// Importing AiCoreModule rather than duplicating provider wiring — every
/// agent (and the orchestrator's own planning call) depends on
/// AiProviderRegistryService/AiMemoryService, exactly the same seam
/// BugBountyAiAssistantService and AiChatService already use.
@Module({
  imports: [AiCoreModule],
  providers: [
    ReconAgent,
    WebAgent,
    ApiAgent,
    MobileAgent,
    CloudAgent,
    ActiveDirectoryAgent,
    AiResearchAgent,
    ExploitAnalysisAgent,
    ReportWriterAgent,
    CodeReviewAgent,
    RiskAssessmentAgent,
    WorkflowCoordinatorAgent,
    AgentRegistryService,

    {
      provide: AGENT_ORCHESTRATION_REPOSITORY,
      useClass: PrismaAgentOrchestrationRepository,
    },
    AgentOrchestrationStreamHubService,
    ReasoningEngineService,
    AgentOrchestratorService,

    {
      provide: KNOWLEDGE_BASE_REFERENCE_REPOSITORY,
      useClass: PrismaKnowledgeBaseReferenceRepository,
    },
    KnowledgeBaseReferenceService,
    AgentExplainabilityService,
  ],
  exports: [
    AgentRegistryService,
    AGENT_ORCHESTRATION_REPOSITORY,
    AgentOrchestrationStreamHubService,
    ReasoningEngineService,
    AgentOrchestratorService,
    KNOWLEDGE_BASE_REFERENCE_REPOSITORY,
    KnowledgeBaseReferenceService,
    AgentExplainabilityService,
  ],
})
export class AgentCoreModule {}
