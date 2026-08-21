import type { PlaybookGraph, PlaybookNode } from '@pentesthub/shared';

/// Module 16 — Playbooks (task #389, spec section "8 INITIAL PLAYBOOKS").
/// Every graph here is intentionally linear (no CONDITION/PARALLEL) so it
/// passes PlaybookValidationService with zero warnings out of the box —
/// these are meant to be usable immediately and then customized in the
/// builder, not to demonstrate every step type. All tool-invoking steps
/// name a tool that exists in TERMINAL_COMMAND_REGISTRY (command-registry.ts);
/// approval-requiring tools (NMAP/NAABU/NUCLEI/NIKTO/etc.) will pause via
/// AdHocCommandService's own approval gate when actually executed — the
/// playbook graph doesn't need an explicit APPROVAL node in front of them
/// for that protection to apply (it's enforced at the tool-execution layer
/// regardless of how the step was reached).
function linearGraph(steps: Array<Pick<PlaybookNode, 'type' | 'label' | 'config'>>): PlaybookGraph {
  const nodes: PlaybookNode[] = steps.map((step, index) => ({
    id: `n${index + 1}`,
    type: step.type,
    label: step.label,
    config: step.config,
    position: { x: 0, y: index * 120 },
  }));
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `e${index + 1}`,
    from: node.id,
    to: nodes[index + 1].id,
  }));
  return { nodes, edges };
}

export interface BuiltInPlaybookDefinition {
  name: string;
  description: string;
  category: string;
  graph: PlaybookGraph;
}

