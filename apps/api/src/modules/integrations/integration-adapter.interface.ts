import type { IntegrationProvider } from '@pentesthub/shared';

/// Common contract every provider adapter implements. `credentials` is
/// always the already-decrypted secret (token/access-key) —
/// `IntegrationExecutionService` decrypts `IntegrationConnection.credentials`
/// once (via `credential-encryption.util.ts`, the same AES-256-GCM service
/// every other secret in this codebase uses) before calling into an
/// adapter, so no adapter ever touches ciphertext or the encryption key
/// directly.
export interface IntegrationAdapter {
  readonly provider: IntegrationProvider;
  /// The action names this adapter accepts, surfaced to clients via
  /// `GET /integrations/capabilities` so a UI can build an action picker
  /// without hard-coding per-provider knowledge.
  readonly actions: string[];

  /// A cheap read-only call proving the credential actually works (e.g.
  /// GitHub: GET /user; Slack: auth.test) — used by both
  /// `TestIntegrationConnectionHandler` and right after a fresh OAuth
  /// exchange to catch a bad/expired token immediately rather than on the
  /// connecting user's first real action.
  testConnection(credentials: string, config: Record<string, unknown> | null): Promise<{ ok: boolean; message: string }>;

  execute(
    action: string,
    credentials: string,
    config: Record<string, unknown> | null,
    payload: Record<string, unknown>,
  ): Promise<unknown>;
}

export class IntegrationActionError extends Error {}
