import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { ProjectDetailPage } from "../features/projects/ProjectDetailPage";
import { ChatPage } from "../features/chat/ChatPage";
import { SettingsLayout } from "../features/settings/SettingsLayout";
import { AppearanceSettings } from "../features/settings/AppearanceSettings";
import { AiProvidersSettings } from "../features/settings/AiProvidersSettings";
import { VoiceSettingsPanel } from "../features/settings/VoiceSettingsPanel";
import { SyncSettingsPanel } from "../features/settings/SyncSettingsPanel";
import { ToolsSettingsPanel } from "../features/settings/ToolsSettingsPanel";
import { PluginsSettingsPanel } from "../features/settings/PluginsSettingsPanel";
import { ExtensionBridgeSettingsPanel } from "../features/settings/ExtensionBridgeSettingsPanel";
import { SecuritySettingsPanel } from "../features/settings/SecuritySettingsPanel";
import { UpdatesSettingsPanel } from "../features/settings/UpdatesSettingsPanel";

/// Root router — `HashRouter` rather than `BrowserRouter` since the
/// production build is served from a `tauri://localhost` / `file://`
/// asset root, not a real HTTP server with history-API fallback; hash
/// routing needs no server cooperation at all, which matters for a
/// desktop app with no server in the loop.
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="appearance" replace />} />
            <Route path="appearance" element={<AppearanceSettings />} />
            <Route path="ai" element={<AiProvidersSettings />} />
            <Route path="voice" element={<VoiceSettingsPanel />} />
            <Route path="sync" element={<SyncSettingsPanel />} />
            <Route path="tools" element={<ToolsSettingsPanel />} />
            <Route path="plugins" element={<PluginsSettingsPanel />} />
            <Route path="extension" element={<ExtensionBridgeSettingsPanel />} />
            <Route path="security" element={<SecuritySettingsPanel />} />
            <Route path="updates" element={<UpdatesSettingsPanel />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
