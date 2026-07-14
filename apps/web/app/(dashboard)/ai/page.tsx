"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, MessageSquarePlus } from "lucide-react";
import { ProjectPicker } from "@/components/common/project-picker";
import { Button } from "@/components/ui/button";
import { AiConversationSidebar } from "@/features/ai/components/ai-conversation-sidebar";
import { AiChatPanel, type AiChatPanelHandle } from "@/features/ai/components/ai-chat-panel";
import { AiContextPanel } from "@/features/ai/components/ai-context-panel";
import { useCreateAiConversation } from "@/features/ai/hooks/use-ai";

/// AI Dashboard page (Module 5 spec): workspace/project selector (via the
/// existing ?projectId= + ProjectPicker convention), conversation history,
/// context indicator, suggested questions, and the streaming chat panel —
/// all wired together here.
function AiDashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get("projectId");
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const chatPanelRef = React.useRef<AiChatPanelHandle>(null);
  const createConversation = useCreateAiConversation();

  if (!projectId) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">AI Security Copilot</h1>
        <ProjectPicker
          icon={Bot}
          description="Which project should the AI Security Copilot use as context?"
          hrefFor={(id) => `/ai?projectId=${id}`}
        />
      </div>
    );
  }

  const handleNewConversation = async () => {
    const conversation = await createConversation.mutateAsync({ projectId });
    setConversationId(conversation.id);
  };

  const handleAskQuestion = async (prompt: string) => {
    if (!conversationId) {
      const conversation = await createConversation.mutateAsync({ projectId });
      setConversationId(conversation.id);
      // Wait a tick so AiChatPanel has mounted against the new conversationId
      // before we push the first message through its imperative handle.
      requestAnimationFrame(() => chatPanelRef.current?.sendMessage(prompt));
      return;
    }
    chatPanelRef.current?.sendMessage(prompt);
  };

  return (
    <div className="flex h-[calc(100svh-6.5rem)] flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="size-5 text-primary" />
          <h1 className="text-2xl font-semibold">AI Security Copilot</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => router.push("/ai")}>
            Switch project
          </Button>
          <Button type="button" size="sm" onClick={handleNewConversation}>
            <MessageSquarePlus className="mr-1.5 size-4" />
            New conversation
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
        <AiConversationSidebar projectId={projectId} activeConversationId={conversationId} onSelect={setConversationId} />
        <AiChatPanel ref={chatPanelRef} conversationId={conversationId} />
        <AiContextPanel projectId={projectId} onAskQuestion={handleAskQuestion} />
      </div>
    </div>
  );
}

export default function AiDashboardPage() {
  return (
    <Suspense>
      <AiDashboardContent />
    </Suspense>
  );
}
