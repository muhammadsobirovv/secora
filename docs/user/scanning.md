# Scanning Guide

PentestHub AI runs recon and vulnerability tools against your targets and collects the results as findings you can triage, track and export.

> Before any active scan, the target must have a valid authorization (see [Getting Started](/docs/getting-started#4-add-your-first-target)) and its scope status must be **In scope**. Stay inside the scope, time window and methods you were authorized for.

## Passive and active recon

Recon jobs run one or more tools against a target. They fall into two groups:

| Type | What it does | Examples | Authorization |
|---|---|---|---|
| **Passive** | Queries public sources only (certificate logs, archives, public DNS, WHOIS). Sends no traffic to the target's own services. | subfinder, assetfinder, amass (passive), gau, waybackurls, dnsx, whois, ASN lookup | Target must be in scope |
| **Active** | Connects to the target: probes ports, requests pages, crawls. | httpx, katana, naabu, nmap | In scope **and** a valid, unexpired authorization |

To start a job: open the target, choose **Recon → New job**, select the tools and start. You can follow the job's progress and logs live, and cancel it at any time.

Some tools may be unavailable on the hosted service; a job that requests one records that tool run as failed with a clear message, and the rest of the job still runs.

## Vulnerability scans

Vulnerability scans run scanners such as Nuclei, ffuf, dirsearch, feroxbuster and Nikto. They are always **active**, so they need a valid authorization. Keep scan intensity appropriate for the environment, and never run load or denial-of-service testing without explicit written permission.

## Reading findings

Each finding records what was found, which tool found it, and when. Duplicates reported by several tools are merged into one finding.

Severity follows the usual scale:

| Severity | Meaning |
|---|---|
| **Critical** | Direct, easily exploitable compromise (for example remote code execution or authentication bypass). |
| **High** | Serious impact that needs prompt attention. |
| **Medium** | Real risk that usually needs additional conditions to exploit. |
| **Low** | Limited impact or hard to exploit. |
| **Info** | Useful context, not a vulnerability by itself. |

Always verify a finding manually before reporting it. Scanners produce false positives, and a proof of concept should demonstrate impact without accessing or changing data beyond what is needed.

## Exporting

- Promote a recon finding (for example a newly discovered subdomain) into a new target with one click. Authorize it before you scan it actively.
- Build reports from findings in the [bug bounty workflow](/docs/bug-bounty).
- Use the [API, SDK or CLI](/docs/api-sdk-cli) to export data into your own tooling.
