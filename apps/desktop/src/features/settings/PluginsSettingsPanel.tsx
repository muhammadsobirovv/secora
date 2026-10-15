import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Power, Trash2 } from "lucide-react";
import { desktopApi, type PluginManifest } from "../../lib/tauri-client";
import { Badge, Button, Card, Input } from "../../components/ui";

/// Plugin Manager — install from one of the built-in templates (Nmap,
/// Burp Suite CLI, OWASP ZAP, Metasploit, Custom Script), point it at a
/// local binary/script, enable/disable/uninstall. Execution itself
/// (`run_plugin`) happens from wherever a target is selected (Project
/// detail's Targets tab in a full implementation); this page is
/// install/configure only.
export function PluginsSettingsPanel() {
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({ queryKey: ["plugin-templates"], queryFn: desktopApi.listPluginTemplates });
  const pluginsQuery = useQuery({ queryKey: ["plugins"], queryFn: desktopApi.listPlugins });

  const [installing, setInstalling] = useState<string | null>(null);
  const [binaryOverride, setBinaryOverride] = useState("");

  const installMutation = useMutation({
    mutationFn: ({ name, version, manifest }: { name: string; version: string; manifest: PluginManifest }) =>
      desktopApi.installPlugin(name, version, manifest),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["plugins"] });
      setInstalling(null);
      setBinaryOverride("");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => desktopApi.setPluginEnabled(id, enabled),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["plugins"] }),
  });

  const uninstallMutation = useMutation({
    mutationFn: (id: string) => desktopApi.uninstallPlugin(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["plugins"] }),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Add a plugin</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {templatesQuery.data?.map(([name]) => (
            <Button key={name} size="sm" variant="outline" onClick={() => setInstalling(installing === name ? null : name)}>
              <Plus size={12} /> {name}
            </Button>
          ))}
        </div>

        {installing && templatesQuery.data && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
            {(() => {
              const template = templatesQuery.data.find(([name]) => name === installing);
              if (!template) return null;
              const [name, manifest] = template;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{manifest.description}</div>
                  <Input
                    placeholder={`Binary/script path (default: ${manifest.binary || "none — required"})`}
                    value={binaryOverride}
                    onChange={(e) => setBinaryOverride(e.target.value)}
                  />
                  <div>
                    <Button
                      size="sm"
                      variant="primary"
                      loading={installMutation.isPending}
                      onClick={() =>
                        installMutation.mutate({
                          name,
                          version: "1.0.0",
                          manifest: { ...manifest, binary: binaryOverride || manifest.binary },
                        })
                      }
                    >
                      Install
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pluginsQuery.data?.map((plugin) => (
          <Card key={plugin.id} style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {plugin.name} <Badge tone={plugin.enabled ? "success" : "default"}>{plugin.enabled ? "enabled" : "disabled"}</Badge>
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                {plugin.manifest.binary} {plugin.manifest.argsTemplate.join(" ")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: plugin.id, enabled: !plugin.enabled })}>
                <Power size={12} /> {plugin.enabled ? "Disable" : "Enable"}
              </Button>
              <Button size="sm" variant="danger" onClick={() => uninstallMutation.mutate(plugin.id)}>
                <Trash2 size={12} />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
