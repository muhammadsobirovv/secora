/// Module 15 — task #347 "Telemetry — opt-in, privacy-aware framework".
///
/// Dual-gated, deliberately coarse: the operator must set
/// `TELEMETRY_ENABLED=true` (default false — see env.validation.ts) AND an
/// individual user hasn't set `UserPreferences.telemetryOptOut` (task
/// #342) before any of their activity is even counted. What's ultimately
/// sent to `TELEMETRY_ENDPOINT` is a single periodic aggregate ping per
/// deployment instance — anonymous feature-usage *counts*, never
/// per-event records, never a userId, IP, email, workspace name, or any
/// other identifying/content field. See
/// apps/api/src/modules/telemetry/telemetry-collector.service.ts for the
/// collector this DTO is produced by, and
/// docs/compliance/gdpr-readiness.md's telemetry row for the
/// privacy framing this shape is designed to satisfy.
export interface TelemetryPingDto {
  /// A one-way hash derived from data already in the deployment's own
  /// database (see the collector's doc comment for exactly what) — lets
  /// the maintainers tell "one instance pinging repeatedly" apart from
  /// "many different instances," without that hash being reversible back
  /// to any real identifier.
  instanceId: string;
  edition: "community" | "enterprise";
  /// From the API process's own `package.json` version — which release
  /// is this usage coming from, nothing more specific than that.
  platformVersion: string;
  periodStart: string;
  periodEnd: string;
  /// `"<ENTITY_TYPE>:<verb>"` (e.g. `"RECON_JOB:created"`) → count over
  /// the period. The closed set of entity types/verbs actually wired is
  /// deliberately small — see `TelemetryRecordingHandler`'s
  /// `@EventsHandler(...)` list — not a general-purpose analytics event
  /// catalog.
  featureCounts: Record<string, number>;
}
