// Module 13 — Local Execution (task #288). The real queue behind the
// MCP `desktop_agent_command`/`browser_extension_command` tools — see
// `RelayCommand`'s Prisma doc comment for the full design (a
// deliberately standalone poll/complete queue, not one more consumer of
// Module 7's never-implemented `desktop-sync` REST surface).

export type RelayCommandTarget = "DESKTOP" | "BROWSER";
export type RelayCommandStatus = "PENDING" | "DELIVERED" | "COMPLETED" | "FAILED";

export interface RelayCommandDto {
  id: string;
  workspaceId: string;
  target: RelayCommandTarget;
  commandType: string;
  payload: Record<string, unknown>;
  status: RelayCommandStatus;
  result: unknown;
  createdBy: string | null;
  createdAt: string;
  deliveredAt: string | null;
  completedAt: string | null;
}

export interface ListPendingRelayCommandsQueryDto {
  target: RelayCommandTarget;
  limit?: number;
}

export interface CompleteRelayCommandRequestDto {
  success: boolean;
  result?: unknown;
  errorMessage?: string;
}
