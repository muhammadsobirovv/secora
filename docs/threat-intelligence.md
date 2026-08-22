# Threat Intelligence

Module 17. Indicators, threat actors/campaigns, matches against workspace
targets, and two import paths — a manual STIX 2.1 Bundle import
(`StixTaxiiService`) and a Community-Edition-friendly public-feed
adapter (`ThreatIntelProviderService`).

## Community Edition guarantee

No paid threat-intelligence API is required. `ThreatIntelProviderService`
defaults `THREAT_INTEL_PROVIDER` to `none`, in which case
`POST /intel/refresh` throws `THREAT_INTEL_PROVIDER_NOT_CONFIGURED`
rather than silently no-op'ing. When set to `cisa_kev` (the one
supported free/public feed in this release), it fetches CISA's
Known Exploited Vulnerabilities catalog over plain HTTPS, no API key.
Workspaces that want more than that can always import indicators
manually — via `POST /intel/indicators` one at a time, or in bulk via
`POST /intel/import/stix` (any STIX 2.1 Bundle, including ones
exported from a local MISP instance, a paid feed the workspace already
has separately, or hand-written JSON).

## STIX/TAXII import safety

`StixTaxiiService.importBundle` treats every object in an imported
bundle as untrusted external data (see task #493's fencing-utility doc
comment for the broader trust-boundary discussion):

- A non-Bundle payload, or a bundle whose `objects` field isn't an
  array, is rejected outright (`THREAT_INTEL_IMPORT_INVALID`) before
  anything is processed.
- Each object is handled independently — a malformed, oversized, or
  unrecognized-type object is counted in `rejectedCount` rather than
  aborting the whole import or throwing to the caller.
- String fields (descriptions, names) are truncated to
  `MAX_STRING_FIELD_LENGTH` (4000 chars) rather than stored unbounded.
- Imported content is always scoped to the importing workspace
  (`workspaceId` is never `null` for a STIX import) — global/public
  visibility (`workspaceId: null`) is reserved exclusively for the
  built-in public-feed adapters in `ThreatIntelProviderService`.
- The resulting `ThreatIntelImportLog.status` is `SUCCEEDED` (0
  rejected), `PARTIAL` (some imported, some rejected), or `FAILED` (0
  imported) — never silently reported as success when anything failed.

Covered by `stix-taxii.service.spec.ts` and
`threat-intel-provider.service.spec.ts` (task #496).

## Matching

`ThreatMatchService` correlates active indicators against a workspace's
known targets/assets (IPs, domains, hashes seen in scan results) and
records a `ThreatMatch` row with a `confidence` score. The
`ThreatMatch.targetId, confidence` composite index (task #495) keeps
"highest-confidence matches for this target" queries — the dashboard's
and the report's primary read pattern — index-only.

## Performance

Every list endpoint below (`indicators`, `actors`, `campaigns`,
`matches`) caps at 200 rows per call and requires a `workspaceId` (or,
for public-feed indicators, is explicitly workspace-null) — there is no
unscoped "list everything" query path.

## Endpoints (`THREAT_INTEL_ENDPOINTS`)

| Purpose | Route |
|---|---|
| List indicators | `GET intel/indicators` |
| Create indicator | `POST intel/indicators` |
| List threat actors | `GET intel/actors` |
| List campaigns | `GET intel/campaigns` |
| List matches | `GET intel/matches` |
| Import STIX bundle | `POST intel/import/stix` |
| Refresh public feed | `POST intel/refresh` |
| Import log history | `GET intel/import-logs` |

## CLI / SDK

- CLI: `pentesthub intel indicators list`, `pentesthub intel import
  --file bundle.json`, `pentesthub intel refresh`
- SDK: `client.threatIntel.*` (TypeScript/Python/Go)
