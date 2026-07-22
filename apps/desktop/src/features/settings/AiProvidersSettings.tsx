import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { desktopApi, type ProviderStatus } from "../../lib/tauri-client";
import { Badge, Button, Card, Input } from "../../components/ui";

const PROVIDER_LABELS: Record<string, string> = {
  OLLAMA: "Ollama",
  LM_STUDIO: "LM Studio",
  OPENAI: "OpenAI",
  ANTHROPIC: "Claude (Anthropic)",
  GEMINI: "Gemini",
  OPENROUTER: "OpenRouter",
  GROQ: "Groq",
  DEEPSEEK: "DeepSeek",
  AZURE_OPENAI: "Azure OpenAI",
};

const NO_KEY_PROVIDERS = new Set(["OLLAMA", "LM_STUDIO"]); // local servers — only base_url matters, no API key

/// AI Providers — one card per provider (all 9 from the spec), each with
/// its own API key / base URL / model fields. Saving a credential doesn't
/// require an app restart: `ProviderRegistry::resolve` re-reads from
/// SQLite + keychain on every chat request, so "provider switching
/// without restart" falls out of the resolve-on-every-call design rather
/// than needing any extra plumbing here.
export function AiProvidersSettings() {
  const queryClient = useQueryClient();
  const providersQuery = useQuery({ queryKey: ["ai-providers"], queryFn: desktopApi.listAiProviders });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {providersQuery.data?.map((provider) => (
        <ProviderCard key={provider.provider} provider={provider} onSaved={() => void queryClient.invalidateQueries({ queryKey: ["ai-providers"] })} />
      ))}
    </div>
  );
}

function ProviderCard({ provider, onSaved }: { provider: ProviderStatus; onSaved: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");

  const saveMutation = useMutation({
    mutationFn: () => desktopApi.saveAiProviderCredential(provider.provider, apiKey || undefined, baseUrl || undefined, model || undefined),
    onSuccess: () => {
      setApiKey("");
      onSaved();
      setExpanded(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => desktopApi.deleteAiProviderCredential(provider.provider),
    onSuccess: onSaved,
  });

  return (
    <Card style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{PROVIDER_LABELS[provider.provider] ?? provider.provider}</div>
          {provider.defaultModel && <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{provider.defaultModel}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge tone={provider.configured ? (provider.byok ? "success" : "info") : "default"}>
            {provider.configured ? (provider.byok ? "Using your key" : "Configured") : "Not configured"}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Close" : "Configure"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 8 }}>
          {!NO_KEY_PROVIDERS.has(provider.provider) && (
            <Input type="password" placeholder="API key (leave blank to keep current)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          )}
          <Input placeholder="Base URL (optional override)" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <Input placeholder="Default model (optional override)" value={model} onChange={(e) => setModel(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" variant="primary" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              Save
            </Button>
            {provider.configured && (
              <Button size="sm" variant="danger" loading={removeMutation.isPending} onClick={() => removeMutation.mutate()}>
                Remove
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
