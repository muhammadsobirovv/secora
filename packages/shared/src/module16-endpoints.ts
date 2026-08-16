// Module 16 — endpoint path catalog, following the established
// `*_ENDPOINTS` convention (see feature-flags-endpoints.ts).

export const RESEARCH_SESSION_ENDPOINTS = {
  list: () => "research-sessions",
  create: () => "research-sessions",
  session: (id: string) => `research-sessions/${id}`,
  link: (id: string) => `research-sessions/${id}/links`,
} as const;

export const ASSET_GRAPH_ENDPOINTS = {
  forTarget: (targetId: string) => `assets/graph/${targetId}`,
  attackSurface: (projectId: string) => `assets/attack-surface/${projectId}`,
} as const;

export const TECHNOLOGY_ENDPOINTS = {
  forTarget: (targetId: string) => `assets/technologies/${targetId}`,
} as const;

export const CHANGE_DETECTION_ENDPOINTS = {
  forTarget: (targetId: string) => `assets/changes/${targetId}`,
} as const;

export const CORRELATION_INSIGHT_ENDPOINTS = {
  forProject: (projectId: string) => `assets/correlations/${projectId}`,
} as const;

export const CVE_INTELLIGENCE_ENDPOINTS = {
  lookup: (cveId: string) => `intel/cve/${cveId}`,
  matchesForTarget: (targetId: string) => `intel/cve-matches/${targetId}`,
  refresh: () => "intel/cve/refresh",
} as const;

export const SUBMISSION_ENDPOINTS = {
  list: () => "bug-bounty/submissions",
  create: () => "bug-bounty/submissions",
  submission: (id: string) => `bug-bounty/submissions/${id}`,
  rewards: () => "bug-bounty/rewards",
} as const;

export const SECURITY_APPROVAL_ENDPOINTS = {
  list: () => "security/approvals",
  create: () => "security/approvals",
  decide: (id: string) => `security/approvals/${id}/decide`,
} as const;

export const GLOBAL_SECURITY_POLICY_ENDPOINTS = {
  get: () => "security/policy",
  update: () => "security/policy",
} as const;

export const AI_INVESTIGATION_ENDPOINTS = {
  list: () => "ai/investigations",
  start: () => "ai/investigations",
  session: (id: string) => `ai/investigations/${id}`,
  approvePlan: (id: string) => `ai/investigations/${id}/approve`,
  cancel: (id: string) => `ai/investigations/${id}/cancel`,
} as const;

export const RESEARCHER_MEMORY_ENDPOINTS = {
  list: () => "ai/memory",
  create: () => "ai/memory",
  entry: (id: string) => `ai/memory/${id}`,
  export: () => "ai/memory/export",
} as const;

export const TERMINAL_ENDPOINTS = {
  commandRegistry: () => "terminal/command-registry",
  run: () => "terminal/commands",
  history: () => "terminal/commands",
  command: (id: string) => `terminal/commands/${id}`,
} as const;

export const PLAYBOOK_ENDPOINTS = {
  list: () => "playbooks",
  create: () => "playbooks",
  playbook: (id: string) => `playbooks/${id}`,
  publish: (id: string) => `playbooks/${id}/publish`,
  clone: (id: string) => `playbooks/${id}/clone`,
  archive: (id: string) => `playbooks/${id}/archive`,
  validate: (id: string) => `playbooks/${id}/validate`,
  dryRun: (id: string) => `playbooks/${id}/dry-run`,
  run: (id: string) => `playbooks/${id}/run`,
  executions: (id: string) => `playbooks/${id}/executions`,
  execution: (executionId: string) => `playbook-executions/${executionId}`,
  approvals: () => "playbook-approvals",
  decideApproval: (id: string) => `playbook-approvals/${id}/decide`,
} as const;

export const KNOWLEDGE_GRAPH_ENDPOINTS = {
  node: (type: string, id: string) => `knowledge-graph/nodes/${type}/${id}`,
  relationships: (type: string, id: string) => `knowledge-graph/nodes/${type}/${id}/relationships`,
  search: () => "knowledge-graph/search",
  path: () => "knowledge-graph/path",
} as const;

export const EXTENSION_REGISTRY_ENDPOINTS = {
  list: () => "extensions",
  register: () => "extensions",
  extension: (id: string) => `extensions/${id}`,
  enable: (id: string) => `extensions/${id}/enable`,
  disable: (id: string) => `extensions/${id}/disable`,
  unregister: (id: string) => `extensions/${id}`,
} as const;

export const SHARE_LINK_ENDPOINTS = {
  create: () => "share-links",
  list: () => "share-links",
  revoke: (id: string) => `share-links/${id}/revoke`,
  /// POST, not GET — resolving a link is a mutating action (increments
  /// accessCount, writes an audit event on every attempt) and accepts an
  /// optional `{ password }` body for password-protected links. See
  /// PublicShareController / access-share-link.command.ts.
  access: (token: string) => `share/${token}/access`,
} as const;

export const REALTIME_ENDPOINTS = {
  /// SSE stream — `Accept: text/event-stream`, one long-lived GET per
  /// connection. Query param `workspaceId` selects which workspace's
  /// events to receive; server validates membership before opening the
  /// stream (see RealtimeController).
  stream: () => "realtime/stream",
  typing: () => "realtime/typing",
  presenceHeartbeat: () => "realtime/presence/heartbeat",
} as const;
