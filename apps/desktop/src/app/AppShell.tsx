import { NavLink, Outlet } from "react-router-dom";
import { FolderKanban, LayoutDashboard, MessageSquare, Moon, Search, Settings, Sun, SunMoon } from "lucide-react";
import { CommandPalette } from "./CommandPalette";
import { Kbd } from "../components/ui";
import { useThemeStore } from "../hooks/useTheme";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/chat", label: "AI Chat", icon: MessageSquare },
  { to: "/settings", label: "Settings", icon: Settings },
];

function ThemeToggle() {
  const { preference, setPreference } = useThemeStore();
  const cycle = () => setPreference(preference === "light" ? "dark" : preference === "dark" ? "system" : "light");
  const Icon = preference === "light" ? Sun : preference === "dark" ? Moon : SunMoon;
  return (
    <button
      onClick={cycle}
      title={`Theme: ${preference} (click to change)`}
      style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 6, borderRadius: "var(--radius-sm)" }}
    >
      <Icon size={16} />
    </button>
  );
}

/// Root layout: fixed sidebar + content outlet, matching the web app's
/// dashboard shell (`apps/web/app/(dashboard)/layout.tsx`) closely enough
/// that switching between the two feels like the same product, while
/// staying desktop-native (no responsive collapse — this is a fixed-size
/// native window, not a browser tab that gets resized to phone widths).
export function AppShell() {
  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden" }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: "1px solid var(--color-border)",
          background: "var(--color-bg-subtle)",
          display: "flex",
          flexDirection: "column",
          padding: "16px 10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 16px", fontWeight: 700, fontSize: 14 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--color-primary)" }} />
          PentestHub AI
        </div>

        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            marginBottom: 12,
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg)",
            color: "var(--color-text-muted)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <Search size={13} />
          Search…
          <span style={{ marginLeft: "auto" }}>
            <Kbd>⌘K</Kbd>
          </span>
        </button>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
                color: isActive ? "var(--color-primary)" : "var(--color-text)",
                background: isActive ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "transparent",
              })}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>v0.1.0</span>
          <ThemeToggle />
        </div>
      </aside>

      <main style={{ flex: 1, overflow: "auto" }}>
        <Outlet />
      </main>

      <CommandPalette />
    </div>
  );
}
