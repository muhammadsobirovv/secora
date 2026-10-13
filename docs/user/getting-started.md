# Getting Started

PentestHub AI is a workspace for authorized security testing: reconnaissance, vulnerability scanning, a bug bounty workflow and an AI copilot, in one place. This guide takes you from a new account to your first target.

> **Authorized testing only.** Only add and scan assets you own or are explicitly authorized in writing to test. See [Rules of Engagement & Responsible Use](/docs/responsible-use) and the [Acceptable Use Policy](/legal/acceptable-use).

## 1. Create an account

1. Open [secora.group](https://secora.group) and choose **Get started free**, or sign in with Google or GitHub.
2. Read and accept the Terms of Service, Acceptable Use Policy and Privacy Policy. Registration cannot be completed without this.
3. If you signed up with email and password, confirm your address with the link we send you.

When the legal documents change, you will be asked to review and accept the new version the next time you sign in.

## 2. Your first workspace

Every account starts with a personal **workspace**. A workspace holds your projects, targets, findings and team members, and it is the boundary for permissions and AI settings.

- Rename it under **Settings → Workspace**.
- Invite teammates from the **Workspace** page and give each one the least privilege they need.

## 3. Create a project

Projects group the work for one engagement, client or bug bounty program. Go to **Projects → New project**, give it a name and, optionally, a description.

## 4. Add your first target

A **target** is an asset you are allowed to test: a domain, subdomain, URL, IP address or CIDR range.

1. Open your project and choose **Add target**.
2. Pick the target type and enter the value (for example `example.com`).
3. Choose how you are authorized to test it:
   - **I own this asset**
   - **Written permission** — a client contract or signed Rules of Engagement. You can add a reference (for example a contract number) and notes.
   - **Bug bounty scope** — the asset is in scope for a linked bug bounty program.
4. Confirm the attestation checkbox. You can set an expiry date for the authorization; by default it is valid for 12 months.
5. Set the scope status to **In scope** once you have confirmed the asset is covered.

Active scans are blocked until the target has a valid, unexpired authorization. Private, internal and certain government or military addresses cannot be actively scanned from the hosted service.

## Next steps

- [Scanning guide](/docs/scanning) — run recon and vulnerability scans and read the results.
- [Bug bounty workflow](/docs/bug-bounty) — import a program and report findings.
- [AI Copilot](/docs/ai-copilot) — connect your own AI provider key.
