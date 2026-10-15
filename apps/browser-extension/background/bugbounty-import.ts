// Bug Bounty Helpers — "Allow importing targets into Secora" from a
// detected HackerOne/Bugcrowd/Intigriti/YesWeHack/Synack program page
// (see `content/bugbounty-scope.ts` for the DOM scraping half of this).

import { getClient } from "./bridge";
import { getState } from "../shared/storage";
import type { CaptureRequest, CreateNoteRequest, ExtractedProgramScope } from "../shared/types";

// A conservative "does this look like a domain/host we could create a
// Target from" filter — in-scope lists on these platforms mix domains
// ("*.example.com"), full URLs, mobile app IDs, and free text
// ("Any subdomain of example.com not listed below"); only the
// domain/URL-shaped ones become Targets, everything else is preserved
// verbatim in the scope Note so nothing is silently dropped.
const DOMAIN_LIKE = /^(\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const URL_LIKE = /^https?:\/\//i;

export async function importProgramScope(scope: ExtractedProgramScope): Promise<{ ok: boolean; targetsCreated: number; error?: string }> {
  const client = await getClient();
  if (!client) return { ok: false, targetsCreated: 0, error: "Not paired with a Desktop Agent." };

  const state = await getState();
  if (!state.currentProjectId) return { ok: false, targetsCreated: 0, error: "No current Project selected." };

  let targetsCreated = 0;
  for (const raw of scope.inScope) {
    const entry = raw.trim();
    const domain = entry.replace(/^\*\./, "");
    let captureType: "domain" | "url" | "subdomain" | null = null;
    let value = entry;

    if (URL_LIKE.test(entry)) {
      captureType = "url";
      value = entry;
    } else if (DOMAIN_LIKE.test(domain)) {
      captureType = entry.startsWith("*.") || domain.split(".").length > 2 ? "subdomain" : "domain";
      value = domain;
    }

    if (!captureType) continue; // free-text scope note, not target-shaped — kept in the Note below only

    try {
      await client.post<CaptureRequest, { id: string }>("/api/captures", {
        projectId: state.currentProjectId,
        captureType,
        pageUrl: scope.sourceUrl,
        data: value,
        tags: ["bug-bounty-import", scope.platform],
      });
      targetsCreated++;
    } catch {
      // One malformed entry shouldn't abort the whole import — continue
      // with the rest and let the summary Note capture everything for
      // manual follow-up regardless.
    }
  }

  const noteContent = buildScopeNote(scope);
  try {
    await client.post<CreateNoteRequest, { id: string }>("/api/notes", {
      projectId: state.currentProjectId,
      title: `[${scope.platform}] ${scope.programName ?? "Program"} — Scope Import`,
      content: noteContent,
    });
  } catch {
    /* target creation succeeding is the primary outcome; a failed note write isn't fatal */
  }

  return { ok: true, targetsCreated };
}

function buildScopeNote(scope: ExtractedProgramScope): string {
  const section = (title: string, items: string[]) => (items.length ? `## ${title}\n\n${items.map((i) => `- ${i}`).join("\n")}\n\n` : "");
  const bounty = scope.bountyTable.length
    ? `## Bounty Table\n\n| Severity | Reward |\n|---|---|\n${scope.bountyTable.map((r) => `| ${r.severity} | ${r.reward} |`).join("\n")}\n\n`
    : "";
  return [
    `Imported from ${scope.platform} — ${scope.sourceUrl}`,
    ``,
    section("In Scope", scope.inScope),
    section("Out of Scope", scope.outOfScope),
    bounty,
    section("Known Restrictions", scope.knownRestrictions),
    scope.policyText ? `## Policy\n\n${scope.policyText}\n` : "",
  ].join("\n");
}
