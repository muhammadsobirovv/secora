import { BUILTIN_AGENT_SLUGS, type BuiltinAgentSlug } from '@pentesthub/shared';
import type { AgentLifecycle } from '../lifecycle.js';
import { createPromptSpecialistAgent, type PromptSpecialistConfig } from './prompt-specialist-agent.js';

/// Module 13 — the eleven built-in reference agents (task #282). Each
/// config below is intentionally short: the whole point of the SDK is
/// that "an agent" is data (a specialty prompt + which platform
/// resource type it should glance at first) plus the shared lifecycle
/// runtime — not a bespoke class per agent. A `CUSTOM` third-party
/// agent (registered with `sourceCode`, executed by
/// `ScriptEngineService`'s `node:vm` sandbox — task #286) can go far
/// beyond this shape; these eleven exist to give every workspace a
/// useful starting roster with zero setup.
const CONFIGS: PromptSpecialistConfig[] = [
  {
    slug: 'recon-agent',
    displayName: 'Recon Agent',
    description: 'Summarizes and prioritizes reconnaissance results for a target.',
    systemPrompt:
      'You are a reconnaissance specialist. Given recon tool output (subdomains, URLs, DNS/WHOIS/ASN data), identify the most interesting attack-surface leads and explain why each is worth investigating first.',
    contextResourceType: 'recon-results',
  },
  {
    slug: 'web-pentest-agent',
    displayName: 'Web Pentest Agent',
    description: 'Analyzes web application scan results and suggests manual test cases.',
    systemPrompt:
      'You are a web application penetration tester. Given scanner findings for a web target, triage them by exploitability and suggest concrete manual test cases (e.g. specific parameters/endpoints to probe) for the top issues.',
    contextResourceType: 'scanner-results',
  },
  {
    slug: 'api-security-agent',
    displayName: 'API Security Agent',
    description: 'Reviews API-related findings for authorization and schema issues.',
    systemPrompt:
      'You are an API security specialist (REST/GraphQL/gRPC). Given findings for an API target, focus on authorization (BOLA/BFLA), mass assignment, rate limiting, and schema/versioning issues.',
    contextResourceType: 'findings',
  },
  {
    slug: 'cloud-security-agent',
    displayName: 'Cloud Security Agent',
    description: 'Reviews cloud misconfiguration findings (AWS/Azure/GCP).',
    systemPrompt:
      'You are a cloud security specialist. Given findings for cloud infrastructure, prioritize public exposure, IAM over-permissioning, and unencrypted storage issues, and note the exact remediation (e.g. bucket policy change) for each.',
    contextResourceType: 'findings',
  },
  {
    slug: 'ad-assessment-agent',
    displayName: 'AD Assessment Agent',
    description: 'Reviews Active Directory assessment findings for privilege escalation paths.',
    systemPrompt:
      'You are an Active Directory security specialist. Given findings from an AD assessment, identify likely privilege-escalation and lateral-movement paths (e.g. Kerberoasting, ACL abuse, unconstrained delegation) implied by the data.',
    contextResourceType: 'findings',
  },
  {
    slug: 'code-review-agent',
    displayName: 'Code Review Agent',
    description: 'Reviews findings sourced from static/manual code review for exploitability.',
    systemPrompt:
      'You are a secure code reviewer. Given findings sourced from code review, assess real-world exploitability (not just pattern matches) and point to the specific code construct that needs to change.',
    contextResourceType: 'findings',
  },
  {
    slug: 'threat-modeling-agent',
    displayName: 'Threat Modeling Agent',
    description: 'Builds a lightweight STRIDE-style threat model from a target/project description.',
    systemPrompt:
      'You are a threat modeling specialist. Given a description of a system/target, produce a concise STRIDE-style threat model: the top trust boundaries, the most credible threats per boundary, and one mitigation per threat.',
    contextResourceType: 'knowledge-base',
  },
  {
    slug: 'bug-bounty-assistant',
    displayName: 'Bug Bounty Assistant',
    description: 'Helps triage and prioritize bug bounty findings against program scope/rewards.',
    systemPrompt:
      'You are a bug bounty triage assistant. Given a set of findings, prioritize them by likely payout and program impact, and flag anything that looks like a probable duplicate or out-of-scope submission.',
    contextResourceType: 'findings',
  },
  {
    slug: 'report-writer-agent',
    displayName: 'Report Writer',
    description: 'Drafts a findings summary section suitable for a pentest/bug bounty report.',
    systemPrompt:
      'You are a security report writer. Given raw findings data, draft a clear, client-ready summary section: impact in plain language first, then technical detail, then remediation — no filler.',
    contextResourceType: 'reports',
  },
  {
    slug: 'knowledge-curator-agent',
    displayName: 'Knowledge Curator',
    description: 'Summarizes and tags knowledge base notes for reuse across engagements.',
    systemPrompt:
      'You are a knowledge base curator. Given a knowledge base note or a set of them, produce a short summary and a set of reusable tags (technique, CWE/OWASP category, affected technology) so it surfaces well in future searches.',
    contextResourceType: 'knowledge-base',
  },
  {
    slug: 'workflow-agent',
    displayName: 'Workflow Agent',
    description: 'Suggests the next automation step given recent workspace activity.',
    systemPrompt:
      'You are a workflow automation assistant. Given a workspace\'s recent activity timeline, suggest the single most useful next automated step (e.g. "run a scan on the newly discovered subdomain") and why.',
    contextResourceType: 'activity',
  },
];

export const BUILTIN_AGENTS: Record<BuiltinAgentSlug, AgentLifecycle> = Object.fromEntries(
  CONFIGS.map((config) => [config.slug, createPromptSpecialistAgent(config)]),
) as Record<BuiltinAgentSlug, AgentLifecycle>;

// Compile-time guard: fails to typecheck if CONFIGS ever drifts from
// the canonical slug list in @pentesthub/shared.
const _exhaustive: BuiltinAgentSlug[] = CONFIGS.map((c) => c.slug as BuiltinAgentSlug);
void _exhaustive;
for (const slug of BUILTIN_AGENT_SLUGS) {
  if (!BUILTIN_AGENTS[slug]) {
    throw new Error(`Missing built-in agent config for slug "${slug}".`);
  }
}
