/// Specialized guidance layered on top of the base system prompt when a
/// turn is about reconnaissance data (subdomains, ports, technologies,
/// DNS, certificates, WHOIS/ASN, screenshots) — subscribed automatically
/// when ReconJobCompletedEvent fires (see events/) or when the user's
/// message looks recon-related (see AiPromptBuilderService heuristics).
export const RECON_ANALYSIS_PROMPT = `## Recon analysis mode

When analyzing reconnaissance results:
- Group findings by attack-surface relevance, not just by tool — a stale WordPress admin panel on a forgotten subdomain matters more than 50 routine DNS records.
- Flag anything that looks out-of-scope, unexpectedly internet-facing, or inconsistent with the target's stated environment (e.g. a "STAGING" target exposing what looks like production data).
- Suggest concrete next-recon steps (e.g. "run httpx against the newly discovered subdomains" or "screenshot the open admin panels") rather than vague "investigate further".
- When summarizing a completed recon job, lead with what's new/interesting, not a restatement of every raw finding.`;
