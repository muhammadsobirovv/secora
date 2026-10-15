# Module 20 — Phases 22-24: Release Engineering, Changelog, Final Test Matrix

## Phase 22: Version bump to 1.0.0

`docs/architecture/release-engineering.md`'s own versioning policy
states: "the first `1.0.0` is expected once Module 16+ work settles the
plugin/API-versioning surfaces already built in Module 13/15." Module 20
is explicitly the final module of the core development roadmap — the
condition that policy anticipated is now met, and there is no later
module in which to make this call. This is applying a decision the
project already made for itself, not a new one.

No breaking API change accompanies this bump. `docs/architecture/api-gateway.md`'s
additive-only, no-URI-versioning policy (reaffirmed in
`docs/reviews/0029-...md`, Phase 15) means `1.0.0` here declares
stability of what already exists rather than introducing a break assumed
by semver's "1.0.0 = first stable public API" convention — consistent
with how this project has used `0.x` MINOR bumps to track module number
rather than breaking changes throughout its history.

**Bumped** (root/`package.json`-driven "publishable surface" version, per
the policy's own list plus every other package with an independent
version field, since none of them are meant to trail the root):

- `package.json` (root), `apps/api/package.json`, `apps/web/package.json`
- `packages/cli/package.json`, `packages/sdk-typescript/package.json`,
  `packages/agent-sdk/package.json`
- `sdks/python/pyproject.toml` and `sdks/python/pentesthub_ai/__init__.py`'s
  `__version__` (kept in sync — both existed and disagreed with each
  other at `0.1.0` before this pass in the sense that only one of them
  would have been bumped by habit; both are updated together here)
- `apps/desktop/src-tauri/Cargo.toml`

**Deliberately not touched**:

- `sdks/go/go.mod` — Go modules don't carry a semantic product version
  in `go.mod` (only a language-version directive, `go 1.21`); Go module
  versioning is done via git tags at publish time, which is a Phase 40-45
  (final release tagging) concern, not a file edit.
- `apps/mobile/pubspec.yaml` — already at `1.0.0+1`, independent of the
  monorepo's module-tracking scheme since app-store versioning
  conventions (and Flutter's own scaffolding default) are their own
  concern; changing it now would not be "keeping it in step," it would
  be overwriting a pre-existing, unrelated decision. Left as-is.
- `packages/shared` and other internal-only workspace packages — the
  policy explicitly excludes these ("never published standalone").

## Phase 23: Changelog backfill

`CHANGELOG.md` had zero entries for Modules 16 through 19 despite each
having a complete `docs/releases/module-N-release-notes.md`. This was a
real, previously-undisclosed gap against the release-engineering policy's
own stated commitment ("changelog and release notes are maintained
together at the point a module is considered complete") — it wasn't
maintained together for four modules in a row.

**Fixed**: backfilled `## [0.16.0]` through `## [0.19.0]` entries,
written at the same terseness level as the existing `0.9.0`-`0.14.0`
entries (a short paragraph per module, pointing at the full release-notes
file), sourced from each module's own release-notes document rather than
reconstructed from memory. Added a new `## [1.0.0]` entry at the top
covering Module 20's own concrete changes (API-keys SDK/CLI parity,
RECON_JOBS/SCANNER_JOBS quota enforcement, Stripe webhook ordering fix,
deployment env-var fixes, the new root `LICENSE`) plus the two
documented-not-fixed limitations carried forward from Phase 16's review
(QUOTA_EXCEEDED 403-vs-429, quota check-then-act race), so a changelog
reader sees the same honest disclosure the dedicated review docs already
contain rather than a sanitized summary.

## Phase 24: Final test matrix

Given this phase's changes are exclusively version-string edits across
`package.json`/`pyproject.toml`/`Cargo.toml`/`__init__.py` plus two
markdown files (`CHANGELOG.md`, `SECURITY.md`) — no source code changed —
the risk surface is narrow. Verification performed:

- **JSON validity**: every edited `package.json` parsed successfully
  with `python3 -c "import json; json.load(...)"` after the edit — a
  sed-based version-string replacement is the kind of change that can
  silently corrupt JSON if it touches more than intended; confirmed it
  didn't.
- **TOML content check**: confirmed `version = "1.0.0"` landed correctly
  in both `sdks/python/pyproject.toml` and
  `apps/desktop/src-tauri/Cargo.toml`.
- **Python SDK live verification**: `import pentesthub_ai` and confirmed
  `pentesthub_ai.__version__ == "1.0.0"`; instantiated `SecoraClient`
  and confirmed `.api_keys` is still present (no accidental breakage from
  the `__init__.py` edit); re-ran the existing `tests/test_client.py`
  suite — **5/5 passed**, unchanged from Phase 16-17's verification.
- **`git status`** after all edits: confirmed only the intended 11 files
  changed (`CHANGELOG.md`, `SECURITY.md`, 6 `package.json` files,
  `Cargo.toml`, `pyproject.toml`, `__init__.py`) — no stray edits from
  the `sed` commands used for the bulk version bumps.
- TypeScript/Go/`apps/api` compiler verification was not re-run this
  phase since no `.ts`/`.go`/`.rs` source file changed — only version
  metadata fields, which no compiler check exercises. This is consistent
  with the standing rule to verify what actually changed rather than
  re-running a full-project check disproportionate to the edit.

## Related docs

- `docs/architecture/release-engineering.md` — the versioning/changelog
  policy this phase applies.
- `CHANGELOG.md`, `SECURITY.md` — edited this phase.
- `docs/reviews/0027` through `0030` — this module's earlier phase
  write-ups, referenced from the new `[1.0.0]` changelog entry.
