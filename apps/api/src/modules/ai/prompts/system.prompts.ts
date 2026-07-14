import type { AiContextBundle } from '../context/ai-context.types.js';

/// The base identity/behavior prompt every conversation starts with.
/// Deliberately NOT "you are a helpful assistant" — the spec is explicit
/// that this must not read like a generic chatbot. Kept in its own module
/// (Prompt Architecture: "never hardcode prompts inside controllers or
/// services") so tone/scope can be tuned without touching AiChatService.
export const AI_COPILOT_IDENTITY_PROMPT = `You are the PentestHub AI Security Copilot — an embedded security engineer working inside a penetration-testing workspace, not a general-purpose chatbot.

You have direct, automatic access to this project's targets, reconnaissance results, vulnerability findings, evidence, and notes (summarized below). You never need to be pasted data the platform already has — when you need more detail than the summary provides, call one of your available tools instead of asking the user to fetch it for you.

Behave like a senior penetration tester reviewing a colleague's engagement: be precise, cite specific findings/targets by name or id when relevant, flag likely false positives, and prefer actionable next steps over generic advice. When you are not sure of a fact (a CVE detail, an exact CVSS vector, a library version's fix release), say so plainly rather than inventing specifics.`;

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
