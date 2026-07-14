"use client";

import * as React from "react";
import { Bot } from "lucide-react";
import type { AiMessageDto } from "@pentesthub/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
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
import { AiChatMessage } from "./ai-chat-message";
import { AiChatInput } from "./ai-chat-input";

export interface AiChatPanelHandle {
  sendMessage: (content: string) => void;
}

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
    const scrollRef = React.useRef<HTMLDivElement>(null);

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
      <div className="flex flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {conversation.messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
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
                onBookmark={(value) => bookmarkMessage.mutate({ messageId: message.id, value })}
                onPin={(value) => pinMessage.mutate({ messageId: message.id, value })}
                onRegenerate={() => handleRegenerate(message.id)}
                onContinueGeneration={() => handleContinue(message.id)}
                onDelete={() => deleteMessage.mutate(message.id)}
              />
            ))
          )}
        </div>
        <AiChatInput
          onSend={handleSend}
          onCancel={handleCancel}
          disabled={sendMessage.isPending || streamState.streaming}
          streaming={streamState.streaming}
        />
      </div>
    );
  },
);
