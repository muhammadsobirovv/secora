import { Injectable } from '@nestjs/common';
import type { AgentType } from '@pentesthub/shared';
import type { BaseAgent } from './base-agent.js';
import { ReconAgent } from './recon.agent.js';
import { WebAgent } from './web.agent.js';
import { ApiAgent } from './api.agent.js';
import { MobileAgent } from './mobile.agent.js';
import { CloudAgent } from './cloud.agent.js';
import { ActiveDirectoryAgent } from './active-directory.agent.js';
import { AiResearchAgent } from './ai-research.agent.js';
import { ExploitAnalysisAgent } from './exploit-analysis.agent.js';
import { ReportWriterAgent } from './report-writer.agent.js';
import { CodeReviewAgent } from './code-review.agent.js';
import { RiskAssessmentAgent } from './risk-assessment.agent.js';
import { WorkflowCoordinatorAgent } from './workflow-coordinator.agent.js';

/// Resolves an AgentType to its implementation — same "explicit
/// constructor list + Map" pattern as AiToolRegistryService and
/// ScannerRunnerRegistry. Adding a 13th agent means one new class + one
/// line here; AgentOrchestratorService (task #223) never branches on which
/// agent is running, it just asks this registry for one by type.
@Injectable()
export class AgentRegistryService {
  private readonly agents: Map<AgentType, BaseAgent>;

  constructor(
    recon: ReconAgent,
    web: WebAgent,
    api: ApiAgent,
    mobile: MobileAgent,
    cloud: CloudAgent,
    activeDirectory: ActiveDirectoryAgent,
    aiResearch: AiResearchAgent,
    exploitAnalysis: ExploitAnalysisAgent,
    reportWriter: ReportWriterAgent,
    codeReview: CodeReviewAgent,
    riskAssessment: RiskAssessmentAgent,
    workflowCoordinator: WorkflowCoordinatorAgent,
  ) {
    const all: BaseAgent[] = [
      recon,
      web,
      api,
      mobile,
      cloud,
      activeDirectory,
      aiResearch,
      exploitAnalysis,
      reportWriter,
      codeReview,
      riskAssessment,
      workflowCoordinator,
    ];
    this.agents = new Map(all.map((agent) => [agent.type, agent]));
  }

  get(type: AgentType): BaseAgent {
    const agent = this.agents.get(type);
    if (!agent) throw new Error(`Unknown agent type "${type}"`);
    return agent;
  }

  list(): BaseAgent[] {
    return [...this.agents.values()];
  }
}
