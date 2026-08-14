# Accessibility Audit — Module 15, Task #349

**Target standard**: WCAG 2.1 AA. `PROJECT_SPEC.md` only says "Ensure
accessibility" (line 687) with no level or per-platform detail specified,
so this audit adopts WCAG 2.1 AA as the de facto bar — it's the standard
most enterprise procurement/compliance checklists expect, and it's
achievable without a ground-up redesign.

**Scope**: same posture as the i18n architecture pass (task #348) — this
is a real audit with real fixes to representative components across all
three interactive surfaces (`apps/web`, `apps/desktop`, `apps/mobile`),
not a claim that every screen has been individually audited and fixed.
`apps/api` is out of scope (no UI).

## Method

1. Checked for existing a11y tooling/linting (`eslint-plugin-jsx-a11y`,
   `axe-core`, etc.) — none present in any app.
2. Sampled representative interactive components per surface: a data
   table, a form with a custom Select, an icon-only button, primary
   navigation, and one hand-rolled modal/overlay.
3. Computed WCAG contrast ratios for every foreground/background color
   pair in `apps/web`'s design tokens (see below) — not a visual guess.
4. Checked `apps/mobile`'s prior self-assessment
   (`docs/modules/12-mobile-application.md` §20) against the actual code.

## Findings and fixes

### apps/web

| Finding | File | Fix |
|---|---|---|
| Empty `<TableHead />` on the favorites column has no accessible name | `features/projects/components/project-table.tsx` | Added `<span className="sr-only">Favorite</span>` |
| Favorite-star icon conveys state (filled/outline) with no text alternative | same file | `aria-hidden` on the icon + an `sr-only` "Favorite"/"Not favorite" span |
| `<Label>Status</Label>` not programmatically associated with the Select trigger next to it | `features/projects/components/project-form.tsx` | `id="status-label"` on the Label + `aria-labelledby="status-label"` on `SelectTrigger` |
| Sidebar `<nav>` has no accessible name, ambiguous if a page adds a second nav landmark | `components/layout/sidebar.tsx` | `aria-label="Main"` |
| `<html lang="en">` is hardcoded and never follows the active locale (task #348 added Uzbek/Russian) | `app/layout.tsx` (static) + `features/i18n/i18n-context.tsx` (fix) | `I18nProvider` now sets `document.documentElement.lang` in an effect whenever the locale changes — same "settle after mount" pattern `next-themes` already uses for the `class` attribute on the same element (both rely on the `suppressHydrationWarning` already present) |
| No skip-to-content link anywhere in the app | — | **Not fixed this pass** — tracked below |
| shadcn/Radix-based components (`Dialog`, `DropdownMenu`, `Button`, `Select`, etc.) | `components/ui/*` | Already solid — Radix primitives provide focus trapping, `Escape`-to-close, and correct ARIA roles out of the box. No changes needed. |

**Color contrast** (`app/globals.css` design tokens) — computed via a
from-scratch OKLCH → linear-sRGB → WCAG relative-luminance → contrast-ratio
implementation (not eyeballed), run against every foreground/background
pair in both themes:

| Pair | Ratio | AA normal text (≥4.5:1) | AA large text/UI (≥3:1) |
|---|---|---|---|
| Light: foreground / background | 19.79:1 | PASS | PASS |
| Light: muted-foreground / background | 6.00:1 | PASS | PASS |
| Light: muted-foreground / muted | 5.34:1 | PASS | PASS |
| Light: primary-foreground / primary | 6.68:1 | PASS | PASS |
| Light: secondary-foreground / secondary | 16.12:1 | PASS | PASS |
| Light: destructive-foreground / destructive | **4.50:1** | PASS (exactly at the line) | PASS |
| Light: warning-foreground / warning | 8.02:1 | PASS | PASS |
| Dark: foreground / background | 17.72:1 | PASS | PASS |
| Dark: muted-foreground / background | 6.15:1 | PASS | PASS |
| Dark: muted-foreground / muted | 5.22:1 | PASS | PASS |
| Dark: primary-foreground / primary | 6.79:1 | PASS | PASS |
| Dark: warning-foreground / warning | 8.81:1 | PASS | PASS |

Every pair passes AA. One flag: **light-mode destructive text sits at
exactly 4.50:1** — right at the AA threshold with no safety margin (a
half-percent rendering/rounding difference in a given browser's color
pipeline could tip it under). Recommend nudging `--destructive-foreground`
very slightly lighter or `--destructive` very slightly darker in a future
design pass; not changed here since color-token edits affect the whole
visual identity and deserve design sign-off rather than a silent tweak
inside an accessibility task.

### apps/desktop

| Finding | File | Fix |
|---|---|---|
| No explicit `:focus-visible` style anywhere in the shared UI kit — relies entirely on each browser's default outline | `src/components/ui.tsx` (`Button`) | Added an explicit `outline: 2px solid var(--color-primary)` on `:focus-visible` |
| Command palette overlay has no `role="dialog"`/`aria-modal`, so screen readers don't announce it as a modal | `src/app/CommandPalette.tsx` | Added `role="dialog" aria-modal="true" aria-label="Command palette"` on the panel |
| Filtered command list has no combobox/listbox semantics — the input drives a keyboard-navigable list with no ARIA relationship declared | same file | Full ARIA 1.2 combobox pattern: `role="combobox"` + `aria-expanded`/`aria-controls`/`aria-activedescendant`/`aria-autocomplete` on the input; `role="listbox"` on the results container; `role="option"` + `aria-selected` on each row |
| No central Modal/Dropdown component exists in `components/ui.tsx` — every feature hand-rolls its own overlay | — | **Not fixed this pass** — see "Known gaps" below |

### apps/mobile (Flutter)

Prior self-assessment (`docs/modules/12-mobile-application.md` §20) was
directionally accurate — the app is built on standard Material widgets
(`Text`/`ListTile`/`ElevatedButton`/`Chip`), which inherit Flutter's
built-in `Semantics`/text-scale/RTL support, and several icon-only buttons
already have `tooltip:` set (password visibility, notifications bell,
voice mic). One real gap found and fixed:

| Finding | File | Fix |
|---|---|---|
| Favorite-toggle `IconButton` (star/star_border) has no `tooltip`, so it has no accessible name at all — same gap as the equivalent web component | `features/projects/presentation/widgets/project_card.dart` | Added `tooltip: project.isFavorite ? 'Remove from favorites' : 'Add to favorites'` |

No `flutter analyze` run possible in this sandbox (no Flutter SDK/network
path to the artifact host — the same disclosed constraint since Module 12)
— verified by manual read of the diff.

## Known gaps (tracked, not silently dropped)

- **No skip-to-content link** in `apps/web`. A real gap for keyboard users
  on pages with a long sidebar before the main content — worth adding to
  the root layout in a follow-up.
- **`apps/desktop` has no central Modal/Dropdown component**, so every
  feature-level overlay (settings dialogs, confirmation prompts, etc.
  outside `CommandPalette`) has unknown, unaudited a11y coverage — this
  pass fixed the one hand-rolled overlay sampled (`CommandPalette`) as a
  reference, not every overlay in the app.
- **No `eslint-plugin-jsx-a11y`** (or equivalent for desktop) wired into
  CI — regressions in newly-written components won't be caught
  automatically. Recommended for a follow-up, not added in this pass to
  avoid an unverified new dependency install (see the eslint tooling
  incident noted in task #348's completion record, which independently
  argues for caution here this session).
- **Light-mode destructive-text contrast sits exactly at the AA
  threshold** (4.50:1) — flagged above, not changed without design
  sign-off.
- **No manual screen-reader testing** (VoiceOver/NVDA/TalkBack) was
  performed — this audit is based on ARIA/semantic-HTML correctness and
  computed contrast ratios, not a live assistive-technology pass. Real
  screen-reader testing is the natural next step before claiming full AA
  conformance.
- **Full component-by-component coverage** across all three apps is out
  of scope for this task, consistent with the project's standing rule
  against rewriting previously-shipped modules wholesale — the fixes
  above are real, verified, representative examples per surface plus a
  documented target for future contributors, not a claim of exhaustive
  coverage.
