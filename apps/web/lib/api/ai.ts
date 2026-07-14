import type {
  AiConversationDetailDto,
  AiConversationDto,
  AiContextSummaryDto,
  AiMessageDto,
  AiProviderStatusDto,
  AiSpeechProviderStatusDto,
  AiSuggestedQuestionDto,
  CreateAiConversationRequestDto,
  ListAiConversationsQueryDto,
} from "@pentesthub/shared";
import {
  AI_CONTEXT_ENDPOINTS,
  AI_CONVERSATION_ENDPOINTS,
  AI_MESSAGE_ENDPOINTS,
  AI_PROVIDER_ENDPOINTS,
  AI_SPEECH_ENDPOINTS,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

export function listAiConversations(query: ListAiConversationsQueryDto = {}) {
  const params = new URLSearchParams();
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.search) params.set("search", query.search);
  if (query.pinned !== undefined) params.set("pinned", String(query.pinned));
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return apiFetch<AiConversationDto[]>(`${AI_CONVERSATION_ENDPOINTS.list}${qs ? `?${qs}` : ""}`);
}

export function createAiConversation(body: CreateAiConversationRequestDto) {
  return apiFetch<AiConversationDto>(AI_CONVERSATION_ENDPOINTS.create, { method: "POST", body });
}

export function getAiConversation(id: string) {
  return apiFetch<AiConversationDetailDto>(AI_CONVERSATION_ENDPOINTS.get(id));
}

export function deleteAiConversation(id: string) {
  return apiFetch<void>(AI_CONVERSATION_ENDPOINTS.delete(id), { method: "DELETE" });
}

export function pinAiConversation(id: string, value: boolean) {
  return apiFetch<AiConversationDto>(AI_CONVERSATION_ENDPOINTS.pin(id), { method: "POST", body: { value } });
}

export function archiveAiConversation(id: string, value: boolean) {
  return apiFetch<AiConversationDto>(AI_CONVERSATION_ENDPOINTS.archive(id), { method: "POST", body: { value } });
}

export function sendAiMessage(conversationId: string, content: string) {
  return apiFetch<{ userMessage: AiMessageDto; assistantMessage: AiMessageDto }>(
    AI_CONVERSATION_ENDPOINTS.sendMessage(conversationId),
    { method: "POST", body: { content } },
  );
}

export function regenerateAiMessage(conversationId: string, messageId: string) {
  return apiFetch<AiMessageDto>(AI_CONVERSATION_ENDPOINTS.regenerate(conversationId), {
    method: "POST",
    body: { messageId },
  });
}

export function continueAiMessage(conversationId: string, messageId: string) {
  return apiFetch<AiMessageDto>(AI_CONVERSATION_ENDPOINTS.continue(conversationId), {
    method: "POST",
    body: { messageId },
  });
}

export function cancelAiGeneration(conversationId: string, messageId: string) {
  return apiFetch<{ cancelled: boolean }>(AI_CONVERSATION_ENDPOINTS.cancel(conversationId), {
    method: "POST",
    body: { messageId },
  });
}

export function bookmarkAiMessage(messageId: string, value: boolean) {
  return apiFetch<AiMessageDto>(AI_MESSAGE_ENDPOINTS.bookmark(messageId), { method: "POST", body: { value } });
}

export function pinAiMessage(messageId: string, value: boolean) {
  return apiFetch<AiMessageDto>(AI_MESSAGE_ENDPOINTS.pin(messageId), { method: "POST", body: { value } });
}

export function deleteAiMessage(messageId: string) {
  return apiFetch<void>(AI_MESSAGE_ENDPOINTS.delete(messageId), { method: "DELETE" });
}

export function listAiProviders() {
  return apiFetch<AiProviderStatusDto[]>(AI_PROVIDER_ENDPOINTS.list);
}

export function listAiSpeechProviders() {
  return apiFetch<AiSpeechProviderStatusDto[]>(AI_SPEECH_ENDPOINTS.list);
}

export function getAiContextSummary(projectId: string) {
  return apiFetch<AiContextSummaryDto>(AI_CONTEXT_ENDPOINTS.summary(projectId));
}

export function getAiSuggestedQuestions(projectId: string) {
  return apiFetch<AiSuggestedQuestionDto[]>(AI_CONTEXT_ENDPOINTS.suggestedQuestions(projectId));
}
