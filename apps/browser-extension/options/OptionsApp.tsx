import { useEffect, useState } from "react";
import { Puzzle, Wifi, Shield, Bell, Keyboard, Palette, Sparkles } from "lucide-react";
import { send, sendRaw } from "../shared/messaging";
import { Button, Card, Input, Select, Switch, ErrorBanner, Spinner } from "../shared/ui";
import type { ExtensionSettings } from "../shared/types";

const AI_PROVIDERS = [
  { value: "", label: "Use Desktop Agent default" },
  { value: "OLLAMA", label: "Ollama (local)" },
  { value: "LM_STUDIO", label: "LM Studio (local)" },
  { value: "OPENAI", label: "OpenAI" },
  { value: "ANTHROPIC", label: "Anthropic" },
  { value: "GEMINI", label: "Google Gemini" },
  { value: "OPENROUTER", label: "OpenRouter" },
  { value: "GROQ", label: "Groq" },
  { value: "DEEPSEEK", label: "DeepSeek" },
  { value: "AZURE_OPENAI", label: "Azure OpenAI" },
];

export function OptionsApp() {
  const [settings, setSettingsState] = useState<ExtensionSettings | null>(null);
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:47821");
  const [token, setToken] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      const s = await send<ExtensionSettings>({ kind: "getSettings" });
      setSettingsState(s);
      if (s.bridge) {
        setBaseUrl(s.bridge.baseUrl);
        setToken(s.bridge.token);
        const result = await sendRaw({ kind: "testBridgeConnection", baseUrl: s.bridge.baseUrl, token: s.bridge.token });
        setConnected(result.ok);
      } else {
        setConnected(false);
      }
    })();
  }, []);

  const update = async (patch: Partial<ExtensionSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettingsState(next);
    await send({ kind: "setSettings", settings: next });
  };

  const testConnection = async () => {
    setPairError(null);
    const result = await sendRaw({ kind: "testBridgeConnection", baseUrl, token });
    setConnected(result.ok);
    if (!result.ok) setPairError(result.error ?? "Could not reach the Desktop Agent.");
  };

  const doPair = async () => {
    setPairing(true);
    setPairError(null);
    const result = await sendRaw({ kind: "pair", baseUrl, token });
    setPairing(false);
    if (!result.ok) {
      setPairError(result.error ?? "Pairing failed.");
      return;
    }
    setConnected(true);
    const s = await send<ExtensionSettings>({ kind: "getSettings" });
    setSettingsState(s);
  };

  const doUnpair = async () => {
    await send({ kind: "unpair" });
    setConnected(false);
    setToken("");
  };

  if (!settings) {
    return (
      <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Puzzle size={22} color="var(--color-primary)" />
        <h1 style={{ fontSize: 19, margin: 0 }}>PentestHub AI — Settings</h1>
      </div>

      <Section icon={<Wifi size={15} />} title="Desktop Agent Connection">
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
          Open the Desktop Agent, go to Settings → Browser Extension, and copy the Server URL and Pairing Token here.
        </div>
        <Field label="Server URL">
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:47821" />
        </Field>
        <Field label="Pairing Token">
          <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste the token from the Desktop Agent" type="password" />
        </Field>
        {pairError && <ErrorBanner message={pairError} />}
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <Button variant="outline" onClick={() => void testConnection()}>
            Test connection
          </Button>
          <Button variant="primary" loading={pairing} onClick={() => void doPair()}>
            Pair
          </Button>
          {connected && (
            <Button variant="ghost" onClick={() => void doUnpair()}>
              Unpair
            </Button>
          )}
          <span style={{ fontSize: 11.5, color: connected ? "var(--color-success)" : "var(--color-text-muted)", marginLeft: "auto" }}>
            {connected === null ? "" : connected ? "● Connected" : "○ Not connected"}
          </span>
        </div>
      </Section>

      <Section icon={<Sparkles size={15} />} title="AI Provider">
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
          Which AI provider the Side Panel requests for streaming responses. The provider must already be configured with credentials in the Desktop Agent — this only picks which one to use.
        </div>
        <Select value={settings.aiProvider ?? ""} onChange={(v) => update({ aiProvider: v || null })} options={AI_PROVIDERS} />
      </Section>

      <Section icon={<Palette size={15} />} title="Appearance & Language">
        <Field label="Theme">
          <Select value={settings.theme} onChange={(v) => update({ theme: v as ExtensionSettings["theme"] })} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
        </Field>
        <Field label="Language">
          <Select value={settings.language} onChange={(v) => update({ language: v })} options={[{ value: "en", label: "English" }, { value: "es", label: "Español" }, { value: "fr", label: "Français" }, { value: "de", label: "Deutsch" }, { value: "pt", label: "Português" }, { value: "ru", label: "Русский" }]} />
        </Field>
      </Section>

      <Section icon={<Shield size={15} />} title="Capture Rules & Privacy">
        <Switch checked={settings.captureRules.autoConfirmNonSensitive} onChange={(v) => update({ captureRules: { ...settings.captureRules, autoConfirmNonSensitive: v } })} label="Auto-save captures that don't look sensitive" />
        <Spacer />
        <Switch checked={settings.captureRules.warnOnSensitive} onChange={(v) => update({ captureRules: { ...settings.captureRules, warnOnSensitive: v } })} label="Always confirm before saving cookies, tokens, or storage" />
        <Spacer />
        <Switch checked={settings.captureRules.blurScreenshotsByDefault} onChange={(v) => update({ captureRules: { ...settings.captureRules, blurScreenshotsByDefault: v } })} label="Prompt to blur sensitive regions before saving screenshots" />
        <div style={{ height: 12 }} />
        <Switch checked={settings.privacy.captureConsoleLogs} onChange={(v) => update({ privacy: { ...settings.privacy, captureConsoleLogs: v } })} label="Include console logs in captures (off by default)" />
        <Spacer />
        <Switch checked={settings.privacy.captureIndexedDbMetadata} onChange={(v) => update({ privacy: { ...settings.privacy, captureIndexedDbMetadata: v } })} label="Include IndexedDB database names (metadata only, never record contents)" />
      </Section>

      <Section icon={<Bell size={15} />} title="Notifications">
        <Switch checked={settings.notifications.onCaptureSaved} onChange={(v) => update({ notifications: { ...settings.notifications, onCaptureSaved: v } })} label="Notify when a capture is saved" />
        <Spacer />
        <Switch checked={settings.notifications.onJobComplete} onChange={(v) => update({ notifications: { ...settings.notifications, onJobComplete: v } })} label="Notify when a recon/scan job completes" />
        <Spacer />
        <Switch checked={settings.notifications.onFindingCreated} onChange={(v) => update({ notifications: { ...settings.notifications, onFindingCreated: v } })} label="Notify when a new Finding is created" />
      </Section>

      <Section icon={<Keyboard size={15} />} title="Keyboard Shortcuts">
        <Switch checked={settings.keyboardShortcutsEnabled} onChange={(v) => update({ keyboardShortcutsEnabled: v })} label="Enable keyboard shortcuts" />
        <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 10, lineHeight: 1.8 }}>
          <div>Open Side Panel — Ctrl/Cmd+Shift+P</div>
          <div>Save current URL — Ctrl/Cmd+Shift+U</div>
          <div>Capture screenshot — Ctrl/Cmd+Shift+S</div>
          <div>Toggle voice assistant — Ctrl/Cmd+Shift+V</div>
        </div>
        <Button variant="outline" style={{ marginTop: 10 }} onClick={() => chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}>
          Customize shortcuts
        </Button>
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {icon}
        <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
      </div>
      {children}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Spacer() {
  return <div style={{ height: 8 }} />;
}
