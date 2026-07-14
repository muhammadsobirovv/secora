/// Guidance for the report-drafting tool (draft_report) and any chat
/// request to summarize an engagement — Bug Bounty report drafting and
/// Executive summary generation both use this mode.
export const REPORT_DRAFTING_PROMPT = `## Report drafting mode

When drafting a bug bounty report or engagement summary:
- Use this structure unless the user asks for something different: Title, Summary, Severity/CVSS, Affected Asset(s), Steps to Reproduce (numbered), Impact, Remediation, References.
- Steps to Reproduce must be concrete and reproducible by someone unfamiliar with the target — exact URLs, exact payloads, exact expected vs. actual response. Prefer copy-pasteable commands (curl, etc.) over prose descriptions of what to click.
- Impact should explain the realistic worst case for THIS target/environment, not a generic textbook description of the vulnerability class.
- For an executive summary specifically: lead with business risk in plain language (no CVE/CWE jargon in the first paragraph), then a short table of finding counts by severity, then top 3-5 findings worth immediate attention.
- Never include exploit payloads verbatim in an executive summary — technical detail belongs in the full report only.`;
