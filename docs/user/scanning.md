# Scanning Guide

Secora runs recon and vulnerability tools against your targets and turns the output into findings you can review and fix.

> Before a scan, the target needs a valid authorization and the scope status **In scope** (see [Getting Started](/docs/getting-started#3-add-your-first-target)).

## Recon

Recon finds what is exposed: subdomains, open ports, pages and technologies. To start, open a target, choose **Recon → New job**, pick the tools and start. Progress and logs update live, and you can cancel anytime.

| Type | What it does | Needs |
|---|---|---|
| **Passive** | Reads public sources only (certificate logs, archives, DNS, WHOIS). Sends no traffic to the target. | Target in scope |
| **Active** | Connects to the target: probes ports, requests pages, crawls. | In scope and a valid authorization |

If one tool fails, the rest of the job still runs.

## Vulnerability scans

Vulnerability scans look for known weaknesses and are always **active**, so they need a valid authorization. Keep intensity reasonable, and never run load or denial-of-service tests without written permission.

## Reading findings

Each finding shows what was found, which tool found it, and when. Duplicates from several tools are merged.

| Severity | Meaning |
|---|---|
| **Critical** | Easy, direct compromise (for example remote code execution). |
| **High** | Serious impact, fix soon. |
| **Medium** | Real risk that needs extra conditions. |
| **Low** | Limited impact. |
| **Info** | Context only, not a vulnerability. |

Scanners can be wrong. Check a finding by hand before you act on it or report it.

## Next steps

Ask the [AI Copilot](/docs/ai-copilot) to explain a finding and suggest a fix. You can also promote a new subdomain to a target in one click (authorize it before scanning).
