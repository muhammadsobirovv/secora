"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, KeyRound, MessageSquarePlus } from "lucide-react";
import {
  AiAccessDialog,
  hasSeenAiAccessDialog,
} from "@/features/ai/components/ai-access-dialog";
import { ProjectPicker } from "@/components/common/project-picker";
import { Button } from "@/components/ui/button";
import { AiConversationSidebar } from "@/features/ai/components/ai-conversation-sidebar";
import { AiChatPanel, type AiChatPanelHandle } from "@/features/ai/components/ai-chat-panel";
import { AiContextPanel } from "@/features/ai/components/ai-context-panel";
import { useCreateAiConversation } from "@/features/ai/hooks/use-ai";
import { PageHelp } from "@/components/common/page-help";

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
  const [accessOpen, setAccessOpen] = React.useState(false);

  // First visit to the AI module: ask how the user wants to use Secora AI.
  React.useEffect(() => {
    if (!hasSeenAiAccessDialog()) setAccessOpen(true);
  }, []);

  const accessButton = (
    <Button type="button" variant="outline" size="sm" onClick={() => setAccessOpen(true)}>
      <KeyRound className="mr-1.5 size-4" />
      AI rejimi
    </Button>
  );
  const accessDialog = <AiAccessDialog open={accessOpen} onOpenChange={setAccessOpen} />;

  if (!projectId) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Secora AI</h1>
          {accessButton}
        </div>
        {accessDialog}
        <ProjectPicker
          icon={Bot}
          description="Which project should Secora AI use as context?"
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
      {accessDialog}
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="size-5 text-primary" />
          <h1 className="text-2xl font-semibold">Secora AI</h1>
          <PageHelp
            summary={`A chat assistant scoped to one project — it can see that project's targets, recon results, findings, and notes, so you can ask it things like "what's still unscanned" or "summarize the critical findings" without re-explaining context every time.`}
            steps={[
              "Pick a project — the assistant only knows about that project's data.",
              "Ask a question directly, or use one of the suggested questions on the right.",
              "Start a new conversation any time; old ones stay in the sidebar so you can pick up where you left off.",
            ]}
            actions={[
              { label: "Switch project", description: "Change which project's context the assistant uses." },
              { label: "New conversation", description: "Start a fresh chat thread (previous ones aren't lost)." },
              { label: "Context panel", description: "Shows what the assistant currently knows about the project and suggested next questions." },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          {accessButton}
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
