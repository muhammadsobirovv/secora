"use client";

import * as React from "react";
import { Bookmark, Copy, Loader2, Pin, RotateCcw, Search, Trash2, ChevronRight } from "lucide-react";
import type { AiMessageDto } from "@pentesthub/shared";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AiMessageMarkdown } from "./ai-message-markdown";
import type { AiMessageStreamState } from "../hooks/use-ai";

/// One message bubble. AI Message Actions implemented here: Copy,
/// Bookmark, Pin, Regenerate, Continue, Delete. Speak/Stop Speaking
/// (Voice Interaction), Download, and Share are Phase 2 — see ADR 0005
/// for the phasing rationale; this is the Phase 1 action set.
export function AiChatMessage({
  message,
  streamState,
  isLastAssistantMessage,
  onBookmark,
  onPin,
  onRegenerate,
  onContinueGeneration,
  onDelete,
}: {
  message: AiMessageDto;
  streamState?: AiMessageStreamState;
  isLastAssistantMessage: boolean;
  onBookmark: (value: boolean) => void;
  onPin: (value: boolean) => void;
  onRegenerate: () => void;
  onContinueGeneration: () => void;
  onDelete: () => void;
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
    <div className={cn("group flex gap-3", isUser && "flex-row-reverse")}>
      <Avatar className="size-8 shrink-0">
        <AvatarFallback>{isUser ? "You" : "AI"}</AvatarFallback>
      </Avatar>
      <div className={cn("flex max-w-[85%] flex-col gap-1.5", isUser && "items-end")}>
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
            "rounded-lg px-4 py-2.5",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted",
            failed && "border border-destructive/50",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm">{displayContent}</p>
          ) : displayContent ? (
            <AiMessageMarkdown content={displayContent} />
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
