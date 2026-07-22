// Module 10 — Native Integrations. One `IntegrationConnection` per
// (organization|workspace, provider); every provider is optional (BYOK-
// style — same posture as Phase 1's AI provider credentials). See
// docs/adr/0010-enterprise-platform.md §Integrations for the adapter
// framework and per-provider action scope.

export type IntegrationProvider =
  | "GITHUB"
  | "GITLAB"
  | "JIRA"
  | "LINEAR"
  | "SLACK"
  | "DISCORD"
  | "MS_TEAMS"
  | "TELEGRAM"
  | "NOTION"
  | "OBSIDIAN"
  | "GOOGLE_DRIVE"
  | "DROPBOX"
  | "AWS"
  | "AZURE"
  | "GCP";

export type IntegrationConnectionStatus = "CONNECTED" | "ERROR" | "DISCONNECTED";

export interface IntegrationConnectionDto {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  provider: IntegrationProvider;
  displayName: string | null;
  config: Record<string, unknown> | null;
  status: IntegrationConnectionStatus;
  connectedBy: string;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/// Token/PAT-based connect — used by providers without (or not requiring)
/// an OAuth authorization-code flow: Jira/Linear (API token), Telegram
/// (bot token), Obsidian (local REST API key), AWS/Azure/GCP (access
/// key/PAT/service-account token). OAuth-capable providers
/// (GitHub/GitLab/Slack/Discord/MS Teams/Google/Dropbox/Notion) instead
/// use `StartOAuthConnection`/`CompleteOAuthConnection` below, though a
/// personal access token still works for them too where the provider
/// supports it (GitHub/GitLab PATs, Notion internal integration tokens).
export interface ConnectIntegrationRequestDto {
  provider: IntegrationProvider;
  workspaceId?: string;
  displayName?: string;
  token: string;
  config?: Record<string, unknown>;
}

export interface UpdateIntegrationConnectionRequestDto {
  displayName?: string;
  token?: string;
  config?: Record<string, unknown>;
}

export interface StartOAuthConnectionRequestDto {
  provider: IntegrationProvider;
  workspaceId?: string;
}

export interface StartOAuthConnectionResultDto {
  authorizeUrl: string;
  state: string;
}

export interface CompleteOAuthConnectionRequestDto {
  provider: IntegrationProvider;
  code: string;
  state: string;
  workspaceId?: string;
}

export interface TestIntegrationConnectionResultDto {
  ok: boolean;
  message: string;
}

export interface ExecuteIntegrationActionRequestDto {
  action: string;
  payload: Record<string, unknown>;
}

export interface ExecuteIntegrationActionResultDto {
  ok: boolean;
  data: unknown;
}

export interface IntegrationCapabilityDto {
  provider: IntegrationProvider;
  actions: string[];
  authMethod: "OAUTH2" | "TOKEN";
}
