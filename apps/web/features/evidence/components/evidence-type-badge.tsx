import { Badge } from "@/components/ui/badge";
import type { EvidenceType } from "@pentesthub/shared";

const TYPE_LABEL: Record<EvidenceType, string> = {
  SCREENSHOT: "Screenshot",
  HTTP_REQUEST: "HTTP request",
  HTTP_RESPONSE: "HTTP response",
  FILE: "File",
  LOG: "Log",
  VIDEO: "Video",
  // Added for Module 4 (Vulnerability Engine) — see packages/shared/src/evidence.ts.
  PAYLOAD: "Payload",
  COMMAND: "Command",
  // Module 16 additions — see EvidenceType's doc comment in packages/shared.
  AUDIO: "Audio",
  AI_ANALYSIS: "AI analysis",
};

export function EvidenceTypeBadge({ type }: { type: EvidenceType }) {
  return <Badge variant="secondary">{TYPE_LABEL[type]}</Badge>;
}
