import { useEffect, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { desktopApi, type VoiceSettings } from "../../lib/tauri-client";
import { Badge, Button, Card, Input } from "../../components/ui";

export function VoiceSettingsPanel() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["voice-settings"], queryFn: desktopApi.getVoiceSettings });
  const availabilityQuery = useQuery({ queryKey: ["voice-availability"], queryFn: desktopApi.voiceBackendAvailability });

  const [local, setLocal] = useState<VoiceSettings | null>(null);
  useEffect(() => {
    if (settingsQuery.data && !local) setLocal(settingsQuery.data);
  }, [settingsQuery.data, local]);

  const saveMutation = useMutation({
    mutationFn: (settings: VoiceSettings) => desktopApi.setVoiceSettings(settings),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["voice-settings"] }),
  });

  if (!local) return null;

  const update = (patch: Partial<VoiceSettings>) => setLocal({ ...local, ...patch });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Speech-to-Text</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <BackendOption label="Browser (Web Speech API)" active={local.sttBackend === "WEB_SPEECH"} onClick={() => update({ sttBackend: "WEB_SPEECH" })} />
          <BackendOption
            label="Local (whisper.cpp)"
            active={local.sttBackend === "WHISPER"}
            onClick={() => update({ sttBackend: "WHISPER" })}
            badge={availabilityQuery.data ? (availabilityQuery.data.whisper ? "installed" : "not found") : undefined}
          />
        </div>
        {local.sttBackend === "WHISPER" && (
          <Input
            placeholder="Path to whisper.cpp ggml model (e.g. ggml-base.en.bin)"
            value={local.whisperModelPath ?? ""}
            onChange={(e) => update({ whisperModelPath: e.target.value || null })}
          />
        )}
      </Card>

      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Text-to-Speech</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <BackendOption label="Browser (Web Speech API)" active={local.ttsBackend === "WEB_SPEECH"} onClick={() => update({ ttsBackend: "WEB_SPEECH" })} />
          <BackendOption
            label="Local (Piper)"
            active={local.ttsBackend === "PIPER"}
            onClick={() => update({ ttsBackend: "PIPER" })}
            badge={availabilityQuery.data ? (availabilityQuery.data.piper ? "installed" : "not found") : undefined}
          />
        </div>
        {local.ttsBackend === "PIPER" && (
          <Input placeholder="Path to Piper voice model (.onnx)" value={local.piperModelPath ?? ""} onChange={(e) => update({ piperModelPath: e.target.value || null })} />
        )}
      </Card>

      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Behavior</div>
        <label style={checkboxRow}>
          <input type="checkbox" checked={local.pushToTalk} onChange={(e) => update({ pushToTalk: e.target.checked })} />
          Push-to-talk (hold to record instead of continuous listening)
        </label>
        <label style={checkboxRow}>
          <input type="checkbox" checked={local.continuousListening} onChange={(e) => update({ continuousListening: e.target.checked })} />
          Continuous listening
        </label>
        <label style={checkboxRow}>
          <input type="checkbox" checked={local.readResponsesAloud} onChange={(e) => update({ readResponsesAloud: e.target.checked })} />
          Automatically read AI responses aloud
        </label>
        <label style={checkboxRow}>
          <input type="checkbox" checked={local.interruptOnNewMessage} onChange={(e) => update({ interruptOnNewMessage: e.target.checked })} />
          New speech interrupts (barge-in) current playback
        </label>
      </Card>

      <div>
        <Button variant="primary" loading={saveMutation.isPending} onClick={() => saveMutation.mutate(local)}>
          Save Voice Settings
        </Button>
      </div>
    </div>
  );
}

function BackendOption({ label, active, onClick, badge }: { label: string; active: boolean; onClick: () => void; badge?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px",
        borderRadius: "var(--radius-sm)",
        border: active ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
        background: active ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "var(--color-bg)",
        color: active ? "var(--color-primary)" : "var(--color-text)",
        cursor: "pointer",
        fontSize: 12.5,
      }}
    >
      {label}
      {badge && <Badge tone={badge === "installed" ? "success" : "default"}>{badge}</Badge>}
    </button>
  );
}

const checkboxRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 0" };
