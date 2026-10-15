"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Crown, KeyRound, Loader2, Sparkles } from "lucide-react";
import type { AiProviderName } from "@pentesthub/shared";
import { AI_PROVIDER_NAMES } from "@pentesthub/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAiProviderCredentials,
  useUpsertAiProviderCredential,
} from "@/features/ai/hooks/use-ai";

const PROVIDER_LABELS: Record<AiProviderName, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  GEMINI: "Google Gemini",
  OLLAMA: "Ollama",
  OPENROUTER: "OpenRouter",
};

const SEEN_KEY = "secora_ai_access_seen";

export function hasSeenAiAccessDialog(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markAiAccessDialogSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

type Step = "choose" | "byok";

/// "How do you want to use Secora AI?" — Free (hosted), Pro (upgrade) or BYOK
/// (own provider key). The current mode is derived from state: any saved
/// credential means BYOK, otherwise the hosted tier / plan applies.
export function AiAccessDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: credentials } = useAiProviderCredentials();
  const upsert = useUpsertAiProviderCredential();
  const [step, setStep] = React.useState<Step>("choose");
  const [provider, setProvider] = React.useState<AiProviderName>("OPENAI");
  const [apiKey, setApiKey] = React.useState("");
  const [model, setModel] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");

  const usingByok = (credentials?.length ?? 0) > 0;

  React.useEffect(() => {
    if (open) setStep("choose");
  }, [open]);

  function close() {
    markAiAccessDialogSeen();
    onOpenChange(false);
  }

  async function saveKey() {
    if (!apiKey.trim() && provider !== "OLLAMA") {
      toast.error("API key kiriting.");
      return;
    }
    try {
      await upsert.mutateAsync({
        provider,
        fields: {
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          baseUrl,
          model,
        },
      });
      toast.success(`${PROVIDER_LABELS[provider]} kaliti saqlandi`);
      setApiKey("");
      close();
    } catch {
      toast.error("Kalitni saqlab bo'lmadi.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Secora AI&apos;dan qanday foydalanasiz?</DialogTitle>
          <DialogDescription>
            Rejimni istalgan payt o&apos;zgartirishingiz mumkin.
          </DialogDescription>
        </DialogHeader>

        {step === "choose" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-2 rounded-lg border p-4">
              <Sparkles className="size-5 text-primary" />
              <div className="font-medium">Free</div>
              <p className="flex-1 text-xs text-muted-foreground">
                Secora AI — bepul, kunlik limit bilan. Kalit kerak emas.
              </p>
              <Button size="sm" variant={usingByok ? "outline" : "default"} onClick={close}>
                {!usingByok && <Check className="size-3.5" />}
                {usingByok ? "Free'ga o'tish" : "Hozirgi rejim"}
              </Button>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border p-4">
              <Crown className="size-5 text-primary" />
              <div className="font-medium">Pro</div>
              <p className="flex-1 text-xs text-muted-foreground">
                Yuqori limit va kuchliroq modellar. Tarifni yangilang.
              </p>
              <Button size="sm" variant="outline" asChild onClick={close}>
                <Link href="/settings/billing">Pro&apos;ga o&apos;tish</Link>
              </Button>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border p-4">
              <KeyRound className="size-5 text-primary" />
              <div className="font-medium">O&apos;z API kalitim</div>
              <p className="flex-1 text-xs text-muted-foreground">
                OpenAI, Anthropic, Gemini va boshqalar — o&apos;z kalitingiz bilan.
              </p>
              <Button size="sm" variant={usingByok ? "default" : "outline"} onClick={() => setStep("byok")}>
                {usingByok && <Check className="size-3.5" />}
                {usingByok ? "Kalitni o'zgartirish" : "Kalit qo'shish"}
              </Button>
            </div>
          </div>
        )}

        {step === "byok" && (
          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ai-access-provider">AI provayder</Label>
              <select
                id="ai-access-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as AiProviderName)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {AI_PROVIDER_NAMES.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-access-key">API key</Label>
              <Input
                id="ai-access-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                placeholder={provider === "OLLAMA" ? "Ixtiyoriy" : "sk-..."}
              />
            </div>
            {provider === "OLLAMA" && (
              <div className="space-y-1.5">
                <Label htmlFor="ai-access-url">Base URL</Label>
                <Input
                  id="ai-access-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ai-access-model">Model (ixtiyoriy)</Label>
              <Input
                id="ai-access-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="provayder standarti"
              />
            </div>
            <div className="flex justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={() => setStep("choose")}>
                Orqaga
              </Button>
              <Button size="sm" onClick={() => void saveKey()} disabled={upsert.isPending}>
                {upsert.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Saqlash
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
