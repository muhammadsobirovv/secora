/// The auto-gathered context bundle (Automatic AI Context) — the whole
/// point of the AI Security Copilot vs. a generic chatbot: the user never
/// pastes anything in manually. AiPromptBuilderService renders this into
/// the system prompt; AiContextController's summary/suggested-questions
/// endpoints derive from the same bundle so the UI's "Context Indicator"
/// never drifts from what the model actually sees.
export interface AiContextBundle {
  workspace: { id: string; name: string };
  project: {
    id: string;
    name: string;
    status: string;
    description: string | null;
  };
  targets: {
    id: string;
    type: string;
    value: string;
    name: string | null;
    scopeStatus: string;
    environment: string;
  }[];
  reconFindingCountsByType: { type: string; count: number }[];
  recentReconFindings: {
    id: string;
    type: string;
    value: string;
    source: string;
  }[];
  vulnFindingCountsBySeverity: Record<string, number>;
  vulnFindingCountsByStatus: Record<string, number>;
  recentVulnFindings: {
    id: string;
    title: string;
    severity: string;
    status: string;
    cwe: string | null;
    owaspCategory: string | null;
  }[];
  notes: { id: string; title: string | null; excerpt: string }[];
  evidenceSummary: { type: string; title: string }[];
  recentActivity: { verb: string; entityType: string; createdAt: string }[];
  scanTemplates: { id: string; name: string; scanners: string[] }[];
  /// Populated per-turn by AiMemoryService.search() against the caller's
  /// latest message — the RAG contribution, kept separate from the
  /// always-fetched structured summary above since it's query-dependent.
  relevantMemory: {
    content: string;
    sourceType: string;
    sourceId: string;
    score: number;
  }[];
}
