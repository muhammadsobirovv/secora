// Bug Bounty Helpers — detects HackerOne/Bugcrowd/Intigriti/YesWeHack/
// Synack program pages by hostname and heuristically scrapes Scope /
// Out-of-Scope / Policy / Bounty Table / Known Restrictions from the
// *rendered* DOM (these are all client-rendered SPAs — there's no stable
// public API for scope data, and each platform's markup changes over
// time without notice). This is deliberately heuristic (heading-text
// matching + nearby table/list extraction) rather than pinned to exact
// CSS selectors, which would break on the next platform redesign — the
// trade-off is lower precision, documented in the Browser Extension
// Guide as "best-effort scope extraction, always verify against the
// platform before testing."

import type { BugBountyPlatform } from "../shared/constants";
import { BUG_BOUNTY_PLATFORMS } from "../shared/constants";
import type { ExtractedProgramScope } from "../shared/types";

export function detectPlatform(): BugBountyPlatform | null {
  const host = location.hostname.toLowerCase();
  const map: Record<BugBountyPlatform, string[]> = {
    hackerone: ["hackerone.com"],
    bugcrowd: ["bugcrowd.com"],
    intigriti: ["intigriti.com", "intigriti.io"],
    yeswehack: ["yeswehack.com"],
    synack: ["synack.com"],
  };
  for (const platform of BUG_BOUNTY_PLATFORMS) {
    if (map[platform].some((domain) => host === domain || host.endsWith(`.${domain}`))) return platform;
  }
  return null;
}

const SCOPE_HEADING_PATTERNS = /(in.?scope|scope\b|targets?)/i;
const OUT_OF_SCOPE_HEADING_PATTERNS = /(out.?of.?scope|excluded|not.?in.?scope)/i;
const POLICY_HEADING_PATTERNS = /(policy|program.?rules|disclosure)/i;
const RESTRICTIONS_HEADING_PATTERNS = /(restrictions?|prohibited|disallowed|rules.?of.?engagement)/i;

export function extractProgramScope(): ExtractedProgramScope | null {
  const platform = detectPlatform();
  if (!platform) return null;

  return {
    platform,
    programName: guessProgramName(),
    inScope: extractListNearHeading(SCOPE_HEADING_PATTERNS, OUT_OF_SCOPE_HEADING_PATTERNS),
    outOfScope: extractListNearHeading(OUT_OF_SCOPE_HEADING_PATTERNS),
    policyText: extractTextNearHeading(POLICY_HEADING_PATTERNS),
    bountyTable: extractBountyTable(),
    knownRestrictions: extractListNearHeading(RESTRICTIONS_HEADING_PATTERNS),
    sourceUrl: location.href,
  };
}

function guessProgramName(): string | null {
  const h1 = document.querySelector("h1");
  if (h1?.textContent?.trim()) return h1.textContent.trim();
  const title = document.title.split(/[|–-]/)[0]?.trim();
  return title || null;
}

function headings(): HTMLElement[] {
  return Array.from(document.querySelectorAll("h1, h2, h3, h4, [role='heading']"));
}

function extractListNearHeading(matchPattern: RegExp, stopPattern?: RegExp): string[] {
  const heading = headings().find((h) => matchPattern.test(h.textContent ?? ""));
  if (!heading) return [];

  const items: string[] = [];
  let node: Element | null = heading.nextElementSibling;
  let guard = 0;
  while (node && guard < 50) {
    guard++;
    const text = node.textContent?.trim() ?? "";
    if (/^h[1-4]$/i.test(node.tagName) || (stopPattern && stopPattern.test(text))) break;

    if (node.tagName === "TABLE") {
      for (const row of Array.from(node.querySelectorAll("tr"))) {
        const cell = row.querySelector("td, th");
        if (cell?.textContent?.trim()) items.push(cell.textContent.trim());
      }
    } else if (node.tagName === "UL" || node.tagName === "OL") {
      for (const li of Array.from(node.querySelectorAll("li"))) {
        if (li.textContent?.trim()) items.push(li.textContent.trim());
      }
    } else if (text && text.length < 500) {
      items.push(text);
    }
    node = node.nextElementSibling;
  }
  return items.slice(0, 200);
}

function extractTextNearHeading(matchPattern: RegExp): string | null {
  const heading = headings().find((h) => matchPattern.test(h.textContent ?? ""));
  if (!heading) return null;
  const parts: string[] = [];
  let node: Element | null = heading.nextElementSibling;
  let guard = 0;
  while (node && guard < 30 && !/^h[1-4]$/i.test(node.tagName)) {
    guard++;
    const text = node.textContent?.trim();
    if (text) parts.push(text);
    node = node.nextElementSibling;
  }
  const joined = parts.join("\n\n");
  return joined.length > 8000 ? joined.slice(0, 8000) + "\n[...truncated]" : joined || null;
}

function extractBountyTable(): Array<{ severity: string; reward: string }> {
  const heading = headings().find((h) => /(bount(y|ies)|reward)/i.test(h.textContent ?? ""));
  const table = heading ? findNextTable(heading) : Array.from(document.querySelectorAll("table")).find((t) => /severity/i.test(t.textContent ?? "") && /(reward|bounty|\$)/i.test(t.textContent ?? ""));
  if (!table) return [];

  const rows = Array.from(table.querySelectorAll("tr")).slice(1); // skip header row
  return rows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll("td")).map((c) => c.textContent?.trim() ?? "");
      return { severity: cells[0] ?? "", reward: cells[1] ?? "" };
    })
    .filter((r) => r.severity || r.reward)
    .slice(0, 20);
}

function findNextTable(heading: Element): HTMLTableElement | null {
  let node: Element | null = heading.nextElementSibling;
  let guard = 0;
  while (node && guard < 20) {
    guard++;
    if (node.tagName === "TABLE") return node as HTMLTableElement;
    const nested = node.querySelector?.("table");
    if (nested) return nested as HTMLTableElement;
    node = node.nextElementSibling;
  }
  return null;
}
