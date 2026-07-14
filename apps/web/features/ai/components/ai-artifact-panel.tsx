"use client";

import * as React from "react";
import { Check, Copy, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiMessageMarkdown } from "./ai-message-markdown";
import { downloadTextFile } from "../lib/download-text-file";
import { extractPrimaryArtifact } from "../lib/artifact-detection";

/// Artifact Mode (Phase 2): a substantial generated artifact (a drafted
/// report, a PoC, a payload set, or just a long code answer — see
/// isArtifactWorthy) gets its own full-height side panel instead of being
/// cramped inside a chat bubble, with its own copy/download/close
/// toolbar. Decoupled from the message list — closing it doesn't affect
/// the conversation.
export function AiArtifactPanel({ content, onClose }: { content: string; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const { language, code } = React.useMemo(() => extractPrimaryArtifact(content), [content]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const ext = language ?? "md";
    downloadTextFile(`artifact.${ext}`, code, "text/plain");
  };

  return (
    <div className="flex w-[420px] shrink-0 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Artifact{language ? ` — ${language}` : ""}</span>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" className="size-7" onClick={handleCopy} aria-label="Copy artifact">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={handleDownload}
            aria-label="Download artifact"
          >
            <Download className="size-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="size-7" onClick={onClose} aria-label="Close artifact panel">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <AiMessageMarkdown content={`\`\`\`${language ?? ""}\n${code}\n\`\`\``} />
      </div>
    </div>
  );
}
