"use client";

import * as React from "react";
import { Bot, Download, TerminalSquare } from "lucide-react";
import type { AiMessageDto } from "@pentesthub/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";
import {
  useAiConversation,
  useAiMessageStream,
  useBookmarkAiMessage,
  useCancelAiGeneration,
  useContinueAiMessage,
  useDeleteAiMessage,
  usePinAiMessage,
  useRegenerateAiMessage,
  useSendAiMessage,
} from "../hooks/use-ai";
import { useTextToSpeech } from "../hooks/use-ai-voice";
import { AiChatMessage } from "./ai-chat-message";
import { AiChatInput } from "./ai-chat-input";
import { AiArtifactPanel } from "./ai-artifact-panel";
import { conversationExportFilename, conversationToMarkdown } from "../lib/export-conversation";
import { downloadTextFile } from "../lib/download-text-file";

export interface AiChatPanelHandle {
  sendMessage: (content: string) => void;
}

const TERMINAL_MODE_STORAGE_KEY = "ai-terminal-mode";

export const AiChatPanel = React.forwardRef<AiChatPanelHandle, { conversationId: string | null }>(
  function AiChatPanel({ conversationId }, ref) {
    const { data: conversation, isLoading } = useAiConversation(conversationId);
    const sendMessage = useSendAiMessage();
    const regenerate = useRegenerateAiMessage();
    const continueMessage = useContinueAiMessage();
    const cancelGeneration = useCancelAiGeneration();
    const bookmarkMessage = useBookmarkAiMessage();
    const pinMessage = usePinAiMessage();
    const deleteMessage = useDeleteAiMessage();

    const [activeStreamMessageId, setActiveStreamMessageId] = React.useState<string | null>(null);
    const [artifactContent, setArtifactContent] = React.useState<string | null>(null);
    const [terminalMode, setTerminalMode] = React.useState(false);
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const textToSpeech = useTextToSpeech();

    React.useEffect(() => {
      setTerminalMode(window.localStorage.getItem(TERMINAL_MODE_STORAGE_KEY) === "true");
    }, []);

    const toggleTerminalMode = () => {
      setTerminalMode((prev) => {
        const next = !prev;
        window.localStorage.setItem(TERMINAL_MODE_STORAGE_KEY, String(next));
        return next;
      });
    };

    const streamState = useAiMessageStream(conversationId, activeStreamMessageId, () => {
      // Keep rendering the final streamed content until the next refetch
      // lands, avoiding a flash back to an empty bubble.
    });

    React.useEffect(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [conversation?.messages.length, streamState.content]);

    const handleSend = React.useCallback(
      async (content: string) => {
        if (!conversationId) return;
        const result = await sendMessage.mutateAsync({ conversationId, content });
        setActiveStreamMessageId(result.assistantMessage.id);
      },
      [conversationId, sendMessage],
    );

    const handleRegenerate = async (messageId: string) => {
      if (!conversationId) return;
      await regenerate.mutateAsync({ conversationId, messageId });
      setActiveStreamMessageId(messageId);
    };

    const handleContinue = async (messageId: string) => {
      if (!conversationId) return;
      await continueMessage.mutateAsync({ conversationId, messageId });
      setActiveStreamMessageId(messageId);
    };

    const handleCancel = () => {
      if (!conversationId || !activeStreamMessageId) return;
      cancelGeneration.mutate({ conversationId, messageId: activeStreamMessageId });
    };

    React.useImperativeHandle(ref, () => ({ sendMessage: handleSend }), [handleSend]);

    if (!conversationId) {
      return (
        <EmptyState
          icon={Bot}
          title="Start a conversation"
          description="Pick a conversation on the left, or create a new one to ask the AI Security Copilot about this project."
        />
      );
    }

    if (isLoading || !conversation) {
      return (
        <div className="flex flex-1 flex-col gap-4 p-4">
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="ml-auto h-16 w-2/3" />
          <Skeleton className="h-16 w-2/3" />
        </div>
      );
    }

    const lastAssistantMessageId = [...conversation.messages].reverse().find((m) => m.role === "ASSISTANT")?.id;

    return (
      <div className="flex flex-1 overflow-hidden">
        <div className={cn("flex flex-1 flex-col overflow-hidden", terminalMode && "bg-black")}>
          <div className={cn("flex items-center justify-between border-b px-3 py-1.5", terminalMode && "border-lime-900")}>
            <span className={cn("truncate text-xs text-muted-foreground", terminalMode && "font-mono text-lime-600")}>
              {conversation.title ?? "Untitled conversation"}
            </span>
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn("size-7", terminalMode && "text-lime-400 hover:text-lime-300")}
                onClick={() =>
                  downloadTextFile(conversationExportFilename(conversation), conversationToMarkdown(conversation))
                }
                aria-label="Export conversation"
                title="Export conversation as Markdown"
              >
                <Download className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant={terminalMode ? "secondary" : "ghost"}
                className={cn("size-7", terminalMode && "text-lime-400 hover:text-lime-300")}
                onClick={toggleTerminalMode}
                aria-label="Toggle terminal mode"
                title="Toggle terminal mode"
              >
                <TerminalSquare className="size-4" />
              </Button>
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {conversation.messages.length === 0 ? (
              <p className={cn("text-center text-sm text-muted-foreground", terminalMode && "font-mono text-lime-700")}>
                Ask about findings, recon results, CVEs, or request a PoC — the AI already knows this
                project&apos;s context.
              </p>
            ) : (
              conversation.messages.map((message: AiMessageDto) => (
                <AiChatMessage
                  key={message.id}
                  message={message}
                  streamState={message.id === activeStreamMessageId ? streamState : undefined}
                  isLastAssistantMessage={message.id === lastAssistantMessageId}
                  terminalMode={terminalMode}
                  speechSupported={textToSpeech.supported}
                  speaking={textToSpeech.speakingMessageId === message.id}
                  onSpeak={(text) => textToSpeech.speak(message.id, text)}
                  onStopSpeaking={textToSpeech.stop}
                  onBookmark={(value) => bookmarkMessage.mutate({ messageId: message.id, value })}
                  onPin={(value) => pinMessage.mutate({ messageId: message.id, value })}
                  onRegenerate={() => handleRegenerate(message.id)}
                  onContinueGeneration={() => handleContinue(message.id)}
                  onDelete={() => deleteMessage.mutate(message.id)}
                  onOpenArtifact={setArtifactContent}
                />
              ))
            )}
          </div>
          <AiChatInput
            onSend={handleSend}
            onCancel={handleCancel}
            disabled={sendMessage.isPending || streamState.streaming}
            streaming={streamState.streaming}
            terminalMode={terminalMode}
          />
        </div>
        {artifactContent && <AiArtifactPanel content={artifactContent} onClose={() => setArtifactContent(null)} />}
      </div>
    );
  },
);
