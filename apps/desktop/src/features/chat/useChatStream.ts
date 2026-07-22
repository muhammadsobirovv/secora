import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { desktopApi, type MessageRecord } from "../../lib/tauri-client";

/// Drives one conversation's streaming state. `send_message` (the Rust
/// command) doesn't resolve until the *entire* assistant reply has
/// streamed and been persisted, so two things are handled client-side
/// that a simple await-then-refetch wouldn't give: (1) the user's own
/// message is added to the React Query cache optimistically the instant
/// `send` is called, rather than waiting for the whole round-trip, and
/// (2) the in-flight assistant reply is tracked in local state
/// (`streamingText`) and rendered as a synthetic "streaming" bubble until
/// the `done`/`error` event lands, at which point the real persisted
/// messages are re-fetched and the synthetic bubble is dropped.
export function useChatStream(conversationId: string | null) {
  const queryClient = useQueryClient();
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [pendingToolCall, setPendingToolCall] = useState<{ toolName: string } | null>(null);
  const streamingTextRef = useRef("");

  useEffect(() => {
    if (!conversationId) return;
    streamingTextRef.current = "";
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    desktopApi
      .subscribeToChatStream(conversationId, (event) => {
        if (event.type === "delta") {
          streamingTextRef.current += event.content;
          setStreamingText(streamingTextRef.current);
        } else if (event.type === "tool_call") {
          setPendingToolCall({ toolName: event.toolName });
        } else if (event.type === "done") {
          setIsStreaming(false);
          setStreamingText("");
          setPendingToolCall(null);
          streamingTextRef.current = "";
          void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        } else if (event.type === "error") {
          setIsStreaming(false);
          setStreamError(event.message);
          setPendingToolCall(null);
        }
      })
      .then((fn) => {
        if (!cancelled) unlisten = fn;
        else fn();
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [conversationId, queryClient]);

  const send = useMutation({
    mutationFn: async ({ content, provider }: { content: string; provider?: string }) => {
      if (!conversationId) throw new Error("No conversation selected.");
      setStreamError(null);
      setIsStreaming(true);
      return desktopApi.sendMessage(conversationId, content, provider);
    },
    onMutate: async ({ content }) => {
      if (!conversationId) return;
      await queryClient.cancelQueries({ queryKey: ["messages", conversationId] });
      const previous = queryClient.getQueryData<MessageRecord[]>(["messages", conversationId]) ?? [];
      const optimisticUserMessage: MessageRecord = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        role: "USER",
        content,
        status: "COMPLETE",
        provider: null,
        model: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData(["messages", conversationId], [...previous, optimisticUserMessage]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (conversationId && context?.previous) {
        queryClient.setQueryData(["messages", conversationId], context.previous);
      }
      setIsStreaming(false);
    },
    onSuccess: () => {
      if (conversationId) void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
  });

  return { send, streamingText, isStreaming, streamError, pendingToolCall };
}
