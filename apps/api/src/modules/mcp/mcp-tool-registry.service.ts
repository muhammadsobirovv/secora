import { HttpStatus, Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { McpToolDescriptor, McpToolName } from '@pentesthub/shared';
import { MCP_TOOL_NAMES } from '@pentesthub/shared';
import type {
  AiProviderName,
  CreateBugReportRequestDto,
  CreateEvidenceRequestDto,
  CreateNoteRequestDto,
  CreateProjectRequestDto,
  CreateReconJobRequestDto,
  CreateTargetRequestDto,
  CreateVulnScanJobRequestDto,
  CreateWorkflowRequestDto,
  ExportBugReportV2RequestDto,
  GenerateBugReportDraftRequestDto,
  KnowledgeBaseReferenceFramework,
  TransitionBugBountyFindingStageRequestDto,
  UpdateBugBountyFindingRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { AiProviderRegistryService } from '../ai/providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../ai/providers/collect-stream.util.js';
import { CreateProjectCommand } from '../projects/commands/create-project.command.js';
import { CreateTargetCommand } from '../targets/commands/create-target.command.js';
import { CreateReconJobCommand } from '../recon/commands/create-recon-job.command.js';
import { CreateVulnScanJobCommand } from '../vuln/commands/create-vuln-scan-job.command.js';
import { CreateNoteCommand } from '../notes/commands/create-note.command.js';
import { CreateEvidenceCommand } from '../evidence/commands/create-evidence.command.js';
import { CreateBugReportCommand } from '../bugbounty/commands/bug-report-lifecycle.commands.js';
import { GenerateBugReportDraftCommand } from '../bugbounty/commands/generate-bug-report-draft.command.js';
import { ExportBugReportV2Query } from '../bugbounty/queries/export-bug-report-v2.query.js';
import {
  UpdateBugBountyFindingCommand,
  TransitionBugBountyFindingStageCommand,
} from '../bugbounty/commands/bugbounty-finding-lifecycle.commands.js';
import { CreateWorkflowCommand } from '../automation-engine/commands/workflows.commands.js';
import { SearchKnowledgeBaseReferencesQuery } from '../agent/queries/search-knowledge-base-references.query.js';
import { EnqueueRelayCommandCommand } from '../relay-commands/commands/relay-commands.commands.js';

/// MCP Tools (task #279). Every tool delegates to the exact same
/// CommandBus/QueryBus handler the matching REST controller uses — this
/// registry never re-implements business logic, it only translates an
/// MCP `tools/call` argument object into the right Command/Query class
/// and translates the result back into `McpCallToolResult` content. Two
/// tools (`ask_ai`, `generate_payload`) go straight to
/// `AiProviderRegistryService`/`collectStreamedCompletion` instead of a
/// Command — deliberately, since both are single-shot, non-persisted AI
/// completions (no conversation to create), the same pattern
/// `draft_report`/`generate_poc`/`generate_payloads`'s internal AI Tool
/// implementations (Module 5) already use.
///
/// **Known, disclosed simplifications** (see the SDK Guide's MCP Tools
/// section for the full account): `create_project` always creates in the
/// caller's personal workspace (matches `CreateProjectCommand`'s
/// existing Module 2 behavior — not yet workspace-parameterized);
/// `create_workflow` requires an explicit `organizationId` argument
/// (Workflow Builder, Module 10, is Enterprise-organization-scoped, not
/// workspace-scoped — there is no automatic personal-workspace fallback,
/// matching the REST endpoint's own requirement); `desktop_agent_command`
/// /`browser_extension_command` (task #288) really persist a `RelayCommand`
/// row now (see `queueRelayCommand` below + `RelayCommandsModule`), but
/// nothing polls `GET /relay-commands/pending` client-side yet — Module
/// 8's "Live Sync" is a local-only, LAN-bound relay inside the Desktop
/// Agent process with no path back to this cloud API at all (discovered
/// while building task #288, a pre-existing Module 7/8 gap, not
/// something this pass could wire without unverified Rust changes) —
/// see `RelayCommandsController`'s doc comment for the exact intended
/// integration point.
@Injectable()
export class McpToolRegistryService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly aiProviderRegistry: AiProviderRegistryService,
  ) {}

  listTools(): McpToolDescriptor[] {
    const descriptions: Record<McpToolName, string> = {
      create_project: 'Create a new project in the caller\'s personal workspace.',
      create_target: 'Add a target (host/URL/IP/repo) to a project.',
      run_recon: 'Start a recon job against a target with one recon tool.',
      launch_scan: 'Start a vulnerability scan job against a target with one scanner.',
      generate_report: 'Create a bug report and AI-draft its content from a finding.',
      create_note: 'Create a note on a project (optionally scoped to a target).',
      search_knowledge: 'Search the AI Knowledge Base (OWASP/CWE/CAPEC/MITRE/NIST/CVE).',
      ask_ai: 'Ask the AI Security Copilot a one-off question (no conversation is persisted).',
      generate_payload: 'Generate an example exploitation payload for a vulnerability class.',
      create_workflow: 'Create an automation workflow (requires an Enterprise organizationId).',
      manage_findings: 'Update a finding, or transition its lifecycle stage.',
      export_report: 'Export a bug report to a file format (markdown/html/pdf/docx/json).',
      upload_evidence: 'Attach evidence metadata/text content to a project (no binary upload).',
      desktop_agent_command: 'Queue a command for a connected Desktop Agent session (delivery not yet wired).',
      browser_extension_command: 'Queue a command for a connected Browser Extension session (delivery not yet wired).',
    };
    return MCP_TOOL_NAMES.map((name) => ({
      name,
      description: descriptions[name],
      inputSchema: { type: 'object', additionalProperties: true },
    }));
  }

  async call(name: McpToolName, args: Record<string, unknown>, userId: string): Promise<unknown> {
    switch (name) {
      case 'create_project':
        return this.commandBus.execute(
          new CreateProjectCommand(userId, args as unknown as CreateProjectRequestDto),
        );
      case 'create_target':
        return this.commandBus.execute(
          new CreateTargetCommand(userId, this.requireString(args, 'projectId'), args as unknown as CreateTargetRequestDto),
        );
      case 'run_recon':
        return this.commandBus.execute(
          new CreateReconJobCommand(userId, this.requireString(args, 'targetId'), args as unknown as CreateReconJobRequestDto),
        );
      case 'launch_scan':
        return this.commandBus.execute(
          new CreateVulnScanJobCommand(userId, this.requireString(args, 'targetId'), args as unknown as CreateVulnScanJobRequestDto),
        );
      case 'create_note':
        return this.commandBus.execute(
          new CreateNoteCommand(userId, this.requireString(args, 'projectId'), args as unknown as CreateNoteRequestDto),
        );
      case 'upload_evidence':
        return this.commandBus.execute(
          new CreateEvidenceCommand(userId, this.requireString(args, 'projectId'), args as unknown as CreateEvidenceRequestDto),
        );
      case 'generate_report': {
        const report = await this.commandBus.execute(
          new CreateBugReportCommand(userId, args as unknown as CreateBugReportRequestDto),
        );
        const reportId = (report as { id: string }).id;
        return this.commandBus.execute(
          new GenerateBugReportDraftCommand(userId, reportId, (args.draftOptions ?? {}) as GenerateBugReportDraftRequestDto),
        );
      }
      case 'export_report':
        return this.queryBus.execute(
          new ExportBugReportV2Query(
            userId,
            this.requireString(args, 'reportId'),
            args as unknown as ExportBugReportV2RequestDto,
          ),
        );
      case 'manage_findings': {
        const findingId = this.requireString(args, 'findingId');
        const action = args.action;
        if (action === 'transition_stage') {
          return this.commandBus.execute(
            new TransitionBugBountyFindingStageCommand(
              userId,
              findingId,
              args.data as TransitionBugBountyFindingStageRequestDto,
            ),
          );
        }
        return this.commandBus.execute(
          new UpdateBugBountyFindingCommand(userId, findingId, args.data as UpdateBugBountyFindingRequestDto),
        );
      }
      case 'create_workflow':
        return this.commandBus.execute(
          new CreateWorkflowCommand(
            userId,
            this.requireString(args, 'organizationId'),
            args as unknown as CreateWorkflowRequestDto,
          ),
        );
      case 'search_knowledge':
        return this.queryBus.execute(
          new SearchKnowledgeBaseReferencesQuery({
            query: this.requireString(args, 'query'),
            framework: args.framework as KnowledgeBaseReferenceFramework | undefined,
            limit: typeof args.limit === 'number' ? args.limit : undefined,
          }),
        );
      case 'ask_ai':
        return this.askAi(this.requireString(args, 'workspaceId'), this.requireString(args, 'question'), args.provider as string | undefined);
      case 'generate_payload':
        return this.generatePayload(
          this.requireString(args, 'workspaceId'),
          this.requireString(args, 'vulnerabilityClass'),
          typeof args.context === 'string' ? args.context : undefined,
        );
      case 'desktop_agent_command':
        return this.queueRelayCommand('DESKTOP', args, userId);
      case 'browser_extension_command':
        return this.queueRelayCommand('BROWSER', args, userId);
      default:
        throw new AppException('MCP_TOOL_NOT_FOUND', `Unknown MCP tool "${String(name)}".`, HttpStatus.NOT_FOUND);
    }
  }

  private async askAi(workspaceId: string, question: string, preferredProvider?: string): Promise<{ answer: string }> {
    const { provider, credential } = await this.aiProviderRegistry.resolveProvider(
      workspaceId,
      preferredProvider as AiProviderName | undefined,
    );
    const answer = await collectStreamedCompletion(
      provider,
      {
        model: provider.getDefaultModel(credential),
        messages: [
          { role: 'system', content: 'You are the Secora AI Security Copilot, answering one standalone question with no prior conversation context.' },
          { role: 'user', content: question },
        ],
        maxTokens: 1024,
      },
      credential,
    );
    return { answer };
  }

  private async generatePayload(
    workspaceId: string,
    vulnerabilityClass: string,
    context: string | undefined,
  ): Promise<{ payload: string }> {
    const { provider, credential } = await this.aiProviderRegistry.resolveProvider(workspaceId, undefined);
    const payload = await collectStreamedCompletion(
      provider,
      {
        model: provider.getDefaultModel(credential),
        messages: [
          {
            role: 'system',
            content:
              'You generate a single example exploitation payload for authorized penetration testing / bug bounty use. Return only the payload and a one-line explanation.',
          },
          { role: 'user', content: `Vulnerability class: ${vulnerabilityClass}${context ? `\nContext: ${context}` : ''}` },
        ],
        maxTokens: 512,
      },
      credential,
    );
    return { payload };
  }

  /// Module 13 — Local Execution (task #288). Really persists a
  /// `RelayCommand` row now (via `RelayCommandsModule`, `GET
  /// /relay-commands/pending`/`POST /relay-commands/:id/complete`) —
  /// previously this only returned a fake `{status: 'queued'}` with no
  /// persistence at all. **Still disclosed as a partial feature**:
  /// nothing polls those endpoints yet (no Desktop Agent/Browser
  /// Extension client-side change in this pass — see
  /// `RelayCommandsController`'s doc comment for exactly where that
  /// wiring goes), so a command sits `PENDING` until a future client
  /// does. This tool call itself always succeeds once the row is
  /// written; it does not wait for delivery or completion.
  private async queueRelayCommand(
    target: 'DESKTOP' | 'BROWSER',
    args: Record<string, unknown>,
    userId: string,
  ): Promise<{ status: 'queued'; relayCommandId: string; target: string; note: string }> {
    const workspaceId = this.requireString(args, 'workspaceId');
    const commandType = this.requireString(args, 'commandType');
    const payload = (args.payload as Record<string, unknown> | undefined) ?? {};
    const enqueued = await this.commandBus.execute(
      new EnqueueRelayCommandCommand(userId, workspaceId, target, commandType, payload),
    );
    return {
      status: 'queued',
      relayCommandId: (enqueued as { id: string }).id,
      target,
      note:
        'Persisted as a PENDING relay_commands row. Delivery to a live Desktop Agent/Browser Extension session depends on that client polling GET /relay-commands/pending — not wired client-side in this pass. See docs/mcp/mcp-guide.md "Known limitations".',
    };
  }

  private requireString(args: Record<string, unknown>, key: string): string {
    const value = args[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new AppException('MCP_TOOL_ARGUMENT_INVALID', `Argument "${key}" is required and must be a non-empty string.`, 400);
    }
    return value;
  }
}
