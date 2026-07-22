"use client";

import * as React from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import type { AiProviderCredentialDto, AiProviderName } from "@pentesthub/shared";
import { AI_PROVIDER_NAMES } from "@pentesthub/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  useAiProviderCredentials,
  useAiProviders,
  useDeleteAiProviderCredential,
  useUpsertAiProviderCredential,
} from "@/features/ai/hooks/use-ai";

const PROVIDER_LABELS: Record<AiProviderName, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  GEMINI: "Google Gemini",
  OLLAMA: "Ollama",
  OPENROUTER: "OpenRouter",
};

const PROVIDER_HINTS: Record<AiProviderName, string> = {
  OPENAI: "Used for chat and (by default) embeddings for AI Memory search.",
  ANTHROPIC: "Used for chat only — no embeddings API.",
  GEMINI: "Used for chat and embeddings.",
  OLLAMA: "Runs locally — usually just needs a base URL, no API key.",
  OPENROUTER: "Used for chat only — no embeddings API.",
};

interface ProviderFormState {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const EMPTY_FORM: ProviderFormState = { apiKey: "", baseUrl: "", model: "" };

/// Local-First Migration Phase 1 (BYOK) — lets a workspace supply its own
/// AI provider API keys instead of relying on the operator's shared
/// server-configured keys (see docs/adr/0007-local-first-desktop-agent-architecture.md
/// and docs/migration/desktop-agent-roadmap.md Phase 1). The backend still
/// executes every AI call (this is not the future Desktop Agent), but a
/// workspace's own key — once saved here — always takes priority over the
/// operator's key for that provider.
export function AiProviderCredentialsSection() {
  const { data: statuses, isLoading: statusesLoading } = useAiProviders();
  const { data: credentials, isLoading: credentialsLoading } = useAiProviderCredentials();
  const upsert = useUpsertAiProviderCredential();
  const del = useDeleteAiProviderCredential();

  const [forms, setForms] = React.useState<Record<string, ProviderFormState>>({});
  const [savingProvider, setSavingProvider] = React.useState<string | null>(null);
  const [removingProvider, setRemovingProvider] = React.useState<string | null>(null);

  const credentialByProvider = React.useMemo(() => {
    const map = new Map<string, AiProviderCredentialDto>();
    for (const c of credentials ?? []) map.set(c.provider, c);
    return map;
  }, [credentials]);

  function getForm(provider: AiProviderName): ProviderFormState {
    if (forms[provider]) return forms[provider];
    const existing = credentialByProvider.get(provider);
    return { apiKey: "", baseUrl: existing?.baseUrl ?? "", model: existing?.model ?? "" };
  }

  function updateForm(provider: AiProviderName, patch: Partial<ProviderFormState>) {
    setForms((prev) => ({ ...prev, [provider]: { ...getForm(provider), ...patch } }));
  }

  async function handleSave(provider: AiProviderName) {
    const form = getForm(provider);
    setSavingProvider(provider);
    try {
      await upsert.mutateAsync({
        provider,
        fields: {
          // Omitted (undefined) apiKey means "keep the existing key" —
          // only send it when the user actually typed a new one.
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
          baseUrl: form.baseUrl,
          model: form.model,
        },
      });
      setForms((prev) => ({ ...prev, [provider]: { ...form, apiKey: "" } }));
      toast.success(`${PROVIDER_LABELS[provider]} credential saved`);
    } catch {
      toast.error(`Couldn't save ${PROVIDER_LABELS[provider]} credential.`);
    } finally {
      setSavingProvider(null);
    }
  }

  async function handleRemove(provider: AiProviderName) {
    setRemovingProvider(provider);
    try {
      await del.mutateAsync(provider);
      setForms((prev) => ({ ...prev, [provider]: EMPTY_FORM }));
      toast.success(`${PROVIDER_LABELS[provider]} credential removed`);
    } catch {
      toast.error(`Couldn't remove ${PROVIDER_LABELS[provider]} credential.`);
    } finally {
      setRemovingProvider(null);
    }
  }

  const loading = statusesLoading || credentialsLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI provider credentials</CardTitle>
        <CardDescription>
          Bring your own API key for any provider. Your key is encrypted at rest and always used
          in place of the operator&apos;s shared key once saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading providers…
          </div>
        )}

        {!loading &&
          AI_PROVIDER_NAMES.map((provider, index) => {
            const status = statuses?.find((s) => s.provider === provider);
            const credential = credentialByProvider.get(provider);
            const form = getForm(provider);
            const isSaving = savingProvider === provider;
            const isRemoving = removingProvider === provider;

            return (
              <React.Fragment key={provider}>
                {index > 0 && <Separator />}
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <KeyRound className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{PROVIDER_LABELS[provider]}</span>
                      {status?.byok ? (
                        <Badge variant="success">Using your key</Badge>
                      ) : status?.configured ? (
                        <Badge variant="secondary">Using server key</Badge>
                      ) : (
                        <Badge variant="outline">Not configured</Badge>
                      )}
                    </div>
                    {credential && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => void handleRemove(provider)}
                        disabled={isRemoving}
                      >
                        {isRemoving ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{PROVIDER_HINTS[provider]}</p>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${provider}-api-key`}>API key</Label>
                      <Input
                        id={`${provider}-api-key`}
                        type="password"
                        value={form.apiKey}
                        onChange={(e) => updateForm(provider, { apiKey: e.target.value })}
                        placeholder={credential?.keyPreview ? `Saved (${credential.keyPreview})` : "sk-..."}
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${provider}-base-url`}>Base URL (optional)</Label>
                      <Input
                        id={`${provider}-base-url`}
                        value={form.baseUrl}
                        onChange={(e) => updateForm(provider, { baseUrl: e.target.value })}
                        placeholder={provider === "OLLAMA" ? "http://localhost:11434" : "https://..."}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${provider}-model`}>Default model (optional)</Label>
                      <Input
                        id={`${provider}-model`}
                        value={form.model}
                        onChange={(e) => updateForm(provider, { model: e.target.value })}
                        placeholder={status?.defaultModel ?? "provider default"}
                      />
                    </div>
                  </div>

                  <Button size="sm" className="self-start" onClick={() => void handleSave(provider)} disabled={isSaving}>
                    {isSaving && <Loader2 className="size-3.5 animate-spin" />}
                    Save
                  </Button>
                </div>
              </React.Fragment>
            );
          })}
      </CardContent>
    </Card>
  );
}
