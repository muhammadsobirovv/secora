import type { AiContextBundle } from '../context/ai-context.types.js';

/// The base identity/behavior prompt every conversation starts with.
/// Deliberately NOT "you are a helpful assistant" — the spec is explicit
/// that this must not read like a generic chatbot. Kept in its own module
/// (Prompt Architecture: "never hardcode prompts inside controllers or
/// services") so tone/scope can be tuned without touching AiChatService.
export const AI_COPILOT_IDENTITY_PROMPT = `You are Secora AI — the built-in AI assistant of the Secora platform. Introduce yourself as "Secora AI" when asked who you are, and describe yourself as the platform's AI assistant, never as a separate product or a "copilot". You help users use the platform and work on their penetration-testing projects inside it.

You have direct, automatic access to this project's targets, reconnaissance results, vulnerability findings, evidence, and notes (summarized below). You never need to be pasted data the platform already has — when you need more detail than the summary provides, call one of your available tools instead of asking the user to fetch it for you.

Behave like a senior penetration tester reviewing a colleague's engagement: be precise, cite specific findings/targets by name or id when relevant, flag likely false positives, and prefer actionable next steps over generic advice. When you are not sure of a fact (a CVE detail, an exact CVSS vector, a library version's fix release), say so plainly rather than inventing specifics.`;

/// System prompt for the floating "Secora AI" helper (bottom-right button on
/// every dashboard page). Not tied to any project — it explains the platform
/// itself. Replies in the language the user writes in (Uzbek, Russian or
/// English).
export const AI_PLATFORM_HELPER_PROMPT = `You are Secora AI — the built-in AI assistant of the Secora platform. Always introduce yourself as "Secora AI" when asked who you are, and describe yourself as the platform's AI assistant.

In this chat you are the platform guide, not a project analyst: you do not have access to any project's data here. Explain how Secora works and help users find their way around: workspaces and projects, targets, recon (subdomain/URL/WHOIS/ASN discovery), vulnerability scanning, bug bounty workflow (programs, scope, findings, reports), the project-scoped Secora AI assistant (under "Secora AI" in the sidebar), notes, evidence, reports, pricing plans (Free, Pro) and bringing your own AI provider key (BYOK) in Settings → AI Providers, voice input/output in Uzbek, Russian and English, the API/CLI/SDKs, and responsible use of authorized security testing.

Reply in the same language the user writes in (Uzbek, Russian or English). Keep answers short and practical, point to the exact page or menu item when possible, and never invent features you are not sure exist — say you are not sure and suggest checking the Documentation page. Only help with testing that is authorized; refuse requests to attack targets the user does not own or have permission to test.`;

/// Renders the auto-gathered AiContextBundle into a compact, model-facing
/// text block. Kept terse deliberately — this is a summary meant to
/// orient the model and hint at what to search for via tools, not a full
/// data dump (which would blow the context window on any real project).
export function renderContextPrompt(context: AiContextBundle): string {
  const lines: string[] = [];
  lines.push(`## Current workspace/project context`);
  lines.push(`Workspace: ${context.workspace.name}`);
  lines.push(
    `Project: ${context.project.name} (status: ${context.project.status})`,
  );
  if (context.project.description)
    lines.push(`Project description: ${context.project.description}`);

  lines.push(`\nTargets (${context.targets.length}):`);
  for (const t of context.targets.slice(0, 20)) {
    lines.push(
      `- [${t.type}] ${t.value}${t.name ? ` (${t.name})` : ''} — scope: ${t.scopeStatus}, env: ${t.environment}`,
    );
  }

  lines.push(
    `\nRecon findings by type: ${formatCounts(context.reconFindingCountsByType.map((c) => [c.type, c.count]))}`,
  );
  lines.push(
    `Vulnerability findings by severity: ${formatCounts(Object.entries(context.vulnFindingCountsBySeverity))}`,
  );
  lines.push(
    `Vulnerability findings by status: ${formatCounts(Object.entries(context.vulnFindingCountsByStatus))}`,
  );

  if (context.recentVulnFindings.length > 0) {
    lines.push(`\nMost recent vulnerability findings:`);
    for (const f of context.recentVulnFindings) {
      lines.push(
        `- [${f.severity}/${f.status}] ${f.title} (id: ${f.id}${f.cwe ? `, ${f.cwe}` : ''}${f.owaspCategory ? `, ${f.owaspCategory}` : ''})`,
      );
    }
  }

  if (context.recentReconFindings.length > 0) {
    lines.push(`\nMost recent recon findings:`);
    for (const f of context.recentReconFindings) {
      lines.push(`- [${f.type}] ${f.value} (via ${f.source}, id: ${f.id})`);
    }
  }

  if (context.notes.length > 0) {
    lines.push(`\nProject notes:`);
    for (const n of context.notes) {
      lines.push(`- ${n.title ?? '(untitled)'}: ${n.excerpt}`);
    }
  }

  if (context.scanTemplates.length > 0) {
    lines.push(
      `\nAvailable scan templates: ${context.scanTemplates.map((t) => t.name).join(', ')}`,
    );
  }

  if (context.recentActivity.length > 0) {
    lines.push(
      `\nRecent activity: ${context.recentActivity.map((a) => `${a.verb} ${a.entityType}`).join('; ')}`,
    );
  }

  if (context.relevantMemory.length > 0) {
    lines.push(`\n## Retrieved memory relevant to the current question`);
    for (const chunk of context.relevantMemory) {
      lines.push(
        `- (${chunk.sourceType}, score ${chunk.score.toFixed(2)}) ${chunk.content}`,
      );
    }
  }

  return lines.join('\n');
}

function formatCounts(entries: [string, number][]): string {
  const nonZero = entries.filter(([, count]) => count > 0);
  if (nonZero.length === 0) return 'none';
  return nonZero.map(([key, count]) => `${key}: ${count}`).join(', ');
}
