// Module 15 — Public API v1 versioning layer (task #335).
//
// This platform's existing REST surface (every controller shipped in
// Modules 1-14) keeps its current, unversioned paths — retrofitting a
// `/v1/` URL prefix onto every route would break every existing web/
// mobile/desktop client and both published SDKs (Python, Go — Module 10)
// with no corresponding benefit, and the standing Module 15 instruction
// is "do not rewrite previous modules except where integration or bug
// fixing is required." Instead, this is a *version negotiation* layer:
// every response carries an `X-API-Version` header declaring what
// version served it, a caller MAY send `X-API-Version` to request a
// specific version (rejected with `API_VERSION_UNSUPPORTED` if this
// server doesn't support it, rather than silently ignored), and
// `GET public-api/version` is a machine-readable discovery endpoint.
// Today there is exactly one version ("1") — this is the seam a future
// v2 introduces through, not a retroactive rewrite of v1.

export const CURRENT_API_VERSION = "1";
export const SUPPORTED_API_VERSIONS = ["1"] as const;
export type ApiVersion = (typeof SUPPORTED_API_VERSIONS)[number];

export const API_VERSION_HEADER = "X-API-Version";

export interface ApiVersionInfoDto {
  currentVersion: ApiVersion;
  supportedVersions: ApiVersion[];
  /// Empty today — populated the day a version is first deprecated, each
  /// entry carrying the sunset date callers should plan a migration
  /// around.
  deprecatedVersions: { version: ApiVersion; sunsetDate: string }[];
}
