# Final Architecture Review — PentestHub AI, Modules 1-10

Reviewer stance: Staff Architect, end-of-program gate after Module 10
(Enterprise Platform + SaaS + Global Infrastructure). Scope: the whole
platform — `apps/api` (NestJS modular monolith), `apps/web` (Next.js),
`apps/desktop` (Tauri/Rust), `apps/browser-extension` +
`extensions/burp`, `packages/*`, `sdks/*`, `deploy/*`. This is a design
and structure review, not a line-by-line audit — see the companion
Security Review (0003) and Performance Review (0004) for those angles.
No code was modified to produce this report; findings are evidence-based
against the current source (file paths cited inline).

**Headline**: the architecture holds together across ten modules and four
client surfaces without the kind of accumulated inconsistency that usually
shows up by module 6-7 in a project this size — the CQRS-over-Prisma
pattern, the additive-schema discipline, and the shared-DTO-single-source-
of-truth rule were genuinely followed throughout, not just stated once and
abandoned. The real architectural risk at this point isn't structural rot,
it's **scope**: fourteen Module 10 subsystems were built in one pass with
no live database, no working `pnpm install`, and no CI, which is an
unusual way to build production infrastructure and the one fact every
other finding in this report should be read in light of.

---

## 1. Overall shape

Layering is consistent end-to-end: `Controller → Command/QueryBus →
Handler → Repository interface (DI token) → Prisma adapter → Postgres`,
with `EventBus` as the cross-module integration seam (Activity Timeline,
webhooks, notifications all subscribe to the same domain events rather
than being called directly by the module that raises them). This
decision, made in Module 1 and never revisited, is what let Module 10 add
webhook dispatch and workflow triggering as pure `@EventsHandler`
additions with zero changes to the ~9 modules whose events they subscribe
to.

Nine feature-module boundaries under `apps/api/src/modules/` grew to
roughly 40 by Module 10; every one of them still follows either the full
repository-interface pattern (entities reused across multiple call sites)
or the simpler direct-`PrismaService`-injection pattern Module 9
consciously introduced for simple CRUD entities (see ADR 0009 §2) — no
third, undocumented pattern crept in. That consistency is a genuine
achievement at this scale and the main reason this review has few
structural findings.

## 2. Multi-tenancy: two boundaries, cleanly separated

`Workspace` (Module 1) and `Organization` (Module 10) are two different
tenant concepts that coexist rather than one replacing the other — see
ADR 0010 §1. This is the correct design (a workspace can exist with no
organization; features that need organization scope declare it
explicitly) but it does mean two authorization models exist side by side
now: workspace membership (`WorkspaceMember`, checked via guards
established in Module 1) and organization membership (`OrganizationMember`,
checked via Module 10's own guards). **[MEDIUM]** There is no single
document that says, for a new engineer, "here is the decision tree for
which scope a new route should check" — `docs/security/permission-matrix.md`
(Module 9) covers workspace-level roles in detail but wasn't extended for
organization-level roles introduced in Module 10. Fix before onboarding a
second engineer: recommended, not urgent.

## 3. The distributed job system vs. the Desktop Agent: two execution models, deliberately

Module 3/4's `ReconJobPollerService`/scanner execution and Module 10's
`DistributedJob`/`WorkerNode` system look superficially similar (both are
claim-based Postgres work queues) but serve different purposes: the
former is single-workspace tool orchestration, the latter is a
general-purpose multi-tenant job queue for arbitrary Module 10 workloads
(see `distributed-jobs.module.ts`). **[LOW]** These were never unified,
and ADR 0010 doesn't explicitly address whether they should be — a future
module that wants to route recon/vuln jobs through the new distributed
queue instead of the original poller would need to make that call
without documented guidance. Worth a paragraph in a future ADR if that
consolidation is ever pursued; not a defect today, since the two systems
don't conflict or duplicate state.

Separately, Module 7's Local-First migration moved recon/vuln tool
*execution* to the Desktop Agent while Module 10's distributed job system
adds a third, server-side execution path back. **[LOW, worth flagging
explicitly]** This is not a contradiction — the Local-First migration
report (`docs/migration/local-first-architecture-migration.md`) always
scoped itself to Modules 3/4/6's *existing* tool execution, and Module
10's distributed queue is general-purpose infrastructure other Module 10
features (plugin hooks, integration actions) can use, not a re-centralization
of recon/vuln scanning specifically. But the two decisions were made five
modules apart by the same author with no cross-reference between them —
a reader encountering both ADRs independently could reasonably wonder if
the platform's execution-location story is coherent. Recommend a short
cross-reference note in ADR 0010 §2 (or a follow-up ADR) stating this
explicitly.

## 4. Plugin Marketplace: a real architectural gap, correctly disclosed

`Plugin`/`PluginInstallation`'s permission model is real and enforced (an
admin must accept declared permissions before install), but hook
execution runs in-process with no separate sandbox — see ADR 0010 §3.
**[HIGH, already disclosed]** This is the one Module 10 subsystem where
the gap between "what the data model implies" (a marketplace of
third-party plugins) and "what the implementation actually isolates"
(nothing — it's an honor-system contract) is architecturally significant,
not just a missing feature. A plugin marketplace with in-process
execution is a meaningfully different (and much higher-risk) product than
one with real isolation; this should be treated as blocking before any
plugin from an untrusted author is installed in a production deployment,
not as a nice-to-have hardening pass. Credit where due: this is disclosed
prominently in ADR 0010 and the module doc, not buried — the review's
finding is about the underlying architecture, not about disclosure
quality.

## 5. Webhook/Workflow/Compliance pollers: HA fixed after the fact, correctly

Seven background pollers were added across Modules 9-10 before
`PollerLeaseService` existed, each independently — meaning the "safe at N
replicas" property was retrofitted uniformly in one pass (ADR 0010 §11)
rather than designed in from the first poller. **[LOW]** This worked out
cleanly here because every poller already followed the same
`OnModuleInit`/`setInterval`/`tick()` shape, so the retrofit was
mechanical — but it's worth noting for future modules that a "will this
run on N replicas" question belongs in the *first* poller's design
review, not as a dedicated Module 10 subsystem five services later. Not a
current defect; a process note for whoever designs poller #8.

## 6. API Platform: three protocols is real surface area to keep in sync

REST (Modules 1-9), GraphQL (Module 10), and three SDKs all sit on top of
`packages/shared`'s DTOs — a good single-source-of-truth decision (ADR
0010 §6). **[MEDIUM]** But nothing *enforces* that GraphQL resolvers and
REST controllers stay behaviorally identical (same authorization checks,
same validation) beyond code review discipline — there's no shared test
suite asserting "a request that succeeds via REST also succeeds via
GraphQL for the same user/resource," and none of the three SDKs have an
automated contract test against the live API (the Go SDK's `client_test.go`
tests against a local httptest server with hand-written fixtures, not the
real API). This is a real gap for a three-protocol platform, though not
one this module's scope can reasonably close — flagging as the concrete
next architectural investment once the API surface stabilizes.

