# Bug Bounty Workflow

The bug bounty workspace keeps programs, scope, findings and reports together, from first recon to payout.

## 1. Import a program and its scope

Go to **Bug Bounty → Programs → Import**. You can import a program from a supported platform format (HackerOne, Bugcrowd, Intigriti, YesWeHack, Synack) or create an internal, private or custom program by hand.

The importer reads the program's **in-scope** and **out-of-scope** rules. When a program is re-imported, changes to its scope are detected so you can review them.

Targets linked to an imported program are authorized on the basis of the program's published scope (**Bug bounty scope**). This covers only what the program lists as in scope — always re-read the program's rules, exclusions and safe-harbor terms before testing.

## 2. Check scope before you test

Every target has a scope status:

- **In scope** — covered by your authorization or the program's scope.
- **Out of scope** — explicitly excluded. Scans are refused.
- **Pending review** — not yet confirmed. Automated tools are refused until you review it.

An out-of-scope rule always wins over an in-scope rule.

## 3. Track findings

Create a finding from scan results or by hand. Each finding has a lifecycle (for example draft, submitted, triaged, resolved), a severity, and an optional CVSS 3.1 score from the built-in calculator. Possible duplicates of earlier findings are flagged so you do not report the same issue twice.

## 4. Build a report

Open a finding and choose **Create report**. Reports can use custom templates. The AI report assistant can draft a summary or review grammar and technical clarity, but it never changes code, payloads or URLs — review every AI suggestion before you submit.

Track submissions, status changes and rewards for each program in one place.

## Tips

- Keep evidence (screenshots, request/response pairs) attached to the finding.
- Redact personal data and secrets from evidence before sharing it.
- Stop and report as soon as you can show impact; do not go further than needed.
