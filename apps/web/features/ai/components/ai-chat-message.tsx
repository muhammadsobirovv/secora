"use client";

import * as React from "react";
import {
  Bookmark,
  Copy,
  Download,
  Loader2,
  Pin,
  RotateCcw,
  Search,
  Trash2,
  ChevronRight,
  Volume2,
  VolumeX,
  Maximize2,
} from "lucide-react";
import type { AiMessageDto } from "@pentesthub/shared";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AiMessageMarkdown } from "./ai-message-markdown";
import type { AiMessageStreamState } from "../hooks/use-ai";
import { downloadTextFile } from "../lib/download-text-file";
import { isArtifactWorthy } from "../lib/artifact-detection";

/// One message bubble. AI Message Actions implemented here: Copy,
/// Bookmark, Pin, Regenerate, Continue, Delete (Phase 1) plus Speak/Stop
/// Speaking (Voice Interaction), Download, and Open in Artifact panel
/// (Phase 2) — see ADR 0005 for the phasing rationale.
export function AiChatMessage({
  message,
  streamState,
  isLastAssistantMessage,
  terminalMode = false,
  speechSupported,
  speaking,
  onSpeak,
  onStopSpeaking,
  onBookmark,
  onPin,
  onRegenerate,
  onContinueGeneration,
  onDelete,
  onOpenArtifact,
}: {
  message: AiMessageDto;
  streamState?: AiMessageStreamState;
  isLastAssistantMessage: boolean;
  terminalMode?: boolean;
  speechSupported: boolean;
  speaking: boolean;
  onSpeak: (text: string) => void;
  onStopSpeaking: () => void;
  onBookmark: (value: boolean) => void;
  onPin: (value: boolean) => void;
  onRegenerate: () => void;
  onContinueGeneration: () => void;
  onDelete: () => void;
  onOpenArtifact: (content: string) => void;
}) {
  const isUser = message.role === "USER";
  const isStreaming = Boolean(streamState?.streaming);
  const displayContent = streamState ? streamState.content : message.content;
  const failed = message.status === "FAILED" || streamState?.status === "error";
  const cancelled = message.status === "CANCELLED" || streamState?.status === "cancelled";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayContent);
  };

  if (message.role === "SYSTEM" || message.role === "TOOL") return null;

  return (
    <div className={cn("group flex gap-3", isUser && !terminalMode && "flex-row-reverse")}>
      {!terminalMode && (
        <Avatar className="size-8 shrink-0">
          <AvatarFallback>{isUser ? "You" : "AI"}</AvatarFallback>
        </Avatar>
      )}
      <div className={cn("flex flex-col gap-1.5", terminalMode ? "w-full" : "max-w-[85%]", isUser && !terminalMode && "items-end")}>
        {streamState && streamState.toolActivity.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {streamState.toolActivity.map((tool, index) => (
              <Badge key={`${tool.toolName}-${index}`} variant="secondary" className="gap-1 text-xs">
                {tool.status === "running" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Search className="size-3" />
                )}
                {tool.toolName.replaceAll("_", " ")}
              </Badge>
            ))}
          </div>
        )}

        <div
          className={cn(
            terminalMode
              ? cn("border-l-2 pl-3 font-mono text-sm", isUser ? "border-emerald-500 text-emerald-400" : "border-lime-400 text-lime-200")
              : cn("rounded-lg px-4 py-2.5", isUser ? "bg-primary text-primary-foreground" : "bg-muted"),
            failed && "border-destructive/50",
            !terminalMode && failed && "border",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm">
              {terminalMode && <span className="select-none opacity-70">$ </span>}
              {displayContent}
            </p>
          ) : displayContent ? (
            terminalMode ? (
              <div className="whitespace-pre-wrap text-sm">{displayContent}</div>
            ) : (
              <AiMessageMarkdown content={displayContent} />
            )
          ) : isStreaming ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
          {isStreaming && displayContent && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-current align-middle" />
          )}
          {failed && (
            <p className="mt-1 text-xs text-destructive">
              {streamState?.error ?? message.errorMessage ?? "Something went wrong."}
            </p>
          )}
          {cancelled && <p className="mt-1 text-xs text-muted-foreground">Generation stopped.</p>}
        </div>

        {!isStreaming && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100">
            <Button type="button" size="icon" variant="ghost" className="size-6" onClick={handleCopy} aria-label="Copy">
              <Copy className="size-3.5" />
            </Button>
            {!isUser && speechSupported && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn("size-6", speaking && "text-primary")}
                onClick={() => (speaking ? onStopSpeaking() : onSpeak(displayContent))}
                aria-label={speaking ? "Stop speaking" : "Speak"}
              >
                {speaking ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
              </Button>
            )}
            {!isUser && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={() => downloadTextFile(`ai-message-${message.id}.md`, displayContent)}
                aria-label="Download"
              >
                <Download className="size-3.5" />
              </Button>
            )}
            {!isUser && isArtifactWorthy(displayContent) && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={() => onOpenArtifact(displayContent)}
                aria-label="Open in artifact panel"
              >
                <Maximize2 className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn("size-6", message.bookmarked && "text-primary")}
              onClick={() => onBookmark(!message.bookmarked)}
              aria-label="Bookmark"
            >
              <Bookmark className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn("size-6", message.pinned && "text-primary")}
              onClick={() => onPin(!message.pinned)}
              aria-label="Pin"
            >
              <Pin className="size-3.5" />
            </Button>
            {!isUser && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={onRegenerate}
                aria-label="Regenerate"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            )}
            {!isUser && isLastAssistantMessage && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={onContinueGeneration}
                aria-label="Continue"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            )}
            <Button type="button" size="icon" variant="ghost" className="size-6" onClick={onDelete} aria-label="Delete">
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
