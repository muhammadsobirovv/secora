import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type {
  CalculateSeverityRequestDto,
  CalculateSeverityResultDto,
  GenerateImpactRequestDto,
  GenerateImpactResultDto,
  GeneratePocRequestDto,
  GeneratePocResultDto,
  GenerateRemediationRequestDto,
  GenerateRemediationResultDto,
  GenerateReproStepsRequestDto,
  GenerateReproStepsResultDto,
  ReviewFindingRequestDto,
  ReviewFindingResultDto,
  SuggestPayloadsRequestDto,
  SuggestPayloadsResultDto,
} from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_FINDINGS_REPOSITORY,
  type BugBountyFindingsRepository,
} from '../domain/repositories/bugbounty-findings.repository.interface.js';
import { resolveBugBountyFindingForCaller } from '../authorization.util.js';
import { BugBountyAiAssistantService } from '../ai/bugbounty-ai-assistant.service.js';

// ---------------------------------------------------------------------------
// Review Finding
// ---------------------------------------------------------------------------

export class ReviewFindingCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
    public readonly data: ReviewFindingRequestDto,
  ) {}
}

@CommandHandler(ReviewFindingCommand)
export class ReviewFindingHandler
  implements ICommandHandler<ReviewFindingCommand, ReviewFindingResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    private readonly assistant: BugBountyAiAssistantService,
  ) {}

  async execute(command: ReviewFindingCommand): Promise<ReviewFindingResultDto> {
    const { finding } = await resolveBugBountyFindingForCaller(
      this.workspacesRepository,
      this.findingsRepository,
      command.userId,
      command.findingId,
    );
    const result = await this.assistant.reviewFinding({
      finding,
      provider: command.data.provider,
      model: command.data.model,
    });
    return {
      findingId: finding.id,
      suggestions: result.suggestions,
      suggestedSeverity: result.suggestedSeverity,
      suggestedCvss: result.suggestedCvss,
      missingFields: result.missingFields,
    };
  }
}

// ---------------------------------------------------------------------------
// Suggest Payloads
// ---------------------------------------------------------------------------

export class SuggestPayloadsCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
    public readonly data: SuggestPayloadsRequestDto,
  ) {}
}

@CommandHandler(SuggestPayloadsCommand)
export class SuggestPayloadsHandler
  implements ICommandHandler<SuggestPayloadsCommand, SuggestPayloadsResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    private readonly assistant: BugBountyAiAssistantService,
  ) {}

  async execute(command: SuggestPayloadsCommand): Promise<SuggestPayloadsResultDto> {
    const { workspaceId, finding } = await resolveBugBountyFindingForCaller(
      this.workspacesRepository,
      this.findingsRepository,
      command.userId,
      command.findingId,
    );
    const result = await this.assistant.suggestPayloads({
      workspaceId,
      vulnType: command.data.vulnType ?? finding.vulnType ?? undefined,
      context: command.data.context ?? finding.description,
      provider: command.data.provider,
      model: command.data.model,
    });
    return { payloads: result.payloads };
  }
}

// ---------------------------------------------------------------------------
// Generate PoC
// ---------------------------------------------------------------------------

export class GeneratePocCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
    public readonly data: GeneratePocRequestDto,
  ) {}
}

@CommandHandler(GeneratePocCommand)
export class GeneratePocHandler
  implements ICommandHandler<GeneratePocCommand, GeneratePocResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    private readonly assistant: BugBountyAiAssistantService,
  ) {}

  async execute(command: GeneratePocCommand): Promise<GeneratePocResultDto> {
    const { finding } = await resolveBugBountyFindingForCaller(
      this.workspacesRepository,
      this.findingsRepository,
      command.userId,
      command.findingId,
    );
    const result = await this.assistant.generatePoc({
      finding,
      provider: command.data.provider,
      model: command.data.model,
    });
    return {
      proofOfConcept: result.proofOfConcept,
      requestExample: result.requestExample,
      responseExample: result.responseExample,
    };
  }
}

// ---------------------------------------------------------------------------
// Generate Repro Steps
// ---------------------------------------------------------------------------

export class GenerateReproStepsCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
    public readonly data: GenerateReproStepsRequestDto,
  ) {}
}

@CommandHandler(GenerateReproStepsCommand)
export class GenerateReproStepsHandler
  implements ICommandHandler<GenerateReproStepsCommand, GenerateReproStepsResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    private readonly assistant: BugBountyAiAssistantService,
  ) {}

  async execute(
    command: GenerateReproStepsCommand,
  ): Promise<GenerateReproStepsResultDto> {
    const { finding } = await resolveBugBountyFindingForCaller(
      this.workspacesRepository,
      this.findingsRepository,
      command.userId,
      command.findingId,
    );
    const result = await this.assistant.generateReproSteps({
      finding,
      provider: command.data.provider,
      model: command.data.model,
    });
    return { stepsToReproduce: result.stepsToReproduce };
  }
}

// ---------------------------------------------------------------------------
// Generate Impact
// ---------------------------------------------------------------------------

export class GenerateImpactCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
    public readonly data: GenerateImpactRequestDto,
  ) {}
}

@CommandHandler(GenerateImpactCommand)
export class GenerateImpactHandler
  implements ICommandHandler<GenerateImpactCommand, GenerateImpactResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    private readonly assistant: BugBountyAiAssistantService,
  ) {}

  async execute(command: GenerateImpactCommand): Promise<GenerateImpactResultDto> {
    const { finding } = await resolveBugBountyFindingForCaller(
      this.workspacesRepository,
      this.findingsRepository,
      command.userId,
      command.findingId,
    );
    const result = await this.assistant.generateImpact({
      finding,
      provider: command.data.provider,
      model: command.data.model,
    });
    return { impact: result.impact };
  }
}

// ---------------------------------------------------------------------------
// Generate Remediation
// ---------------------------------------------------------------------------

export class GenerateRemediationCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
    public readonly data: GenerateRemediationRequestDto,
  ) {}
}

@CommandHandler(GenerateRemediationCommand)
export class GenerateRemediationHandler
  implements ICommandHandler<GenerateRemediationCommand, GenerateRemediationResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    private readonly assistant: BugBountyAiAssistantService,
  ) {}

  async execute(
    command: GenerateRemediationCommand,
  ): Promise<GenerateRemediationResultDto> {
    const { finding } = await resolveBugBountyFindingForCaller(
      this.workspacesRepository,
      this.findingsRepository,
      command.userId,
      command.findingId,
    );
    const result = await this.assistant.generateRemediation({
      finding,
      provider: command.data.provider,
      model: command.data.model,
    });
    return { mitigation: result.mitigation };
  }
}

// ---------------------------------------------------------------------------
// Calculate Severity
// ---------------------------------------------------------------------------

export class CalculateSeverityCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
    public readonly data: CalculateSeverityRequestDto,
  ) {}
}

@CommandHandler(CalculateSeverityCommand)
export class CalculateSeverityHandler
  implements ICommandHandler<CalculateSeverityCommand, CalculateSeverityResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    private readonly assistant: BugBountyAiAssistantService,
  ) {}

  async execute(
    command: CalculateSeverityCommand,
  ): Promise<CalculateSeverityResultDto> {
    const { finding } = await resolveBugBountyFindingForCaller(
      this.workspacesRepository,
      this.findingsRepository,
      command.userId,
      command.findingId,
    );
    const result = await this.assistant.calculateSeverity({
      finding,
      provider: command.data.provider,
      model: command.data.model,
    });
    return {
      severity: result.severity,
      cvss: result.cvss,
      reasoning: result.reasoning,
    };
  }
}