## 7. Dependency additions: consistent, disclosed policy — with one exception

Every module since Module 5 has held to "prefer zero new dependencies;
when one is unavoidable, disclose that it wasn't `pnpm install`-verified
in this sandbox." Module 10 held this line for `@opentelemetry/*`
(disclosed in `tracing.ts`) but the pattern itself — building a
architecturally significant, wire-protocol-implementing subsystem
(distributed tracing) on a dependency nobody in this project's history has
ever actually run — is now five-plus dependencies deep across GraphQL,
tracing, and earlier modules' additions. **[MEDIUM]** This is a reasonable
trade-off for a single sandboxed authoring pass, but it means the
*first* real verification these dependencies get is whatever CI run
happens after this commit — `docs/adr/0010-enterprise-platform.md`'s
Consequences section already says this plainly; repeating it here because
an architecture review is exactly the place a reader should be pointed at
that risk before treating any Module 10 subsystem as load-bearing.

## 8. What's genuinely solid

- **Additive-only schema discipline held for ten modules straight** — zero
  renamed/dropped columns anywhere in `schema.prisma`'s ~3,800 lines. This
  is the single most consequential architectural decision in the whole
  project and it was never violated even under Module 10's scope pressure.
- **The CQRS/EventBus seam scales.** Ten modules of features were added
  to a shared event stream without any module needing to know about
  another module's internals — Module 10's `WebhookDispatchHandler`
  subscribing to ~25 event classes across 9 different modules with zero
  changes to any of those modules is the clearest evidence this pattern
  paid for itself.
- **The "disclosed narrower scope" convention** (recon/scan steps
  recording intent rather than fabricating jobs; Plugin sandboxing being
  contractual; Compliance auto-deletion covering two resource types) is
  applied consistently enough across ten modules that it reads as a real
  engineering norm for this codebase, not an excuse invoked once.

## 9. Recommended next steps, ranked

1. **[HIGH]** Design and implement real plugin execution isolation (§4)
   before any untrusted third-party plugin is installed in production.
2. **[MEDIUM]** Write the organization-level equivalent of
   `docs/security/permission-matrix.md` (§2).
3. **[MEDIUM]** Add at least one cross-protocol contract test (REST vs.
   GraphQL vs. one SDK) for a representative resource (§6).
4. **[LOW]** Add the recon/vuln-execution-location cross-reference note
   between ADR 0007 and ADR 0010 (§3).
5. Run `ci.yml` for real and treat every dependency added since Module 5
   as unverified until it does (§7) — this isn't a code change, it's the
   verification step every other finding in this report is implicitly
   conditioned on.
