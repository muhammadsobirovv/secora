"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiChatMessageStreamEvent } from "@pentesthub/shared";
import { AI_CONVERSATION_ENDPOINTS } from "@pentesthub/shared";
import { API_BASE_URL } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import * as aiApi from "@/lib/api/ai";

export const aiKeys = {
  all: ["ai"] as const,
  conversations: (projectId?: string) => ["ai", "conversations", projectId ?? "all"] as const,
  conversation: (id: string) => ["ai", "conversations", "detail", id] as const,
  providers: ["ai", "providers"] as const,
  speechProviders: ["ai", "speech-providers"] as const,
  context: (projectId: string) => ["ai", "context", projectId] as const,
  suggestedQuestions: (projectId: string) => ["ai", "suggested-questions", projectId] as const,
};

function useInvalidateAi() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: aiKeys.all });
}

export function useAiConversations(projectId?: string) {
  return useQuery({
    queryKey: aiKeys.conversations(projectId),
    queryFn: () => aiApi.listAiConversations({ projectId }),
  });
}

export function useAiConversation(id: string | null) {
  return useQuery({
    queryKey: aiKeys.conversation(id ?? "none"),
    queryFn: () => aiApi.getAiConversation(id as string),
    enabled: Boolean(id),
  });
}

export function useAiProviders() {
  return useQuery({ queryKey: aiKeys.providers, queryFn: aiApi.listAiProviders });
}

/// Voice Interaction (Phase 2) — surfaces which speech backends are
/// configured server-side (cloud STT/TTS), mirroring useAiProviders. Not
/// consumed by the chat UI today (only the always-available WEB_SPEECH
/// adapter is actually wired up client-side — see use-ai-voice.ts), but
/// available for a future provider picker once cloud keys are supplied.
export function useAiSpeechProviders() {
  return useQuery({ queryKey: aiKeys.speechProviders, queryFn: aiApi.listAiSpeechProviders });
}

export function useAiContextSummary(projectId: string | null) {
  return useQuery({
    queryKey: aiKeys.context(projectId ?? "none"),
    queryFn: () => aiApi.getAiContextSummary(projectId as string),
    enabled: Boolean(projectId),
  });
}

export function useAiSuggestedQuestions(projectId: string | null) {
  return useQuery({
    queryKey: aiKeys.suggestedQuestions(projectId ?? "none"),
    queryFn: () => aiApi.getAiSuggestedQuestions(projectId as string),
    enabled: Boolean(projectId),
  });
}

export function useCreateAiConversation() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: aiApi.createAiConversation,
    onSuccess: invalidate,
  });
}

export function useDeleteAiConversation() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: (id: string) => aiApi.deleteAiConversation(id),
    onSuccess: invalidate,
  });
}

export function usePinAiConversation() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => aiApi.pinAiConversation(id, value),
    onSuccess: invalidate,
  });
}

export function useSendAiMessage() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: string; content: string }) =>
      aiApi.sendAiMessage(conversationId, content),
    onSuccess: invalidate,
  });
}

export function useRegenerateAiMessage() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: string; messageId: string }) =>
      aiApi.regenerateAiMessage(conversationId, messageId),
    onSuccess: invalidate,
  });
}

export function useContinueAiMessage() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: string; messageId: string }) =>
      aiApi.continueAiMessage(conversationId, messageId),
    onSuccess: invalidate,
  });
}

export function useCancelAiGeneration() {
  return useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: string; messageId: string }) =>
      aiApi.cancelAiGeneration(conversationId, messageId),
  });
}

export function useBookmarkAiMessage() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ messageId, value }: { messageId: string; value: boolean }) =>
      aiApi.bookmarkAiMessage(messageId, value),
    onSuccess: invalidate,
  });
}

export function usePinAiMessage() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ messageId, value }: { messageId: string; value: boolean }) => aiApi.pinAiMessage(messageId, value),
    onSuccess: invalidate,
  });
}

export function useDeleteAiMessage() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: (messageId: string) => aiApi.deleteAiMessage(messageId),
    onSuccess: invalidate,
  });
}

export interface AiMessageStreamState {
  content: string;
  streaming: boolean;
  toolActivity: { toolName: string; status: "running" | "done" }[];
  status: "streaming" | "done" | "error" | "cancelled" | "idle";
  error: string | null;
}

const INITIAL_STATE: AiMessageStreamState = {
  content: "",
  streaming: false,
  toolActivity: [],
  status: "idle",
  error: null,
};

/// Live token stream for one assistant message (Streaming Chat). Same
/// manual fetch()+ReadableStream+AbortController pattern as
/// useVulnScanJobLogs (EventSource can't attach a Bearer header), reading
/// AiChatStreamEvent JSON frames instead of log rows, and folding
/// `delta`/`tool_call`/`tool_result`/`done`/`error`/`cancelled` events
/// into one growing state object the chat UI renders directly.
export function useAiMessageStream(
  conversationId: string | null,
  messageId: string | null,
  onDone?: () => void,
): AiMessageStreamState {
  const [state, setState] = React.useState<AiMessageStreamState>(INITIAL_STATE);
  const onDoneRef = React.useRef(onDone);
  onDoneRef.current = onDone;

  React.useEffect(() => {
    if (!conversationId || !messageId) {
      setState(INITIAL_STATE);
      return;
    }
    const controller = new AbortController();
    setState({ ...INITIAL_STATE, streaming: true, status: "streaming" });

    async function run(): Promise<void> {
      try {
        const accessToken = useAuthStore.getState().accessToken;
        const url = `${API_BASE_URL}${AI_CONVERSATION_ENDPOINTS.streamMessage(conversationId as string)}?messageId=${messageId}`;
        const response = await fetch(url, {
          headers: {
            Accept: "text/event-stream",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`Stream failed with status ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const dataLines = block
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim());
            if (dataLines.length === 0) continue;
            try {
              const event = JSON.parse(dataLines.join("")) as AiChatMessageStreamEvent;
              applyEvent(event, setState);
              if (event.type === "done" || event.type === "error" || event.type === "cancelled") {
                onDoneRef.current?.();
              }
            } catch {
              // Non-JSON keep-alive frame — ignore.
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          streaming: false,
          status: "error",
          error: err instanceof Error ? err.message : "Stream disconnected.",
        }));
      }
    }

    void run();
    return () => controller.abort();
  }, [conversationId, messageId]);

  return state;
}

function applyEvent(
  event: AiChatMessageStreamEvent,
  setState: React.Dispatch<React.SetStateAction<AiMessageStreamState>>,
): void {
  setState((prev) => {
    switch (event.type) {
      case "delta":
        return { ...prev, content: prev.content + event.content };
      case "tool_call":
        return {
          ...prev,
          toolActivity: [...prev.toolActivity, { toolName: event.toolName, status: "running" }],
        };
      case "tool_result":
        return {
          ...prev,
          toolActivity: prev.toolActivity.map((t) =>
            t.toolName === event.toolName && t.status === "running" ? { ...t, status: "done" } : t,
          ),
        };
      case "done":
        return { ...prev, content: event.message.content, streaming: false, status: "done" };
      case "error":
        return { ...prev, streaming: false, status: "error", error: event.message };
      case "cancelled":
        return { ...prev, streaming: false, status: "cancelled" };
      default:
        return prev;
    }
  });
}
