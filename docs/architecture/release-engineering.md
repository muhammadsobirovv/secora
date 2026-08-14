# Release Engineering — Architecture

Module 15, task #356.

## Versioning policy

Semantic versioning (`MAJOR.MINOR.PATCH`), with this project's own
convention layered on top of it: **MINOR tracks module number**. Module
15's work ships as `0.15.0` — the root `package.json`, `apps/api`, and
`apps/web` all carry this version (previously inconsistent: `apps/api`
was still at `0.0.1`, `apps/web` at `0.1.0`, neither reflecting the 14
modules already shipped). PATCH releases are bug fixes within an already-
shipped module's scope; MAJOR stays `0` until the project declares a
stable public API (consistent with `0.x` semver's "anything may still
change" convention) — the first `1.0.0` is expected once Module 16+ work
settles the plugin/API-versioning surfaces already built in Module 13/15.

Every publishable surface with its own version field
(`apps/api/package.json`, `apps/web/package.json`, `packages/cli`,
`sdks/python`) is kept in step with the root version at release time;
`packages/shared` and other internal-only workspace packages are not
independently versioned (they're never published standalone).

## Release channels

Purely informational at runtime — `RELEASE_CHANNEL`
(`apps/api/src/config/env.validation.ts`, task #356) is surfaced on
`GET /observability/health` and defaults to `stable`. No code path
branches on it; a deployment sets it to label itself for anyone reading
the liveness response (Admin Console, monitoring dashboards, support
tickets that include a diagnostics snapshot — see task #353).

- **`stable`** — every tagged `vX.Y.Z` push. `.github/workflows/release.yml`
  (Module 14, unchanged by this task) re-runs the full verification gate
  against the exact tagged commit, generates an SBOM, and creates a
  GitHub Release with auto-generated notes plus optional npm/PyPI
  publishing.
- **`beta`** — a `vX.Y.Z-beta.N` tag through the same workflow (semver
  pre-release syntax; `docker-publish.yml`'s `v*.*.*` tag trigger already
  matches this pattern). Published as a GitHub *pre-release* — operators
  opt in explicitly rather than beta builds appearing as "latest."
- **`nightly`** — not a new CI workflow (out of scope for this task to
  avoid growing the CI surface without a concrete consumer); documented
  here as the pattern an operator who wants one should follow: a
  scheduled `workflow_dispatch`-triggered build off `main`, tagged
  `nightly` (a moving tag, not semver), published as a pre-release and
  never promoted to `stable` automatically.

## Changelog

`CHANGELOG.md` (repository root) follows the
[Keep a Changelog](https://keepachangelog.com/) format: one `## [version]
- date` section per release, grouped into `Added`/`Changed`/`Fixed`
sub-sections. Given this project's module-based development history, the
changelog's per-module entries are deliberately terser than the
corresponding `docs/releases/module-N-release-notes.md` file — the
changelog is the at-a-glance index; the release notes are the detailed
record. Both are maintained together at the point a module (or a fix
within one) is considered complete.

## What this task did not build

- **No `semantic-release`/`changesets` automation.** Version bumps and
  changelog entries are hand-maintained at each module's completion,
  matching this project's existing "one commit per module" convention
  rather than introducing a new automated-versioning dependency and
  workflow step. A future pass can adopt one if the manual process proves
  a bottleneck.
- **No nightly build workflow file** — documented above as a pattern, not
  implemented, per the Community Edition guarantee's "don't grow
  mandatory CI surface without a concrete need" posture already
  established for Module 14's optional-publish jobs.