export const BUILT_IN_PLAYBOOKS: BuiltInPlaybookDefinition[] = [
  {
    name: 'Web Recon',
    description: 'Passive subdomain enumeration, HTTP probing, and technology fingerprinting for a single web target.',
    category: 'RECON',
    graph: linearGraph([
      { type: 'TARGET', label: 'Target', config: {} },
      { type: 'SCOPE_VALIDATION', label: 'Verify in-scope', config: {} },
      { type: 'RECON', label: 'Subdomain enumeration (Subfinder)', config: { tool: 'SUBFINDER' } },
      { type: 'HTTP_PROBE', label: 'HTTP probe (httpx)', config: { tool: 'HTTPX' } },
      { type: 'TECHNOLOGY_DETECTION', label: 'Technology fingerprint (WhatWeb)', config: { tool: 'WHATWEB' } },
      { type: 'EVIDENCE_COLLECTION', label: 'Save recon output as evidence', config: { title: 'Web Recon output' } },
    ]),
  },
  {
    name: 'API Recon',
    description: 'Historical URL discovery and HTTP probing focused on surfacing API endpoints.',
    category: 'RECON',
    graph: linearGraph([
      { type: 'TARGET', label: 'Target', config: {} },
      { type: 'SCOPE_VALIDATION', label: 'Verify in-scope', config: {} },
      { type: 'RECON', label: 'Get-all-URLs (gau)', config: { tool: 'GAU' } },
      { type: 'HTTP_PROBE', label: 'HTTP probe (httpx)', config: { tool: 'HTTPX' } },
      { type: 'EVIDENCE_COLLECTION', label: 'Save discovered endpoints as evidence', config: { title: 'API Recon output' } },
    ]),
  },
  {
    name: 'Subdomain Enumeration',
    description: 'Multi-source passive subdomain discovery and DNS resolution.',
    category: 'RECON',
    graph: linearGraph([
      { type: 'TARGET', label: 'Target', config: {} },
      { type: 'SCOPE_VALIDATION', label: 'Verify in-scope', config: {} },
      { type: 'RECON', label: 'Subdomain enumeration (Subfinder)', config: { tool: 'SUBFINDER' } },
      { type: 'RECON', label: 'Asset discovery (Assetfinder)', config: { tool: 'ASSETFINDER' } },
      { type: 'RECON', label: 'DNS resolution (dnsx)', config: { tool: 'DNSX' } },
      { type: 'EVIDENCE_COLLECTION', label: 'Save subdomain list as evidence', config: { title: 'Subdomain enumeration output' } },
    ]),
  },
  {
    name: 'External Pentest',
    description: 'Full external assessment: recon, port scan, and template-based vulnerability scanning.',
    category: 'PENTEST',
    graph: linearGraph([
      { type: 'TARGET', label: 'Target', config: {} },
      { type: 'SCOPE_VALIDATION', label: 'Verify in-scope', config: {} },
      { type: 'RECON', label: 'Recon (Amass)', config: { tool: 'AMASS' } },
      { type: 'PORT_SCAN', label: 'Port scan (Nmap) — requires approval', config: { tool: 'NMAP' } },
      { type: 'VULNERABILITY_SCAN', label: 'Vulnerability scan (Nuclei) — requires approval', config: { tool: 'NUCLEI' } },
      { type: 'EVIDENCE_COLLECTION', label: 'Save findings as evidence', config: { title: 'External Pentest output' } },
    ]),
  },
  {
    name: 'Bug Bounty Recon',
    description: 'Recon flow tuned for bug bounty scope: subdomains, historical URLs, HTTP probing, tech fingerprinting.',
    category: 'BUG_BOUNTY',
    graph: linearGraph([
      { type: 'TARGET', label: 'Target', config: {} },
      { type: 'SCOPE_VALIDATION', label: 'Verify in-scope (program rules)', config: {} },
      { type: 'RECON', label: 'Subdomain enumeration (Subfinder)', config: { tool: 'SUBFINDER' } },
      { type: 'RECON', label: 'Historical URLs (waybackurls)', config: { tool: 'WAYBACKURLS' } },
      { type: 'HTTP_PROBE', label: 'HTTP probe (httpx)', config: { tool: 'HTTPX' } },
      { type: 'TECHNOLOGY_DETECTION', label: 'Technology fingerprint (WhatWeb)', config: { tool: 'WHATWEB' } },
      { type: 'EVIDENCE_COLLECTION', label: 'Save recon output as evidence', config: { title: 'Bug Bounty Recon output' } },
    ]),
  },
  {
    name: 'Authentication Testing',
    description: 'HTTP probing followed by a template-based vulnerability scan focused on auth-relevant checks, with a manual approval checkpoint before scanning.',
    category: 'PENTEST',
    graph: linearGraph([
      { type: 'TARGET', label: 'Target', config: {} },
      { type: 'SCOPE_VALIDATION', label: 'Verify in-scope', config: {} },
      { type: 'HTTP_PROBE', label: 'HTTP probe (httpx)', config: { tool: 'HTTPX' } },
      { type: 'APPROVAL', label: 'Manual approval before active scanning', config: {} },
      { type: 'VULNERABILITY_SCAN', label: 'Vulnerability scan (Nuclei) — requires approval', config: { tool: 'NUCLEI' } },
      { type: 'EVIDENCE_COLLECTION', label: 'Save findings as evidence', config: { title: 'Authentication Testing output' } },
    ]),
  },
  {
    name: 'Cloud Attack Surface',
    description: 'ASN/WHOIS enrichment followed by a fast port scan of the resolved IP range.',
    category: 'CLOUD',
    graph: linearGraph([
      { type: 'TARGET', label: 'Target', config: {} },
      { type: 'SCOPE_VALIDATION', label: 'Verify in-scope', config: {} },
      { type: 'RECON', label: 'ASN / IP block lookup', config: { tool: 'ASN' } },
      { type: 'RECON', label: 'WHOIS lookup', config: { tool: 'WHOIS' } },
      { type: 'PORT_SCAN', label: 'Fast port scan (naabu) — requires approval', config: { tool: 'NAABU' } },
      { type: 'EVIDENCE_COLLECTION', label: 'Save attack surface data as evidence', config: { title: 'Cloud Attack Surface output' } },
    ]),
  },
  {
    name: 'Mobile Assessment',
    description: 'Recon and HTTP probing of a mobile app’s backend API surface, followed by a web server vulnerability scan.',
    category: 'MOBILE',
    graph: linearGraph([
      { type: 'TARGET', label: 'Target', config: {} },
      { type: 'SCOPE_VALIDATION', label: 'Verify in-scope', config: {} },
      { type: 'RECON', label: 'Subdomain enumeration (Subfinder)', config: { tool: 'SUBFINDER' } },
      { type: 'HTTP_PROBE', label: 'HTTP probe (httpx)', config: { tool: 'HTTPX' } },
      { type: 'VULNERABILITY_SCAN', label: 'Web server scan (Nikto) — requires approval', config: { tool: 'NIKTO' } },
      { type: 'EVIDENCE_COLLECTION', label: 'Save findings as evidence', config: { title: 'Mobile Assessment output' } },
    ]),
  },

  // --- Module 17 — Defensive Security Playbooks (task #473) --------------
  // These two are the platform's first `INCIDENT_RESPONSE`-category
  // playbooks, meant to be started via `IncidentPlaybooksService
  // .runAgainstIncident()` (which resolves a Target from the incident's
  // own linked assets) rather than picked as a bare Target-based run.
  // Deliberately use ONLY the engine's read-only/advisory step types
  // (SCOPE_VALIDATION/EVIDENCE_COLLECTION/APPROVAL/NOTIFICATION/
  // AI_ANALYSIS) — never RECON/PORT_SCAN/VULNERABILITY_SCAN/etc., which
  // dispatch to `AdHocCommandService`'s offensive tool-execution path and
  // have no place in an incident-response runbook. NOTIFICATION and
  // AI_ANALYSIS steps inherit the same disclosed-thin-stub behavior
  // documented on `PlaybookExecutionService` — they record what would
  // have been sent/analyzed rather than actually calling a delivery
  // channel or AI provider, exactly as they already do for every other
  // playbook that uses them.
  {
    name: 'Phishing Response',
    description: 'Contain a reported phishing email: preserve evidence, notify the security team, and require human approval before any containment action is recorded as taken.',
    category: 'INCIDENT_RESPONSE',
    graph: linearGraph([
      { type: 'TARGET', label: 'Affected asset', config: {} },
      { type: 'SCOPE_VALIDATION', label: 'Confirm affected asset is in scope', config: {} },
      { type: 'EVIDENCE_COLLECTION', label: 'Preserve phishing email / headers as evidence', config: { title: 'Phishing Response — reported email' } },
      { type: 'NOTIFICATION', label: 'Notify security team', config: { message: 'Phishing report under investigation.' } },
      { type: 'APPROVAL', label: 'Approve containment action (e.g. block sender domain, reset credentials)', config: {} },
      { type: 'EVIDENCE_COLLECTION', label: 'Record containment action taken', config: { title: 'Phishing Response — containment record' } },
    ]),
  },
  {
    name: 'Ransomware Containment',
    description: 'Initial containment steps for a suspected ransomware incident: require human approval before isolation, preserve evidence, and notify stakeholders.',
    category: 'INCIDENT_RESPONSE',
    graph: linearGraph([
      { type: 'TARGET', label: 'Affected asset', config: {} },
      { type: 'SCOPE_VALIDATION', label: 'Confirm affected asset is in scope', config: {} },
      { type: 'APPROVAL', label: 'Approve isolating the affected host from the network', config: {} },
      { type: 'EVIDENCE_COLLECTION', label: 'Record isolation action and observed indicators', config: { title: 'Ransomware Containment — isolation record' } },
      { type: 'NOTIFICATION', label: 'Notify incident response stakeholders', config: { message: 'Suspected ransomware — host isolated, investigation underway.' } },
      { type: 'AI_ANALYSIS', label: 'Summarize incident so far for the response team', config: {} },
    ]),
  },
];
